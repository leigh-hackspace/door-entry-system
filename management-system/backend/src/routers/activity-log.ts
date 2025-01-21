import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as v from "valibot";
import { ActivityLogTable, db, UserTable } from "../db/index.ts";
import { PaginationSchema, toDrizzleOrderBy } from "./common.ts";
import { tRPC } from "./trpc.ts";

const ActivityLogSearchSchema = v.intersect([PaginationSchema]);

export const ActivityLogRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(ActivityLogSearchSchema)).query(
    async ({ input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search
        ? or(ilike(ActivityLogTable.code, `%${search}%`), ilike(UserTable.name, `%${search}%`))
        : and();

      let codeFilterCondition = and();

      const condition = and(quickSearchCondition, codeFilterCondition);

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
    }
  ),
});
