import type { PickOfValue, UserRole } from "@door-entry-management-system/common";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { Pagination, QuickSearch, SessionUser } from "./common.ts";

type DataFieldType = "string" | "number" | "boolean" | "date" | "object" | "unknown" | readonly string[];

type TypeToString<T> = T extends string ? "string"
  : T extends number ? "number"
  : T extends boolean ? "boolean"
  : T extends Date ? "date"
  : T extends object ? "object"
  : "unknown";

type StringToType<T> = T extends "string" ? string
  : T extends "number" ? number
  : T extends "boolean" ? boolean
  : T extends "date" ? Date
  : T extends ReadonlyArray<infer TPicklist> ? TPicklist
  : T extends "object" ? object
  : never;

type TypeFlagsToType<T extends string> = T extends "N" ? null : T extends "O" ? undefined : T extends "NO" ? null | undefined : never;

type TupleToType<T> = T extends [string | readonly string[], "" | "N" | "O" | "NO"] ? StringToType<T[0]> | TypeFlagsToType<T[1]> : never;

export interface DataField<TType extends [DataFieldType, string] = [DataFieldType, string]> {
  type: TType;
  select: boolean;
  create: boolean;
  update: boolean;
}

// Extract the field filtering logic
export type FieldsWithSelect<TFields extends Record<string, DataField>> = PickOfValue<TFields, { select: true }>;

type FieldsWithCreate<TFields extends Record<string, DataField>> = PickOfValue<TFields, { create: true }>;

type FieldsWithUpdate<TFields extends Record<string, DataField>> = PickOfValue<TFields, { update: true }>;

// Extract the schema mapping logic
type FieldToSchema<T extends DataField> = v.BaseSchema<
  TupleToType<T["type"]>,
  TupleToType<T["type"]>,
  v.BaseIssue<unknown>
>;

type FieldsToSchemaObject<TFields extends Record<string, DataField>> = {
  [P in keyof TFields]: undefined extends TupleToType<TFields[P]["type"]> ? v.OptionalSchema<FieldToSchema<TFields[P]>, undefined>
    : FieldToSchema<TFields[P]>;
};

export type FieldsToObject<TFields extends Record<string, DataField>> = {
  [P in keyof TFields]: TupleToType<TFields[P]["type"]>;
};

interface RowData<TRow> {
  rows: readonly TRow[];
  total: number;
}

export const SearchArgs = v.intersect([Pagination, QuickSearch]);
export type SearchArgs = v.InferOutput<typeof SearchArgs>;

export abstract class DataModel<
  TFields extends Record<string, DataField>,
  TSelect extends FieldsToObject<FieldsWithSelect<TFields>>,
> {
  public abstract getCreateSchema(): v.ObjectSchema<
    FieldsToSchemaObject<FieldsWithCreate<TFields>>,
    undefined
  >;

  public abstract getUpdateSchema(): v.SchemaWithPartial<
    v.ObjectSchema<FieldsToSchemaObject<FieldsWithUpdate<TFields>>, undefined>,
    undefined
  >;

  public abstract search(sessionUser: SessionUser, args: SearchArgs): Promise<RowData<TSelect>>;

  public abstract getOne(sessionUser: SessionUser, id: string): Promise<TSelect>;

  public abstract create(sessionUser: SessionUser, data: v.InferOutput<ReturnType<this["getCreateSchema"]>>): Promise<string>;

  public abstract update(sessionUser: SessionUser, id: string, data: v.InferOutput<ReturnType<this["getUpdateSchema"]>>): Promise<void>;

  public abstract delete(sessionUser: SessionUser, ids: string[]): Promise<void>;

  protected assertRole(sessionUser: SessionUser, roles: UserRole[]) {
    assert(roles.includes(sessionUser.role), `Must be role of ["${roles.join('","')}"]. You are "${sessionUser.role ?? "Anon"}."`);
  }
}
