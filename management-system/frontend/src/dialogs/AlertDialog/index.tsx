import { openDialog } from "../common.tsx";

interface Props {
  title: string;
  message: string;
  onClose?: (nothing?: undefined) => void;
}

export function AlertDialog(props: Props) {
  const onClose = () => {
    props.onClose?.();
  };

  return (
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5">{props.title}</h1>
          <button type="button" class="btn-close" aria-label="Close" on:click={onClose}></button>
        </div>
        <div class="modal-body">
          <div innerHTML={props.message} />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-default" on:click={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function openAlert(title: string, message: string) {
  return openDialog(AlertDialog, { title, message });
}
