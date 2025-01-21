import { TagCreateSchema, TagUpdateSchema } from "@door-entry-management-system/common";
import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as uuid from "npm:uuid";
import * as v from "valibot";
import { db, TagTable } from "../db/index.ts";
import { UserTable } from "../db/schema.ts";
import { updateValidCodes } from "../services/index.ts";
import { assertOneRecord, assertRole, PaginationSchema, toDrizzleOrderBy, UUID, withId } from "./common.ts";
import { tRPC } from "./trpc.ts";

const TagSearchSchema = v.intersect([PaginationSchema]);

export const TagRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(TagSearchSchema)).query(
    async ({ input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search
        ? or(
            ilike(TagTable.code, `%${search}%`),
            ilike(TagTable.description, `%${search}%`),
            ilike(UserTable.name, `%${search}%`)
          )
        : and();

      const condition = and(quickSearchCondition);

      const query = db
        .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
        .from(TagTable)
        .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(TagTable, orderBy));

      const rows = await query;

      const [{ count: total }] = await db
        .select({ count: count() })
        .from(TagTable)
        .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
        .where(condition);

      return { rows, total } as const;
    }
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ input }) => {
    return assertOneRecord(await db.select().from(TagTable).where(eq(TagTable.id, input)));
  }),

  Create: tRPC.ProtectedProcedure.input(v.parser(TagCreateSchema)).mutation(async ({ ctx, input }) => {
    assertRole(ctx, "admin");

    const id = uuid.v4();

    await db.insert(TagTable).values({ id, ...input });

    await updateValidCodes();

    return id;
  }),

  Update: tRPC.ProtectedProcedure.input(v.parser(withId(TagUpdateSchema))).mutation(
    async ({ ctx, input: [id, fields] }) => {
      assertRole(ctx, "admin");

      await db
        .update(TagTable)
        .set({ ...fields, updated: new Date() })
        .where(eq(TagTable.id, id));

      await updateValidCodes();
    }
  ),

  Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
    assertRole(ctx, "admin");

    await db.delete(TagTable).where(eq(TagTable.id, input));

    await updateValidCodes();
  }),
});
