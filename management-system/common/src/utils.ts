import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { assert, type ElementOf } from "ts-essentials";

export function assertError(err: unknown): asserts err is Error {
  assert(err instanceof Error, "Error is not an instance of `Error`");
}

export function assertUnreachable(x: never): never {
  console.error("assertUnreachable:", x);

  throw new Error(`An unreachable event has occurred: ${String(x)} / ${typeof x}`);
}

export function includes<L extends readonly unknown[]>(t: unknown, list: L): t is ElementOf<L> {
  return list.includes(t);
}

export function keys<T extends object>(obj: T) {
  return Object.keys(obj) as unknown as readonly (keyof T)[];
}

export function stringKeys<T extends object>(obj: T) {
  return Object.keys(obj).filter((k) => typeof k === "string") as unknown as readonly Extract<keyof T, string>[];
}

export type PropsOf<TComponent> = TComponent extends (props: infer T) => void ? T : never;

export function titleCase(str: string) {
  str = str.toLowerCase();

  const str2 = str.split(" ");

  for (let i = 0; i < str2.length; i++) {
    str2[i] = str2[i].charAt(0).toUpperCase() + str2[i].slice(1);
  }

  return str2.join(" ");
}

export function humanise(inputString: string) {
  const formattedString = inputString.replace(/[-_]/g, " ");

  const finalFormattedString = formattedString.replace(/([a-z])([A-Z])/g, "$1 $2");

  return finalFormattedString.replace(/\b\w/g, (match) => match.toUpperCase());
}

export function camelToPascal(camelCaseString: string) {
  return camelCaseString.charAt(0).toUpperCase() + camelCaseString.slice(1);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDateTime(date: Date) {
  return format(date, "PPp", { locale: enGB });
}

export function formatDate(date: Date) {
  return format(date, "P", { locale: enGB });
}
