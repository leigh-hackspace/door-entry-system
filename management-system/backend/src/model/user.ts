import { db, UserTable } from "@/db";
import { getHexEncodedSha256, GoCardlessService, scryptAsync } from "@/services";
import { omit, UserCreateSchema, UserRole, type UserSelect, UserUpdateSchema } from "@door-entry-management-system/common";
import { and, eq, getTableColumns, ilike, inArray, type InferSelectModel, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { assert } from "ts-essentials";
import * as uuid from "uuid";
import type * as v from "valibot";
import { assertOneRecord, type SessionUser, toDrizzleOrderBy } from "./common.ts";
import { type DataField, DataModel, type SearchArgs } from "./model.ts";

export const UserFields = {
  id: { type: ["string", ""], select: true, create: false, update: false },
  name: { type: ["string", ""], select: true, create: true, update: true },
  email: { type: ["string", ""], select: true, create: true, update: true },
  role: { type: [UserRole, ""], select: true, create: true, update: true },
  paidUp: { type: ["boolean", ""], select: true, create: false, update: false },
  imageUrl: { type: ["string", ""], select: true, create: false, update: false },
  newPassword: { type: ["string", ""], select: false, create: true, update: true },
  confirmPassword: { type: ["string", ""], select: false, create: true, update: true },
  created: { type: ["date", ""], select: true, create: false, update: false },
  updated: { type: ["date", ""], select: true, create: false, update: false },
} as const satisfies Record<string, DataField>;

type UserRecord = Omit<InferSelectModel<typeof UserTable>, "passwordHash" | "refreshToken" | "mfaData">;

export class UserDataModel extends DataModel<typeof UserFields, UserSelect> {
  public override getCreateSchema() {
    return UserCreateSchema;
  }

  public override getUpdateSchema() {
    return UserUpdateSchema;
  }

  private getSelectColumns() {
    return omit(getTableColumns(UserTable), ["passwordHash", "refreshToken", "mfaData"]);
  }

  private restrict(sessionUser: SessionUser) {
    if (sessionUser.role !== "admin") {
      return [eq(UserTable.id, sessionUser.id)];
    } else {
      return [];
    }
  }

  private async map(record: UserRecord) {
    const emailHash = await getHexEncodedSha256(record.email);

    return {
      ...record,
      imageUrl: `https://gravatar.com/avatar/${emailHash}`,
    };
  }

  public override async search(sessionUser: SessionUser, { take, skip, orderBy, search }: SearchArgs) {
    const quickSearchCondition = search ? or(ilike(UserTable.email, `%${search}%`), ilike(UserTable.name, `%${search}%`)) : and();

    const where = and(...this.restrict(sessionUser), quickSearchCondition);

    const { records, total } = await db.transaction(async (tx) => {
      const records = await tx
        .select(this.getSelectColumns())
        .from(UserTable)
        .where(where)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(UserTable, orderBy));

      const [{ total }] = await tx.select({ total: sql<number>`COUNT (1)` }).from(UserTable).where(where);

      return { records, total };
    });

    const rows = await Promise.all(records.map(this.map));

    return { rows, total } as const;
  }

  public override async getOne(sessionUser: SessionUser, id: string) {
    const where = and(...this.restrict(sessionUser), eq(UserTable.id, id));

    const user = assertOneRecord(await db.select(this.getSelectColumns()).from(UserTable).where(where));

    return this.map(user);
  }

  public override async create(sessionUser: SessionUser, data: v.InferOutput<ReturnType<this["getCreateSchema"]>>): Promise<string> {
    this.assertRole(sessionUser, ["admin"]);

    const { newPassword, confirmPassword, ...rest } = data;

    const id = uuid.v4();

    assert(newPassword === confirmPassword, "Passwords do not match");

    const passwordHash = await scryptAsync(newPassword, id);

    rest.email = rest.email.toLowerCase();

    await db.insert(UserTable).values({ id, ...rest, passwordHash });

    return id;
  }

  public override async update(
    sessionUser: SessionUser,
    id: string,
    data: v.InferOutput<ReturnType<this["getUpdateSchema"]>>,
  ): Promise<void> {
    const { newPassword, confirmPassword, ...rest } = data;

    const where = and(...this.restrict(sessionUser), eq(UserTable.id, id));

    const currentUser = assertOneRecord(await db.select().from(UserTable).where(where));

    const update: PgUpdateSetSource<typeof UserTable> = {
      ...rest,
      updated: new Date(),
    };

    if (rest.email) {
      update.email = rest.email.toLowerCase();

      if (!currentUser.gocardlessCustomerId) {
        try {
          const goCardlessService = new GoCardlessService();

          update.gocardlessCustomerId = await goCardlessService.getCustomerId(update.email);
        } catch (err: unknown) {
          console.error("Error resolving GoCardless Customer ID:", err);
        }
      }
    }

    if (newPassword) {
      assert(newPassword === confirmPassword, "Passwords do not match");

      update.passwordHash = await scryptAsync(newPassword, id);
    }

    await db.update(UserTable).set(update).where(where);
  }

  public override async delete(sessionUser: SessionUser, ids: string[]): Promise<void> {
    this.assertRole(sessionUser, ["admin"]);

    const where = inArray(UserTable.id, ids);

    await db.delete(UserTable).where(where);
  }
}
