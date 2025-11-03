// deno-lint-ignore-file no-explicit-any
import type { JSX } from "solid-js";

// Helper for opening dialog components
export async function openDialog<
  TProps extends { onClose?: (ret: any) => void },
  TRet extends TProps extends { onClose?: (ret: infer T) => void } ? T : unknown
>(Dialog: (props: TProps) => JSX.Element, props: TProps): Promise<TRet> {
  const { render } = await import("solid-js/web");

  return new Promise<TRet>((resolve) => {
    const dialogHost = document.createElement("div");

    dialogHost.className = "modal fade";

    document.body.classList.add("modal-open");
    document.body.appendChild(dialogHost);

    // eslint-disable-next-line prefer-const
    let destroy: (() => void) | undefined;

    const onClose = (ret: TRet) => {
      dialogHost.classList.remove("show");

      setTimeout(() => {
        destroy?.();

        document.body.removeChild(dialogHost);
        document.body.classList.remove("modal-open");

        resolve(ret);
      }, 300);
    };

    destroy = render(() => <Dialog {...(props as any)} onClose={onClose} />, dialogHost);

    // CSS animations require we don't set all the properties at once...
    requestAnimationFrame(() => {
      dialogHost.style.display = "flex";

      requestAnimationFrame(() => {
        dialogHost.classList.add("show");

        requestAnimationFrame(() => {
          const defaultButton = dialogHost.querySelector(".btn-default");
          if (defaultButton instanceof HTMLButtonElement) defaultButton.focus();
        });
      });
    });
  });
}
