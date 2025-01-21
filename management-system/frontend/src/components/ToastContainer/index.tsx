import { createSignal, For } from "npm:solid-js";
import { Toast } from "../Toast/index.tsx";

export interface ToastInfo {
  id: number;
  title: string;
  time: number;
  life: number;
  message: string;
}

interface Props {
  onListen: (listener: (ToastInfo: readonly ToastInfo[]) => void) => void;
  onRemoveToast: (id: number) => void;
}

export function ToastContainer(props: Props) {
  const [toasts, setToast] = createSignal<ToastInfo[]>([]);

  props.onListen((toasts) => {
    setToast(toasts.slice());
  });

  const onClose = (id: number) => {
    props.onRemoveToast(id);
  };

  return (
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <For each={toasts()}>
        {(toastInfo) => (
          <Toast
            id={toastInfo.id}
            title={toastInfo.title}
            time={toastInfo.time}
            message={toastInfo.message}
            onClose={onClose}
          />
        )}
      </For>
    </div>
  );
}
