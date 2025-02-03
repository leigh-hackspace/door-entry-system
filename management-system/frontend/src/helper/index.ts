import type { AppRouter } from "@door-entry-management-system/backend";
import { includes } from "@door-entry-management-system/common";
import { AppService, type InferReturn } from "@frontend/lib";
import { useNavigate, useSearchParams } from "npm:@solidjs/router";
import { assert } from "npm:ts-essentials";

export type Role = InferReturn<AppRouter["User"]["One"]>["role"];

export function beginPage(_role: Role | Role[]) {
  const role = _role instanceof Array ? _role : [_role];
  assert(role.length > 0, "beginPage: Must have at least one role!");

  const navigate = useNavigate();
  const user = AppService.get().getCurrentUser();
  const { tRPC, toastService } = AppService.get();

  const helpers = { navigate, tRPC, toastService };

  if (!user) {
    navigate("/login");

    return { user: () => null, ...helpers };
  }
  if (!role.includes(user.role)) {
    navigate("/login?reason=permissions");

    return { user: () => null, ...helpers };
  }

  return { user: () => user, ...helpers };
}

export function beginPageNoRole() {
  const user = AppService.get().getCurrentUser();
  const { tRPC, toastService } = AppService.get();

  const helpers = { tRPC, toastService };

  return { user: () => user, ...helpers };
}

export function getLogoutReason() {
  const [searchParams] = useSearchParams();

  const reason = searchParams.reason;
  assert(includes(reason, ["expired", "permissions", undefined] as const), `Invalid reason "${reason}"`);
  return reason;
}

/** Get the closest ancestor that is scrolling this element (overflow/overflow-y) */
export function getScrollingAncestor(el: HTMLElement): HTMLElement | undefined {
  while (el && el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY || style.overflow)) {
      return el;
    }
    el = el.parentElement;
  }
  return undefined;
}

export function debounce<TFunc extends (...args: TArgs) => void, TArgs extends unknown[]>(
  callback: TFunc,
  wait: number
) {
  let lastCallTime = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: TArgs) => {
    const now = Date.now();

    if (now - lastCallTime > wait) {
      // If enough time has passed, call immediately
      lastCallTime = now;
      callback(...args);
    } else {
      // Otherwise, clear existing timeout and set a new one
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        lastCallTime = Date.now();
        callback(...args);
      }, wait);
    }
  };
}
