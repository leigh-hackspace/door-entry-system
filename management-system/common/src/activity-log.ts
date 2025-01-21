import type { ElementOf } from "ts-essentials";

export const ActivityLogAction = ["allowed", "denied-unassigned", "denied-unknown-code"] as const;
export type ActivityLogAction = ElementOf<typeof ActivityLogAction>;
