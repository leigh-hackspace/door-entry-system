// deno-lint-ignore-file no-explicit-any
import { camelToPascal, includes, keys, type RowSelection } from "@door-entry-management-system/common";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import type { JSXElement } from "solid-js";
import { assert } from "ts-essentials";
import type * as v from "valibot";
import { DataList } from "../DataList/index.tsx";
import { DataTable, type DataTableColumn } from "../DataTable/index.tsx";
import { Pagination } from "../Pagination/index.tsx";
import { type FetchParameters, getFieldInfo, type QuerySort } from "../helper.ts";

const PageSize = 25;

interface Props<
  TSchema extends v.ObjectSchema<any, any>,
  TRow extends v.InferInput<TSchema>,
> {
  title?: string;
  schema: TSchema;
  initialData?: readonly TRow[];
  initialSort?: QuerySort;
  initialPageSize?: number;
  cursor: readonly [cursor: () => Cursor, setCursor: (cursor: Cursor) => void];
  rowData: RowData<TRow>;
  selection: readonly [selection: () => RowSelection, setSelection: (selection: RowSelection) => void];
  acquireImage?: (row: TRow) => string;

  onRowClick?: (row: TRow) => Promise<void>;
}

export interface Cursor {
  page: number;
  pageSize: number;
  sort?: QuerySort;
}

export const CursorDefault: Cursor = Object.freeze({
  page: 1,
  pageSize: PageSize,
});

export interface RowData<TRow> {
  rows: readonly TRow[];
  total: number;
}

export const RowDataDefault: RowData<never> = {
  rows: [],
  total: 0,
};

export const RowSelectionDefault: RowSelection = {
  ids: [],
  mode: "noneBut",
};

type Overrides<TRow> = {
  [TProp in Extract<keyof TRow, string> as `render${Capitalize<TProp>}`]?: (
    row: TRow,
  ) => JSXElement;
};

export function MagicBrowser<
  TSchema extends v.ObjectSchema<any, any>,
  TRow extends v.InferInput<TSchema> & { id: string },
>(props: Props<TSchema, TRow> & Overrides<TRow>) {
  const propSchemas = Object.entries(props.schema.entries) as readonly (readonly [string, v.SchemaWithPipe<Array<any> & [any]>])[];

  const onPage = (page: number) => {
    const cursor = props.cursor[0]();

    props.cursor[1]({ ...cursor, page });
  };

  const onPageSize = (pageSize: number) => {
    const cursor = props.cursor[0]();

    props.cursor[1]({ ...cursor, pageSize });
  };

  const onSort = (colName: string) => {
    if (colName === "actions") return;

    const cursor = props.cursor[0]();

    if (cursor.sort?.sort === colName && cursor.sort.dir === "asc") {
      props.cursor[1]({ ...cursor, sort: { sort: colName, dir: "desc" } });
    } else {
      props.cursor[1]({ ...cursor, sort: { sort: colName, dir: "asc" } });
    }
  };

  const getColumns = (): readonly DataTableColumn<TRow>[] => {
    return propSchemas.map(([propName]) => {
      const { title, metadata } = getFieldInfo(props.schema, propName);

      return {
        name: propName,
        label: title ?? "???",
        icon: metadata?.icon,
        displayMode: metadata?.displayMode,
        render: (row): JSXElement => {
          const overrideName = `render${camelToPascal(propName)}`;

          if (includes(overrideName, keys(props)) && typeof props[overrideName] === "function") {
            return props[overrideName](row);
          }

          assert(includes(propName, keys(row)), `Property "${propName}" not in row!`);

          return renderValue(row[propName], propName);
        },
      };
    });
  };

  const desktop = false;

  const TableHeader = () => (
    <>
      {props.title && <div>{props.title}</div>}
    </>
  );

  if (desktop) {
    const TableFooter = () => (
      <Pagination
        page={props.cursor[0]().page}
        pageSize={PageSize}
        count={props.rowData.total}
        onPage={onPage}
      />
    );

    return (
      <div class="magic-browser d-flex flex-column gap-3">
        <TableHeader />
        <DataTable
          columns={getColumns()}
          rows={props.rowData.rows}
          sort={props.cursor[0]().sort}
          onSort={onSort}
          acquireImage={props.acquireImage}
        />
        <TableFooter />
      </div>
    );
  } else {
    const onLoadMore = () => {
      if (props.cursor[0]().pageSize < props.rowData.total) {
        onPageSize(props.cursor[0]().pageSize + props.cursor[0]().pageSize);
      }
    };

    const onSelectionChanged = (row: TRow) => {
      const { ids, mode } = props.selection[0]();

      if (props.selection[0]().ids.includes(row.id)) {
        props.selection[1]({ mode, ids: ids.filter((s) => s !== row.id) });
      } else {
        props.selection[1]({ mode, ids: [...ids, row.id] });
      }
    };

    const onSelectAll = () => {
      const { ids, mode } = props.selection[0]();

      props.selection[1]({ mode: mode === "allBut" ? "noneBut" : "allBut", ids });
    };

    return (
      <div class="magic-browser d-flex flex-column">
        <DataList
          columns={getColumns()}
          rows={props.rowData.rows}
          sort={props.cursor[0]().sort}
          selected={props.selection[0]().ids.map((id) => props.rowData.rows.find((r) => r.id === id)!)}
          selectAll={props.selection[0]().mode === "allBut"}
          onSort={onSort}
          onLoadMore={onLoadMore}
          onSelectionChanged={onSelectionChanged}
          // onSelectAll={onSelectAll}
          onRowClick={props.onRowClick}
          acquireImage={props.acquireImage}
        />
      </div>
    );
  }
}

function renderValue(value: unknown, propName: string): JSXElement {
  if (value === undefined) {
    return "[undefined]";
  }

  if (value === null) {
    return "[null]";
  }

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object" && value instanceof Date) {
    return (
      <span class="badge text-bg-secondary">
        {format(value, "PPp", { locale: enGB })}
      </span>
    );
  }

  return "!! Cannot format !!";
}

export function fetchParamsFromCursor(cursor: Cursor): FetchParameters {
  return {
    skip: (cursor.page - 1) * cursor.pageSize,
    take: cursor.pageSize,
    orderBy: cursor.sort ? [[cursor.sort.sort, cursor.sort.dir]] : [],
  };
}
