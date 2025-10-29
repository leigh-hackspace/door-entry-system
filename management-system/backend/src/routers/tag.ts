import { db, TagTable } from "@/db";
import type { DeviceCollection } from "@/services";
import { TagCreateSchema, TagUpdateSchema } from "@door-entry-management-system/common";
import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { UserTable } from "../db/schema.ts";
import { assertOneRecord, PaginationSchema, toDrizzleOrderBy, UUID, withId } from "./common.ts";
import { tRPC } from "./trpc.ts";

const TagSearchSchema = v.intersect([PaginationSchema, v.object({ user_id: v.optional(UUID) })]);

const AddCodeToUserReq = v.object({ code: v.string(), user_id: UUID });

export const TagRouter = (deviceCollectionWs: DeviceCollection) =>
  tRPC.router({
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

      await deviceCollectionWs.pushValidCodes();

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

        await deviceCollectionWs.pushValidCodes();
      },
    ),

    Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
      const tag = assertOneRecord(await db.select().from(TagTable).where(eq(TagTable.id, input)));

      // Admins can delete all, users can only delete own
      assert(ctx.session.user.role === "admin" || tag.user_id === ctx.session.user.id, "No permission");

      await db.delete(TagTable).where(eq(TagTable.id, input));

      await deviceCollectionWs.pushValidCodes();
    }),

    AddCodeToUser: tRPC.ProtectedProcedure.input(v.parser(AddCodeToUserReq)).mutation(async ({ ctx, input }) => {
      assert(ctx.session.user.role === "admin");

      const userToAddTag = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, input.user_id)));

      const [existingTag] = await db.select().from(TagTable).where(eq(TagTable.code, input.code));

      if (existingTag) {
        if (existingTag.user_id) {
          // Tag is already owned
          const [user] = await db.select().from(UserTable).where(eq(UserTable.id, existingTag.user_id));
          assert(user, "Tag assigned to non-existent user!");

          throw new Error(`Tag already exists and is assigned to "${user.email}"`);
        } else {
          // Update the existing tag (recycling this tag for a new owner)
          await db.update(TagTable).set({ user_id: input.user_id }).where(eq(TagTable.id, existingTag.id));
        }
      } else {
        const id = uuid.v4();

        // Create a new tag (never seen this tag before)
        await db.insert(TagTable).values({
          id,
          user_id: input.user_id,
          code: input.code,
          description: `Auto-generated tag for user "${userToAddTag.email}"`,
        });
      }

      await deviceCollectionWs.pushValidCodes();
    }),
  });
