import { formatDistanceToNow } from "npm:date-fns";
import { createSignal } from "npm:solid-js";

interface Props {
  id: number;
  title: string;
  time: number;
  message: string;
  onClose: (id: number) => void;
}

export function Toast(props: Props) {
  const [show, setShow] = createSignal(false);

  const [time, setTime] = createSignal(formatDistanceToNow(new Date(props.time), { addSuffix: true }));

  requestAnimationFrame(() => setShow(true));

  setInterval(() => {
    setTime(formatDistanceToNow(new Date(props.time), { addSuffix: true }));
  }, 1000);

  const onClose = () => {
    props.onClose(props.id);
  };

  return (
    <div classList={{ toast: true, fade: true, show: show() }} role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header">
        <strong class="me-auto">{props.title}</strong>
        <small>{time()}</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close" on:click={onClose}></button>
      </div>
      <div class="toast-body">{props.message}</div>
    </div>
  );
}
