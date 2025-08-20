import * as v from "valibot";

// ==== Requests ====

export const IncomingAnnounce = v.object({
  type: v.literal("announce"),
  name: v.pipe(v.string(), v.minLength(2)),
});
export type IncomingAnnounce = v.InferInput<typeof IncomingAnnounce>;

export const IncomingStatusUpdate = v.object({
  type: v.literal("status_update"),
  status: v.string(),
  message: v.string(),
});
export type IncomingStatusUpdate = v.InferInput<typeof IncomingStatusUpdate>;

export const IncomingLatchChanged = v.object({
  type: v.literal("latch_changed"),
  latch_state: v.boolean(),
});
export type IncomingLatchChanged = v.InferInput<typeof IncomingLatchChanged>;

export const DeviceIncoming = v.variant("type", [IncomingAnnounce, IncomingStatusUpdate, IncomingLatchChanged]);
export type DeviceIncoming = v.InferInput<typeof DeviceIncoming>;

// ==== Commands ====

export const OutgoingPushTags = v.object({
  type: v.literal("push_tags"),
  tags: v.array(v.object({ tag_name: v.string(), member_name: v.string(), code: v.string() })),
});
export type OutgoingPushTags = v.InferInput<typeof OutgoingPushTags>;

export const OutgoingLatchChange = v.object({
  type: v.literal("latch_change"),
  latch_state: v.boolean(),
});
export type OutgoingLatchChange = v.InferInput<typeof OutgoingLatchChange>;

export const OutgoingPing = v.object({
  type: v.literal("ping"),
  payload: v.string(),
});
export type OutgoingPing = v.InferInput<typeof OutgoingPing>;

export const DeviceOutgoing = v.variant("type", [OutgoingPushTags, OutgoingLatchChange, OutgoingPing]);
export type DeviceOutgoing = v.InferInput<typeof DeviceOutgoing>;

export type DeviceOutgoingFn = (command: DeviceOutgoing) => void;
