import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as v from "valibot";
import { ActivityLogTable, db, UserTable } from "@/db";
import { PaginationSchema, toDrizzleOrderBy } from "./common.ts";
import { tRPC } from "./trpc.ts";

const ActivityLogSearchSchema = v.intersect([PaginationSchema]);

export const ActivityLogRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(ActivityLogSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search ? or(ilike(ActivityLogTable.code, `%${search}%`), ilike(UserTable.name, `%${search}%`)) : and();

      let user_id: string | undefined;

      // Normal users can only see logs belonging to them
      if (ctx.session.user.role !== "admin") {
        user_id = ctx.session.user.id;
      }

      const condition = and(quickSearchCondition, user_id ? eq(ActivityLogTable.user_id, user_id) : undefined);

      const query = db
        .select({ ...getTableColumns(ActivityLogTable), user_name: UserTable.name })
        .from(ActivityLogTable)
        .leftJoin(UserTable, eq(ActivityLogTable.user_id, UserTable.id))
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(ActivityLogTable, orderBy));

      const rows = await query;

      const [{ count: total }] = await db
        .select({ count: count() })
        .from(ActivityLogTable)
        .leftJoin(UserTable, eq(ActivityLogTable.user_id, UserTable.id))
        .where(condition);

      return { rows, total } as const;
    },
  ),
});
