import { bindMethods } from "./common.ts";

export interface ToastInfo {
  id: number;
  title: string;
  time: number;
  life: number;
  message: string;
}

type Listener = (toasts: readonly ToastInfo[]) => void;

export class ToastService {
  private toasts: readonly ToastInfo[] = [];
  private lastId = 0;

  private listener: Listener | undefined;

  constructor() {
    setInterval(() => {
      const expired = this.toasts.filter((t) => t.time + t.life < Date.now());
      if (expired.length > 0) {
        this.toasts = this.toasts.filter((t) => !expired.includes(t));
        if (this.listener) this.listener(this.toasts);
      }
    }, 1000);

    bindMethods(this);
  }

  public addToast(toast: Omit<ToastInfo, "id" | "time">) {
    this.toasts = [...this.toasts, { id: this.lastId++, time: Date.now(), ...toast }];
    if (this.listener) this.listener(this.toasts);
  }

  public removeToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    if (this.listener) this.listener(this.toasts);
  }

  public setToastListener(listener: Listener) {
    this.listener = listener;
  }
}
