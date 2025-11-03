import { db, TaskLogTable } from "@/db";
import { keys, TaskLogFilter } from "@door-entry-management-system/common";
import { and, count, desc, getTableColumns, ilike, inArray, or } from "drizzle-orm";
import * as v from "valibot";
import { assertRole, PaginationSchema, SearchSchema, toDrizzleOrderBy } from "./common.ts";
import { tRPC } from "./trpc.ts";

const TaskLogSearchSchema = v.intersect([PaginationSchema, SearchSchema, v.object({ filter: TaskLogFilter })]);
const TaskLogGetFilterOptionsSchema = v.intersect([
  SearchSchema,
  v.object({ filter: TaskLogFilter, colName: v.picklist(keys(getTableColumns(TaskLogTable))) }),
]);

export const TaskLogRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(TaskLogSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search, filter } }) => {
      assertRole(ctx, "admin");

      const quickSearchCondition = search ? or(ilike(TaskLogTable.notes, `%${search}%`)) : and();

      const filterCondition = and(
        filter.level ? inArray(TaskLogTable.level, filter.level) : undefined,
        filter.type ? inArray(TaskLogTable.type, filter.type) : undefined,
        filter.job_started ? inArray(TaskLogTable.job_started, filter.job_started) : undefined,
      );

      const condition = and(quickSearchCondition, filterCondition);

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

  GetFilterOptions: tRPC.ProtectedProcedure.input(v.parser(TaskLogGetFilterOptionsSchema)).query(
    async ({ ctx, input: { search, filter, colName } }) => {
      assertRole(ctx, "admin");

      const quickSearchCondition = search ? or(ilike(TaskLogTable.notes, `%${search}%`)) : and();

      const filterCondition = and(
        filter.level ? inArray(TaskLogTable.level, filter.level) : undefined,
        filter.type ? inArray(TaskLogTable.type, filter.type) : undefined,
        filter.job_started ? inArray(TaskLogTable.job_started, filter.job_started) : undefined,
      );

      const condition = and(quickSearchCondition, filterCondition);

      return db.selectDistinct({ value: TaskLogTable[colName] }).from(TaskLogTable).where(condition).orderBy(desc(TaskLogTable[colName]));
    },
  ),
});
