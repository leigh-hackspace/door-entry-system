import * as v from "valibot";
import { FieldMetadata, IpAddressLength } from "./common.ts";

export const DeviceNameLength = 16;

export interface DeviceInfo {
  id: string;
  name: string;
  ip_address: string;
  created?: Date;
  updated?: Date;
}

export const DeviceCreateSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(2),
    v.maxLength(DeviceNameLength),
    v.title("Name"),
    v.metadata(FieldMetadata({ icon: "📟" }))
  ),
  ip_address: v.pipe(
    v.string(),
    v.minLength(7),
    v.maxLength(IpAddressLength),
    v.title("IP Address"),
    v.metadata(FieldMetadata({ icon: "📡" }))
  ),
});

export type DeviceCreate = v.InferInput<typeof DeviceCreateSchema>;

export const DeviceUpdateSchema = v.partial(DeviceCreateSchema);

export type DeviceUpdate = v.InferInput<typeof DeviceUpdateSchema>;
