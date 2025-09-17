// deno-lint-ignore-file no-explicit-any

export interface SessionUser {
  id: string;
  role: "admin" | "user";
  name: string;
  email: string;
  sessionToken: string;
}

export interface QuerySort {
  sort: string;
  dir: "asc" | "desc";
}

export interface FetchResult<TRow> {
  rows: readonly TRow[];
  total: number;
}

export function bindMethods(that: any) {
  Object.getOwnPropertyNames(Object.getPrototypeOf(that))
    .filter((prop) => typeof that[prop] === "function" && prop !== "constructor")
    .forEach((method) => (that[method] = that[method].bind(that)));
}
