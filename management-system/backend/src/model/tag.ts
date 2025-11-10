import { db, TagTable, UserTable } from "@/db";
import type { DeviceCollection } from "@/services";
import { TagCreateSchema, type TagSelect, TagUpdateSchema } from "@door-entry-management-system/common";
import { and, count, eq, getTableColumns, ilike, inArray, or } from "drizzle-orm";
import { assert } from "ts-essentials";
import * as uuid from "uuid";
import * as v from "valibot";
import { assertOneRecord, type SessionUser, toDrizzleOrderBy, UUID } from "./common.ts";
import { type DataField, DataModel, SearchArgs } from "./model.ts";

export const TagFields = {
  id: { type: ["string", ""], select: true, create: false, update: false },
  code: { type: ["string", ""], select: true, create: true, update: true },
  description: { type: ["string", ""], select: true, create: true, update: true },
  user_id: { type: ["string", "NO"], select: true, create: true, update: true },
  user_name: { type: ["string", "N"], select: true, create: false, update: false },
} as const satisfies Record<string, DataField>;

export const TagSearchArgs = v.intersect([SearchArgs, v.object({ user_id: v.optional(UUID) })]);
export type TagSearchArgs = v.InferOutput<typeof TagSearchArgs>;

export const AddCodeToUserReq = v.object({ code: v.string(), user_id: UUID });
export type AddCodeToUserReq = v.InferInput<typeof AddCodeToUserReq>;

export class TagDataModel extends DataModel<typeof TagFields, TagSelect> {
  constructor(private deviceCollection: DeviceCollection) {
    super();
  }

  public override getCreateSchema() {
    return TagCreateSchema;
  }

  public override getUpdateSchema() {
    return TagUpdateSchema;
  }

  private getSelectColumns() {
    return getTableColumns(TagTable);
  }

  private restrict(sessionUser: SessionUser) {
    if (sessionUser.role !== "admin") {
      return [eq(UserTable.id, sessionUser.id)];
    } else {
      return [];
    }
  }

  public override async search(sessionUser: SessionUser, { take, skip, orderBy, search, user_id }: TagSearchArgs) {
    const quickSearchCondition = search
      ? or(
        ilike(TagTable.code, `%${search}%`),
        ilike(TagTable.description, `%${search}%`),
        ilike(UserTable.name, `%${search}%`),
      )
      : and();

    // Normal users can only see tags belonging to them
    if (sessionUser.role !== "admin") {
      user_id = sessionUser.id;
    }

    const where = and(...this.restrict(sessionUser), quickSearchCondition, user_id ? eq(TagTable.user_id, user_id) : undefined);

    const query = db
      .select({ ...this.getSelectColumns(), user_name: UserTable.name })
      .from(TagTable)
      .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
      .where(where)
      .limit(take)
      .offset(skip)
      .orderBy(toDrizzleOrderBy(TagTable, orderBy, { user_name: UserTable.name }));

    const rows = await query;

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(TagTable)
      .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
      .where(where);

    return { rows, total } as const;
  }

  public override async getOne(sessionUser: SessionUser, id: string) {
    const where = and(...this.restrict(sessionUser), eq(UserTable.id, id));

    return assertOneRecord(
      await db.select({ ...this.getSelectColumns(), user_name: UserTable.name })
        .from(TagTable)
        .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
        .where(where),
    );
  }

  public override async create(sessionUser: SessionUser, data: v.InferOutput<ReturnType<this["getCreateSchema"]>>): Promise<string> {
    const id = uuid.v4();

    let user_id = data.user_id;

    if (sessionUser.role !== "admin") {
      user_id = sessionUser.id;
    }

    await db.insert(TagTable).values({ id, ...data, user_id });

    await this.deviceCollection.pushValidCodes();

    return id;
  }

  public override async update(
    sessionUser: SessionUser,
    id: string,
    data: v.InferOutput<ReturnType<this["getUpdateSchema"]>>,
  ): Promise<void> {
    const where = and(...this.restrict(sessionUser), eq(TagTable.id, id));

    await db
      .update(TagTable)
      .set({ ...data, updated: new Date() })
      .where(where);

    await this.deviceCollection.pushValidCodes();
  }

  public override async delete(sessionUser: SessionUser, ids: string[]): Promise<void> {
    const where = and(...this.restrict(sessionUser), inArray(TagTable.id, ids));

    await db.delete(TagTable).where(where);

    await this.deviceCollection.pushValidCodes();
  }

  public async addCodeToUser(sessionUser: SessionUser, req: AddCodeToUserReq) {
    this.assertRole(sessionUser, ["admin"]);

    const userToAddTag = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, req.user_id)));

    const [existingTag] = await db.select().from(TagTable).where(eq(TagTable.code, req.code));

    if (existingTag) {
      if (existingTag.user_id) {
        // Tag is already owned
        const [user] = await db.select().from(UserTable).where(eq(UserTable.id, existingTag.user_id));
        assert(user, "Tag assigned to non-existent user!");

        throw new Error(`Tag already exists and is assigned to "${user.email}"`);
      } else {
        // Update the existing tag (recycling this tag for a new owner)
        await db.update(TagTable).set({ user_id: req.user_id }).where(eq(TagTable.id, existingTag.id));
      }
    } else {
      const id = uuid.v4();

      // Create a new tag (never seen this tag before)
      await db.insert(TagTable).values({
        id,
        user_id: req.user_id,
        code: req.code,
        description: `Auto-generated tag for user "${userToAddTag.email}"`,
      });
    }

    await this.deviceCollection.pushValidCodes();
  }
}
