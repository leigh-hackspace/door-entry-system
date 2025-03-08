import { debounce, getScrollingAncestor } from "@frontend/helper";
import type { Colour, QuerySort } from "@frontend/lib";
import { For, Show, type JSXElement } from "npm:solid-js";
import { onMount } from "solid-js";
import { Button } from "../Button/index.tsx";

interface Props<TRow> {
  columns: readonly DataListColumn<TRow>[];
  rowActions?: readonly RowAction<TRow>[];
  rows: readonly TRow[];
  sort?: QuerySort;
  onSort?: (colName: string) => void;
  onLoadMore?: () => void;
  acquireImage?: (row: TRow) => string;
}

export interface DataListColumn<TRow> {
  name: string;
  label?: string;
  displayMode?: string;
  icon?: string;
  render: (row: TRow) => JSXElement;
}

interface RowAction<TRow> {
  name: string;
  colour: Colour;
  onClick: (row: TRow) => void | Promise<void>;
}

export function DataList<TRow>(props: Props<TRow>) {
  let ul: HTMLUListElement;
  let scroller: HTMLElement | undefined;

  const isNearBottom = () => {
    return scroller ? scroller.scrollTop >= scroller.scrollHeight - scroller.offsetHeight * 2 : false;
  };

  const onLoadMoreDebounced = debounce(() => {
    if (isNearBottom()) props.onLoadMore?.();
  }, 100);

  onMount(() => {
    scroller = getScrollingAncestor(ul);

    if (scroller) {
      scroller.addEventListener("scroll", (e) => {
        if (isNearBottom()) onLoadMoreDebounced();
      });
    }
  });

  const columns = props.columns.slice(0);

  if (props.rowActions?.length ?? 0 > 0) {
    columns.push({
      name: "actions",
      label: "Actions",
      displayMode: "raw",
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

  const dataColumns = columns.filter((c) => !["created", "updated", "actions"].includes(c.name));

  const updatedColumn = columns.find((c) => c.name === "updated");
  const createdColumn = columns.find((c) => c.name === "created");
  const actionsColumn = columns.find((c) => c.name === "actions");

  return (
    <ul class="list-group data-list" ref={(_ul) => (ul = _ul)}>
      <For each={props.rows}>
        {(row) => (
          <li class="list-group-item data-item">
            <div class="data-item-values-and-image">
              <Show when={props.acquireImage}>
                {(acquireImage) => (
                  <div class="data-item-image">
                    <img src={acquireImage()(row)} />
                  </div>
                )}
              </Show>

              <div class="data-item-values">
                <For each={dataColumns}>{(column) => <DataItemValue column={column} row={row} />}</For>
              </div>
            </div>

            <div class="data-item-meta">
              <div class="data-item-meta-dates">
                <Show when={updatedColumn}>{(column) => <DataItemValue column={column()} row={row} />}</Show>
                <Show when={createdColumn}>{(column) => <DataItemValue column={column()} row={row} />}</Show>
              </div>
              <div class="data-item-meta-actions">
                <Show when={actionsColumn}>{(column) => <DataItemValue column={column()} row={row} />}</Show>
              </div>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

interface PLVProps<TRow> {
  column: DataListColumn<TRow>;
  row: TRow;
}

function DataItemValue<TRow>(props: PLVProps<TRow>) {
  return (
    <div classList={{ "data-item-value": true, [props.column.displayMode ?? "default-mode"]: true }}>
      <div class="data-item-value-label">{props.column.icon ?? props.column.label ?? props.column.name}</div>
      {/* <Show when={props.column.icon}>
        <div class="data-item-value-icon">{props.column.icon}</div>
      </Show> */}
      <div class="data-item-value-value">{props.column.render(props.row)}</div>
    </div>
  );
}
