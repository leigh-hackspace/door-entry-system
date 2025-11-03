import { For, type JSXElement, onMount, Show } from "solid-js";
import { type Colour, createLongPressHandler, debounce, handleAsyncClick, type QuerySort } from "../helper.ts";

interface Props<TRow> {
  columns: readonly DataListColumn<TRow>[];
  rows: readonly TRow[];
  sort?: QuerySort;
  selected?: readonly TRow[];
  selectAll?: boolean;
  acquireImage?: (row: TRow) => string;

  onSort?: (colName: string) => void;
  onFilter?: (colName: string) => void;
  onLoadMore?: () => void;
  onSelectionChanged?: (row: TRow) => void;
  onSelectAll?: () => void;
  onRowClick?: (row: TRow) => Promise<void>;
}

export interface DataListColumn<TRow> {
  name: string;
  label?: string;
  icon?: string;
  width?: string;
  filter?: boolean;
  render: (row: TRow) => JSXElement;
  renderHeader?: () => JSXElement;
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
  }, 500);

  onMount(() => {
    scroller = ul; //getScrollingAncestor(ul);

    if (scroller) {
      scroller.addEventListener("scroll", (e) => {
        if (isNearBottom()) onLoadMoreDebounced();
      });
    }
  });

  const columns = props.columns.slice(0);

  if (props.selected !== undefined && props.onSelectionChanged) {
    columns.push({
      name: "select",
      label: "Select",
      width: "14px",
      renderHeader: () =>
        props.selectAll !== undefined &&
        props.onSelectAll && (
          <input
            type="checkbox"
            checked={props.selectAll}
            on:click={(e) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              props.onSelectAll!();
            }}
          />
        ),
      render: (row) => (
        <input
          type="checkbox"
          checked={props.selected && props.selected.includes(row) !== (props.selectAll ?? false)}
          on:click={(e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            props.onSelectionChanged!(row);
          }}
        />
      ),
    });
  }

  const dataColumns = columns.filter((c) => !["actions"].includes(c.name));

  const onClick = (row: TRow) =>
    handleAsyncClick(
      async () => {
        // Click does selection if no `onRowClick` defined or we're already in the middle of selecting...
        if (props.onSelectionChanged && (!props.onRowClick || (props.selected?.length ?? 0) > 0)) {
          return props.onSelectionChanged(row);
        } else if (props.onRowClick) {
          return props.onRowClick(row);
        }
      },
      () => {}
    );

  const renderColumnSort = (columnName: string) =>
    props.sort?.sort === columnName &&
    (props.sort?.dir === "asc" ? <span>&nbsp;↓</span> : props.sort?.dir === "desc" ? <span>&nbsp;↑</span> : undefined);

  return (
    <div
      class="data-list"
      ref={(div) => {
        div.style.setProperty("--data-list-columns", props.columns.length.toString());
        div.style.setProperty("--data-list-widths", dataColumns.map((c) => c.width ?? "1fr").join(" "));
      }}
    >
      <ul class="data-list-header">
        <li class="data-item">
          <Show when={props.acquireImage}>
            <div class="data-item-image" />
          </Show>
          <div class="data-item-values">
            <For each={dataColumns}>
              {(column) => (
                <div>
                  <div
                    style={{ cursor: props.onSort ? "pointer" : undefined }}
                    on:click={() => column.name !== "select" && props.onSort?.(column.name)}
                  >
                    {column.renderHeader ? column.renderHeader() : column.label ?? column.name}
                    {renderColumnSort(column.name)}
                  </div>

                  {column.filter && (
                    <div class="data-item-filter" on:click={() => props.onFilter?.(column.name)}>
                      Filter
                    </div>
                  )}
                </div>
              )}
            </For>
          </div>
        </li>
      </ul>
      <ul class="scrollable" ref={(_ul) => (ul = _ul)}>
        <For each={props.rows}>
          {(row) => {
            const { onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } =
              createLongPressHandler({
                onShortTap: (e) => onClick(row)(e),
                onLongTap: () => props.onSelectionChanged && props.onSelectionChanged(row),
              });

            return (
              <li
                classList={{
                  "data-item": true,
                  selected: props.selected && props.selected.includes(row) !== (props.selectAll ?? false),
                }}
                on:mousedown={onMouseDown}
                on:mousemove={onMouseMove}
                on:mouseup={onMouseUp}
                on:touchstart={onTouchStart}
                on:touchmove={onTouchMove}
                on:touchend={onTouchEnd}
                on:touchcancel={onTouchCancel}
              >
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
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

interface PLVProps<TRow> {
  column: DataListColumn<TRow>;
  row: TRow;
}

function DataItemValue<TRow>(props: PLVProps<TRow>) {
  return (
    <div
      classList={{
        "data-item-value": true,
        [`column-${props.column.name}`]: true,
      }}
    >
      <div class="data-item-value-label">{props.column.icon ?? props.column.label ?? props.column.name}</div>
      <div class="data-item-value-value">{props.column.render(props.row)}</div>
    </div>
  );
}
