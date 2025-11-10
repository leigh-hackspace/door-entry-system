import type { MfaData, TableType } from "@/db";
import { includes, keys } from "@door-entry-management-system/common";
import { asc, desc } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm/utils";
import * as v from "valibot";

/** Fail if anything other than a single record is returned in a query */
export function assertOneRecord<T>(records: readonly T[]): T {
  if (records.length === 1) return records[0];
  throw new Error(`Expected a single record but found ${records.length}`);
}

export function toDrizzleOrderBy(
  table: TableType,
  orderBy: Pagination["orderBy"],
  joinColumns: Record<string, PgColumn> = {},
) {
  let orderByClause = asc(table.created);

  if (orderBy.length > 0) {
    const [colName, dir] = orderBy[0];

    let column: PgColumn | undefined;

    if (includes(colName, keys(getTableColumns(table)))) {
      column = table[colName];
    }

    if (colName in joinColumns) {
      column = joinColumns[colName];
    }

    if (column) {
      if (dir === "asc") orderByClause = asc(column);
      if (dir === "desc") orderByClause = desc(column);
    } else {
      console.warn("toDrizzleOrderBy: Could not resolve column:", colName);
    }
  }

  return orderByClause;
}

export const Pagination = v.object({
  take: v.pipe(v.number(), v.minValue(0)),
  skip: v.pipe(v.number(), v.minValue(0)),
  orderBy: v.array(v.pipe(v.tuple([v.string(), v.picklist(["asc", "desc"])]), v.readonly())),
});

export type Pagination = v.InferOutput<typeof Pagination>;

export const QuickSearch = v.object({
  search: v.optional(v.string()),
});

export type QuickSearch = v.InferOutput<typeof QuickSearch>;

export const UUID = v.pipe(v.string(), v.uuid());

// deno-lint-ignore no-explicit-any
export function withId<TSchema extends v.ObjectSchema<any, any>>(schema: TSchema) {
  return v.tuple([UUID, schema] as const);
}

export interface SessionUser {
  id: string;
  role: "admin" | "user";
  name: string;
  email: string;
  passwordHash: string;
  refreshToken: string | null;
  gocardlessCustomerId: string | null;
  notes: string | null;
  paidUp: boolean;
  mfaData: MfaData;
  created: Date;
  updated: Date;
}
