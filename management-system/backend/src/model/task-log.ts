import { db, TaskLogTable } from "@/db";
import { keys, TaskLogFilter, TaskLogLevel, type TaskLogSelect } from "@door-entry-management-system/common";
import { and, count, desc, getTableColumns, ilike, inArray, or } from "drizzle-orm";
import * as v from "valibot";
import { Pagination, QuickSearch, type SessionUser, toDrizzleOrderBy } from "./common.ts";
import { type DataField, DataModel } from "./model.ts";

export const TaskLogFields = {
  id: { type: ["string", ""], select: true, create: false, update: false },
  level: { type: [TaskLogLevel, ""], select: true, create: false, update: false },
  job_started: { type: ["date", ""], select: true, create: false, update: false },
  type: { type: ["string", ""], select: true, create: false, update: false },
  created: { type: ["date", ""], select: true, create: false, update: false },
} as const satisfies Record<string, DataField>;

export const TaskLogSearch = v.intersect([Pagination, QuickSearch, v.object({ filter: TaskLogFilter })]);
export type TaskLogSearch = v.InferOutput<typeof TaskLogSearch>;

export const TaskLogGetFilterOptions = v.intersect([
  QuickSearch,
  v.object({ filter: TaskLogFilter, colName: v.picklist(keys(getTableColumns(TaskLogTable))) }),
]);
export type TaskLogGetFilterOptions = v.InferOutput<typeof TaskLogGetFilterOptions>;

export class TaskLogDataModel extends DataModel<typeof TaskLogFields, TaskLogSelect> {
  public override getCreateSchema() {
    return v.object({});
  }

  public override getUpdateSchema() {
    return v.object({});
  }

  public override async search(sessionUser: SessionUser, { take, skip, orderBy, search, filter }: TaskLogSearch) {
    this.assertRole(sessionUser, ["admin"]);

    const quickSearchCondition = search ? or(ilike(TaskLogTable.notes, `%${search}%`)) : and();

    const filterCondition = this.getFilterCondition(filter);

    const condition = and(quickSearchCondition, filterCondition);

    const rows: TaskLogSelect[] = await db
      .select({ ...getTableColumns(TaskLogTable) })
      .from(TaskLogTable)
      .where(condition)
      .limit(take)
      .offset(skip)
      .orderBy(toDrizzleOrderBy(TaskLogTable, orderBy));

    const [{ count: total }] = await db.select({ count: count() }).from(TaskLogTable).where(condition);

    return { rows, total } as const;
  }

  public getFilterOptions(sessionUser: SessionUser, { search, filter, colName }: TaskLogGetFilterOptions) {
    this.assertRole(sessionUser, ["admin"]);

    const quickSearchCondition = search ? or(ilike(TaskLogTable.notes, `%${search}%`)) : and();

    const filterCondition = this.getFilterCondition(filter, colName); // Exclude the current column we're finding options for

    const condition = and(quickSearchCondition, filterCondition);

    return db.selectDistinct({ value: TaskLogTable[colName] }).from(TaskLogTable).where(condition).orderBy(desc(TaskLogTable[colName]));
  }

  private getFilterCondition(filter: TaskLogFilter, exclude?: string) {
    return and(
      filter.level && exclude !== "level" ? inArray(TaskLogTable.level, filter.level) : undefined,
      filter.type && exclude !== "type" ? inArray(TaskLogTable.type, filter.type) : undefined,
      filter.job_started && exclude !== "job_started" ? inArray(TaskLogTable.job_started, filter.job_started) : undefined,
    );
  }

  public override async getOne(sessionUser: SessionUser, id: string): Promise<never> {
    throw new Error("Method not implemented.");
  }

  public override create(sessionUser: SessionUser, data: {}): Promise<string> {
    throw new Error("Method not implemented.");
  }

  public override update(sessionUser: SessionUser, id: string, data: {}): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public override delete(sessionUser: SessionUser, ids: string[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
