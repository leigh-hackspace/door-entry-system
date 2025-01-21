import { Button } from "@frontend/components";

interface Props {
  title: string;
  message: string;
  onClose?: (result?: "yes" | "no") => void;
}

export function ConfirmDialog(props: Props) {
  const onClose = (result?: "yes" | "no") => {
    props.onClose?.(result);
  };

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={() => onClose()}></button>
        </div>
        <div class="modal-body">
          <div innerHTML={props.message} />
        </div>
        <div class="modal-footer">
          <Button colour="secondary" on:click={() => onClose("no")}>
            No
          </Button>
          <Button colour="primary" on:click={() => onClose("yes")}>
            Yes
          </Button>
        </div>
      </div>
    </div>
  );
}
