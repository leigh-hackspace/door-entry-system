import type { ElementOf } from "ts-essentials";
import * as v from "valibot";

export const TaskLogLevel = ["error", "warning", "info", "debug"] as const;
export const TaskLogLevelSchema = v.picklist(TaskLogLevel);
export type TaskLogLevel = ElementOf<typeof TaskLogLevel>;

export const TaskLogFilter = v.object({
  level: v.optional(v.array(v.picklist(TaskLogLevel))),
  type: v.optional(v.array(v.string())),
});
export type TaskLogFilter = v.InferInput<typeof TaskLogFilter>;
