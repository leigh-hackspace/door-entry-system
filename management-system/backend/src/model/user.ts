import { db, PaymentTable, UserTable } from "@/db";
import { getHexEncodedSha256, GoCardlessService, scryptAsync } from "@/services";
import { omit, type UserCreate, type UserRecord, type UserUpdate } from "@door-entry-management-system/common";
import { and, eq, getTableColumns, ilike, inArray, type InferSelectModel, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { assert } from "ts-essentials";
import * as uuid from "uuid";
import { assertOneRecord, assertRole, type SessionUser, toDrizzleOrderBy } from "./common.ts";
import type { SearchArgs } from "./model.ts";

type UserRow = Omit<InferSelectModel<typeof UserTable>, "passwordHash" | "refreshToken" | "mfaData">;

export class UserDataModel {
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

  private async map(record: UserRow): Promise<UserRecord> {
    const emailHash = await getHexEncodedSha256(record.email);

    return {
      ...record,
      imageUrl: `https://gravatar.com/avatar/${emailHash}`,
    };
  }

  public async search(sessionUser: SessionUser, { take, skip, orderBy, search }: SearchArgs) {
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

  public async getOne(sessionUser: SessionUser, id: string) {
    const where = and(...this.restrict(sessionUser), eq(UserTable.id, id));

    const user = assertOneRecord(await db.select(this.getSelectColumns()).from(UserTable).where(where));

    return this.map(user);
  }

  public async getUserPayments(sessionUser: SessionUser, id: string) {
    return db.select({
      id: PaymentTable.id,
      chargeDate: PaymentTable.chargeDate,
      amount: PaymentTable.amount,
      description: PaymentTable.description,
      status: PaymentTable.status,
    }).from(PaymentTable).where(
      eq(PaymentTable.userId, id),
    );
  }

  public async create(sessionUser: SessionUser, data: UserCreate) {
    assertRole(sessionUser, ["admin"]);

    const { newPassword, confirmPassword, ...rest } = data;

    const id = uuid.v4();

    assert(newPassword === confirmPassword, "Passwords do not match");

    const passwordHash = await scryptAsync(newPassword, id);

    rest.email = rest.email.toLowerCase();

    await db.insert(UserTable).values({ id, ...rest, passwordHash });

    return id;
  }

  public async update(sessionUser: SessionUser, id: string, data: UserUpdate) {
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

  public async delete(sessionUser: SessionUser, ids: string[]) {
    assertRole(sessionUser, ["admin"]);

    const where = inArray(UserTable.id, ids);

    await db.delete(UserTable).where(where);
  }
}
