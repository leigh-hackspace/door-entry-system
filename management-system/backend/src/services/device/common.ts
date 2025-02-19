import EventEmitter from "node:events";
import * as v from "valibot";

export interface DeviceEvents {
  update: DeviceStateAndConfig[];
}

export const DeviceEvents = new EventEmitter<DeviceEvents>();

export const DeviceConfig = v.object({
  name: v.string(),
});
export type DeviceConfig = v.InferInput<typeof DeviceConfig>;

export const DeviceState = v.object({
  latch: v.boolean(),
});
export type DeviceState = v.InferInput<typeof DeviceState>;

export type DeviceStateAndConfig = DeviceConfig & DeviceState;

export const DeviceResponse = v.tuple([v.object({}), DeviceConfig, DeviceState] as const);

export const AnnounceRequest = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
});
export type AnnounceRequest = v.InferInput<typeof AnnounceRequest>;

export const LogCodeRequest = v.object({
  code: v.pipe(v.string(), v.minLength(2)),
  allowed: v.boolean(), // Whether or not the ESP32 allowed or denied action based on it's local database
});
export type LogCodeRequest = v.InferInput<typeof LogCodeRequest>;
