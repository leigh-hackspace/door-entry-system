import { FieldMetadata, isNotNullOrUndefined } from "@door-entry-management-system/common";
import { CursorDefault, MagicBrowser, type RowData, RowSelectionDefault } from "@frontend/components";
import { createSignal } from "solid-js";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { openDialog } from "../common.tsx";

interface Props {
  title: string;
  options: Option[];
  onClose?: (row?: Option[] | null) => void;
}

const OptionTableSchema = v.object({
  id: v.pipe(v.string(), v.metadata(FieldMetadata({ hidden: true }))),
  text: v.pipe(v.string()),
});

export interface Option {
  id: string;
  text: string;
}

export function OptionDialog(props: Props) {
  const [rowData] = createSignal<RowData<Option>>({ rows: props.options, total: props.options.length });

  const [cursor, setCursor] = createSignal(CursorDefault);
  const [selection, setSelection] = createSignal(RowSelectionDefault);

  const onClose = () => {
    assert(props.onClose);
    props.onClose(undefined); // Unchanged
  };

  const onUseSelection = () => {
    assert(props.onClose);

    const { rows } = rowData();

    props.onClose(
      selection()
        .ids.map((id) => rows.find((r) => r.id === id))
        .filter(isNotNullOrUndefined)
    );
  };

  const onClear = () => {
    assert(props.onClose);
    props.onClose(null); // Clear selection
  };

  const onSelect = async (row: Option) => {};

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={onClose}></button>
        </div>
        <div class="modal-body p-0">
          <MagicBrowser
            schema={OptionTableSchema}
            rowData={rowData()}
            cursor={[cursor, setCursor]}
            selection={[selection, setSelection]}
            onRowClick={onSelect}
          />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-warning btn-default" on:click={onClear}>
            Clear
          </button>
          <button type="button" class="btn btn-secondary btn-default" on:click={onUseSelection}>
            Use Selection ({selection().ids.length})
          </button>
        </div>
      </div>
    </div>
  );
}

export function openOptions(title: string, options: Option[]) {
  return openDialog(OptionDialog, {
    title,
    options,
  });
}
