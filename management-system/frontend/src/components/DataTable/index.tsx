import { Colour, QuerySort } from "@frontend/lib";
import { For, JSXElement } from "npm:solid-js";
import { Button } from "../Button/index.tsx";

interface Props<TRow> {
  columns: readonly DataTableColumn<TRow>[];
  rowActions?: readonly RowAction<TRow>[];
  rows: readonly TRow[];
  sort?: QuerySort;
  onSort?: (colName: string) => void;
}

export interface DataTableColumn<TRow> {
  name: string;
  label?: string;
  render: (row: TRow) => JSXElement;
}

interface RowAction<TRow> {
  name: string;
  colour: Colour;
  onClick: (row: TRow) => void | Promise<void>;
}

export function DataTable<TRow>(props: Props<TRow>) {
  const columns = props.columns.slice(0);

  if (props.rowActions?.length ?? 0 > 0) {
    columns.push({
      name: "actions",
      label: "",
      render: (row) => {
        return (
          <div class="d-md-flex gap-2 justify-content-md-end align-items-center text-nowrap">
            <For each={props.rowActions}>
              {(action) => (
                <Button colour={action.colour} on:click={(e) => action.onClick(row)}>
                  {action.name}
                </Button>
              )}
            </For>
          </div>
        );
      },
    });
  }

  return (
    <div class="overflow-x-auto">
      <table class="table table-striped table-bordered mb-0">
        <thead class="table-dark">
          <tr>
            <For each={columns}>
              {(column) => (
                <th
                  classList={{ ["column-" + column.name]: true }}
                  style={{ cursor: props.onSort ? "pointer" : undefined }}
                  onclick={() => props.onSort?.(column.name)}
                >
                  <div class="d-md-flex gap-2 align-items-center text-nowrap">
                    {column.label ?? column.name}
                    {props.sort?.sort === column.name &&
                      (props.sort?.dir === "asc" ? (
                        <span>&nbsp;↓</span>
                      ) : props.sort?.dir === "desc" ? (
                        <span>&nbsp;↑</span>
                      ) : undefined)}
                  </div>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr>
              <For each={columns}>{(column) => <td>{column.render(row)}</td>}</For>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
