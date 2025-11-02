import { For, type JSXElement, onMount, Show } from "solid-js";
import { type Colour, debounce, handleAsyncClick, type QuerySort } from "../helper.ts";

interface Props<TRow> {
  columns: readonly DataListColumn<TRow>[];
  rows: readonly TRow[];
  sort?: QuerySort;
  selected?: readonly TRow[];
  selectAll?: boolean;
  acquireImage?: (row: TRow) => string;

  onSort?: (colName: string) => void;
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
          checked={props.selected!.includes(row) !== (props.selectAll ?? false)}
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
        if (props.selected && props.selected.length > 0 && props.onSelectionChanged) {
          props.onSelectionChanged(row);
        } else {
          return props.onRowClick && props.onRowClick(row);
        }
      },
      () => {}
    );

  const createLongPressHandler = (row: TRow) => {
    let timer: number | null = null;
    let startPos: { x: number; y: number } | null = null;
    let isLongPress = false;
    let hasMoved = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      startPos = null;
      isLongPress = false;
      hasMoved = false;
    };

    const triggerHaptic = () => {
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    };

    return {
      onTouchStart: {
        handleEvent: (e: TouchEvent) => {
          const touch = e.touches[0];
          startPos = { x: touch.clientX, y: touch.clientY };
          isLongPress = false;
          hasMoved = false;

          timer = setTimeout(() => {
            if (props.onSelectionChanged && timer && !hasMoved) {
              isLongPress = true;
              triggerHaptic();
              props.onSelectionChanged(row);
            }
            cleanup();
          }, 500);
        },
        passive: true,
      },

      onTouchMove: {
        handleEvent: (e: TouchEvent) => {
          if (!startPos || !timer) return;

          const touch = e.touches[0];
          const distance = Math.sqrt(Math.pow(touch.clientX - startPos.x, 2) + Math.pow(touch.clientY - startPos.y, 2));

          if (distance > 10) {
            hasMoved = true;
            cleanup();
          }
        },
        passive: true,
      },

      onTouchEnd: (e: TouchEvent) => {
        // Only prevent default for short taps (not scrolls)
        if (timer && !hasMoved) {
          e.preventDefault(); // Prevent text selection only for actual taps

          if (!isLongPress) {
            onClick(row)(e);
          }
        }
        cleanup();
      },

      onTouchCancel: cleanup,
    };
  };

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
                <div
                  style={{ cursor: props.onSort ? "pointer" : undefined }}
                  onclick={() => column.name !== "select" && props.onSort?.(column.name)}
                >
                  {column.renderHeader ? column.renderHeader() : column.label ?? column.name}
                  {props.sort?.sort === column.name &&
                    (props.sort?.dir === "asc" ? (
                      <span>&nbsp;↓</span>
                    ) : props.sort?.dir === "desc" ? (
                      <span>&nbsp;↑</span>
                    ) : undefined)}
                </div>
              )}
            </For>
          </div>
        </li>
      </ul>
      <ul class="scrollable" ref={(_ul) => (ul = _ul)}>
        <For each={props.rows}>
          {(row) => {
            const { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } = createLongPressHandler(row);

            return (
              <li
                classList={{
                  "data-item": true,
                  selected: props.selected!.includes(row) !== (props.selectAll ?? false),
                }}
                on:click={onClick(row)}
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
      {/* <Show when={props.column.icon}>
        <div class="data-item-value-icon">{props.column.icon}</div>
      </Show> */}
      <div class="data-item-value-value">{props.column.render(props.row)}</div>
    </div>
  );
}
