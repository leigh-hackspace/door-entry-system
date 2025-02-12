import type { AppRouter } from "@door-entry-management-system/backend";
import type { SearchResult } from "@door-entry-management-system/common";

type InferSearchReturn<TRoute extends (req: never) => unknown> = InferReturn<TRoute> extends SearchResult<infer T>
  ? T
  : never;

export type InferReturn<TRoute extends (req: never) => unknown> = ReturnType<TRoute> extends PromiseLike<infer T>
  ? T
  : never;

export type UserSearchRecord = InferSearchReturn<AppRouter["User"]["Search"]>;
export type TagSearchRecord = InferSearchReturn<AppRouter["Tag"]["Search"]>;
export type ActivityLogSearchRecord = InferSearchReturn<AppRouter["ActivityLog"]["Search"]>;
export type DeviceSearchRecord = InferSearchReturn<AppRouter["Device"]["Search"]>;

export type UserRecord = InferReturn<AppRouter["User"]["One"]>;
export type TagRecord = InferReturn<AppRouter["Tag"]["One"]>;
export type DeviceRecord = InferReturn<AppRouter["Device"]["One"]>;
