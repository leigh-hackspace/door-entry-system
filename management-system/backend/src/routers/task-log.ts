import { db, TaskLogTable } from "@/db";
import { and, count, getTableColumns, ilike, or } from "drizzle-orm";
import * as v from "valibot";
import { assertRole, PaginationSchema, toDrizzleOrderBy } from "./common.ts";
import { tRPC } from "./trpc.ts";

const TaskLogSearchSchema = v.intersect([PaginationSchema]);

export const TaskLogRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(TaskLogSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search } }) => {
      assertRole(ctx, "admin");

      const quickSearchCondition = search ? or(ilike(TaskLogTable.notes, `%${search}%`)) : and();

      const condition = and(quickSearchCondition);

      const query = db
        .select({ ...getTableColumns(TaskLogTable) })
        .from(TaskLogTable)
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(TaskLogTable, orderBy));

      const rows = await query;

      const [{ count: total }] = await db.select({ count: count() }).from(TaskLogTable).where(condition);

      return { rows, total } as const;
    },
  ),
});
