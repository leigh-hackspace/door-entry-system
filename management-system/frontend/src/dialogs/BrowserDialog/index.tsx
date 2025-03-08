// deno-lint-ignore-file no-explicit-any
import { MagicBrowser } from "@frontend/components";
import type { FetchParameters } from "@frontend/lib";
import type * as v from "npm:valibot";

interface Props {
  title: string;
  schema: v.ObjectSchema<any, any>;
  onFetch: (params: FetchParameters) => any;
  onClose?: (row?: any) => void;
}

export function BrowserDialog(props: Props) {
  const onClose = () => {
    props.onClose?.();
  };

  const onClear = () => {
    props.onClose?.(null);
  };

  const onSelect = (row: any) => {
    props.onClose?.(row);
  };

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={onClose}></button>
        </div>
        <div class="modal-body">
          <MagicBrowser
            schema={props.schema}
            initialPageSize={10}
            rowActions={[{ name: "Select", colour: "info", onClick: onSelect }]}
            onFetch={props.onFetch}
          />
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
