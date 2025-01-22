import { eq } from "drizzle-orm";
import * as v from "valibot";
import { db } from "../db/index.ts";
import { ActivityLogTable, TagTable, UserTable } from "../db/schema.ts";
import { assertRole } from "./common.ts";
import { tRPC } from "./trpc.ts";

export const StatsRouter = tRPC.router({
  AdminStats: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async ({ ctx }) => {
    assertRole(ctx, "admin");

    const userCount = await db.$count(UserTable);
    const tagCount = await db.$count(TagTable);
    const scanCount = await db.$count(ActivityLogTable);

    return { userCount, tagCount, scanCount };
  }),

  UserStats: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async ({ ctx }) => {
    const tagCount = await db.$count(TagTable, eq(TagTable.user_id, ctx.session.user.id));
    const scanCount = await db.$count(ActivityLogTable, eq(ActivityLogTable.user_id, ctx.session.user.id));

    return { tagCount, scanCount };
  }),
});
