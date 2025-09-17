import { TagCreateSchema, TagUpdateSchema } from "@door-entry-management-system/common";
import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { db, TagTable } from "@/db";
import { UserTable } from "../db/schema.ts";
import { GlobalDeviceCollection, GlobalDeviceCollectionWs } from "@/services";
import { assertOneRecord, PaginationSchema, toDrizzleOrderBy, UUID, withId } from "./common.ts";
import { tRPC } from "./trpc.ts";

const TagSearchSchema = v.intersect([PaginationSchema, v.object({ user_id: v.optional(UUID) })]);

export const TagRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(TagSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search, user_id } }) => {
      const quickSearchCondition = search
        ? or(
          ilike(TagTable.code, `%${search}%`),
          ilike(TagTable.description, `%${search}%`),
          ilike(UserTable.name, `%${search}%`),
        )
        : and();

      // Normal users can only see tags belonging to them
      if (ctx.session.user.role !== "admin") {
        user_id = ctx.session.user.id;
      }

      const condition = and(quickSearchCondition, user_id ? eq(TagTable.user_id, user_id) : undefined);

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
    },
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ input }) => {
    return assertOneRecord(await db.select().from(TagTable).where(eq(TagTable.id, input)));
  }),

  Create: tRPC.ProtectedProcedure.input(v.parser(TagCreateSchema)).mutation(async ({ ctx, input }) => {
    const id = uuid.v4();

    let user_id = input.user_id;

    if (ctx.session.user.role !== "admin") {
      user_id = ctx.session.user.id;
    }

    await db.insert(TagTable).values({ id, ...input, user_id });

    await GlobalDeviceCollection.pushValidCodes();
    await GlobalDeviceCollectionWs.pushValidCodes();

    return id;
  }),

  Update: tRPC.ProtectedProcedure.input(v.parser(withId(TagUpdateSchema))).mutation(
    async ({ ctx, input: [id, fields] }) => {
      const { ...rest } = fields;

      await db.transaction(async (tx) => {
        const tag = assertOneRecord(await tx.select().from(TagTable).where(eq(TagTable.id, id)));
        // Admins can edit all, users can only edit own
        assert(ctx.session.user.role === "admin" || tag.user_id === ctx.session.user.id, "No permission");

        await tx
          .update(TagTable)
          .set({ ...rest, updated: new Date() })
          .where(eq(TagTable.id, id));
      });

      await GlobalDeviceCollection.pushValidCodes();
      await GlobalDeviceCollectionWs.pushValidCodes();
    },
  ),

  Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
    const tag = assertOneRecord(await db.select().from(TagTable).where(eq(TagTable.id, input)));

    // Admins can delete all, users can only delete own
    assert(ctx.session.user.role === "admin" || tag.user_id === ctx.session.user.id, "No permission");

    await db.delete(TagTable).where(eq(TagTable.id, input));

    await GlobalDeviceCollection.pushValidCodes();
  }),
});
