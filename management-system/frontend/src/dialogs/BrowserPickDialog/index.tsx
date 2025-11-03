// deno-lint-ignore-file no-explicit-any
import { assertError } from "@door-entry-management-system/common";
import {
  CursorDefault,
  type FetchParameters,
  fetchParamsFromCursor,
  MagicBrowser,
  type RowData,
  RowDataDefault,
  SearchBar,
} from "@frontend/components";
import { openAlert } from "@frontend/dialogs";
import type { FetchResult } from "@frontend/services";
import { createEffect, createSignal } from "solid-js";
import type * as v from "valibot";
import { openDialog } from "../common.tsx";

interface Props {
  title: string;
  schema: v.ObjectSchema<any, any>;
  onFetch: (params: FetchParameters & { search: string }) => any;
  onClose?: (row?: any) => void;
}

export function BrowserPickDialog(props: Props) {
  const [rows, setRows] = createSignal<RowData<unknown>>(RowDataDefault);

  const cursorSignal = createSignal(CursorDefault);
  const searchSignal = createSignal("");

  const fetchRows = async () => {
    const cursor = cursorSignal[0]();
    const params = fetchParamsFromCursor(cursor);

    try {
      setRows(await props.onFetch({ ...params, search: searchSignal[0]() }));
    } catch (err) {
      assertError(err);
      await openAlert(`Fetch Error: ${err.name}`, err.message);
    }
  };

  createEffect(fetchRows);

  const onClose = () => {
    props.onClose?.();
  };

  const onClear = () => {
    props.onClose?.(null);
  };

  const onSelect = async (row: any) => {
    props.onClose?.(row);
  };

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={onClose}></button>
        </div>
        <div class="modal-body p-0">
          <div class="p-2">
            <SearchBar search={searchSignal} />
          </div>
          <MagicBrowser schema={props.schema} rowData={rows()} cursor={cursorSignal} onRowClick={onSelect} />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-warning btn-default" on:click={onClear}>
            Clear
          </button>
          <button type="button" class="btn btn-secondary btn-default" on:click={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export async function openBrowser<TRow>(
  title: string,
  schema: v.ObjectSchema<any, any>,
  onFetch: (params: FetchParameters) => Promise<FetchResult<TRow>>
) {
  const row = await openDialog(BrowserPickDialog, {
    title,
    schema,
    onFetch,
  });

  return row as TRow | undefined | null;
}
