import { FieldMetadata, isNotNullOrUndefined, RowSelection } from "@door-entry-management-system/common";
import { CursorDefault, MagicBrowser, type RowData } from "@frontend/components";
import { createSignal } from "solid-js";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { openDialog } from "../common.tsx";

interface Props {
  title: string;
  options: SelectOption[];
  previouslySelectedOptions?: string[];
  onClose?: (row?: SelectOption[] | null) => void;
}

const SelectOptionSchema = v.object({
  id: v.pipe(v.string(), v.metadata(FieldMetadata({ hidden: true }))),
  text: v.pipe(v.string(), v.metadata(FieldMetadata({ icon: "Option" }))),
});

export interface SelectOption {
  id: string;
  text: string;
}

export function SelectOptionDialog(props: Props) {
  const [rowData] = createSignal<RowData<SelectOption>>({ rows: props.options, total: props.options.length });

  const [cursor, setCursor] = createSignal(CursorDefault);
  const [selection, setSelection] = createSignal<RowSelection>({ ids: props.previouslySelectedOptions ?? [] });

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

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={onClose}></button>
        </div>
        <div class="modal-body p-0">
          <MagicBrowser
            schema={SelectOptionSchema}
            rowData={rowData()}
            cursor={[cursor, setCursor]}
            selection={[selection, setSelection]}
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

export function openOptions(title: string, options: SelectOption[], previouslySelectedOptions?: string[]) {
  return openDialog(SelectOptionDialog, {
    title,
    options,
    previouslySelectedOptions,
  });
}
