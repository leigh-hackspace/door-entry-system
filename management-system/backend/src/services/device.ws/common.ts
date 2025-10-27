import { type ScanEvent, sleep } from "@door-entry-management-system/common";
import EventEmitter from "node:events";
import * as v from "valibot";

export const TagCode = v.object({ tag_name: v.string(), member_name: v.string(), code: v.string() });
export type TagCode = v.InferInput<typeof TagCode>;

// ==== Events ====

export interface DeviceEvents {
  update: DeviceStateAndConfig[];
  fileProgress: string[];
  unknownScans: ScanEvent[];
}

export interface DeviceStateAndConfig {
  name: string;
  latch: boolean;
}

export const DeviceEvents = new EventEmitter<DeviceEvents>();

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

export const IncomingTagScanned = v.object({
  type: v.literal("tag_scanned"),
  allowed: v.boolean(),
  code: v.string(),
});
export type IncomingTagScanned = v.InferInput<typeof IncomingTagScanned>;

export const IncomingFileStart = v.object({
  type: v.literal("file_start"),
  file_name: v.string(),
  length: v.number(),
});
export type IncomingFileStart = v.InferInput<typeof IncomingFileStart>;

export const IncomingFileList = v.object({
  type: v.literal("file_list"),
  list: v.array(v.object({ name: v.string(), size: v.number() })),
});
export type IncomingFileList = v.InferInput<typeof IncomingFileList>;

export const DeviceIncoming = v.variant("type", [
  IncomingAnnounce,
  IncomingStatusUpdate,
  IncomingLatchChanged,
  IncomingTagScanned,
  IncomingFileStart,
  IncomingFileList,
]);
export type DeviceIncoming = v.InferInput<typeof DeviceIncoming>;

// ==== Commands ====

export const OutgoingPushTags = v.object({
  type: v.literal("push_tags"),
  tags: v.array(TagCode),
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

export const OutgoingFileStart = v.object({
  type: v.literal("file_start"),
  file_name: v.string(),
  length: v.number(),
});
export type OutgoingFileStart = v.InferInput<typeof OutgoingFileStart>;

export const OutgoingFileRequest = v.object({
  type: v.literal("file_request"),
  file_name: v.string(),
});
export type OutgoingFileRequest = v.InferInput<typeof OutgoingFileRequest>;

export const OutgoingFileDelete = v.object({
  type: v.literal("file_delete"),
  file_name: v.string(),
});
export type OutgoingFileDelete = v.InferInput<typeof OutgoingFileDelete>;

export const OutgoingPlay = v.object({
  type: v.literal("play"),
  file_name: v.string(),
});
export type OutgoingPlay = v.InferInput<typeof OutgoingPlay>;

export const OutgoingFileList = v.object({
  type: v.literal("file_list"),
});
export type OutgoingFileList = v.InferInput<typeof OutgoingFileList>;

export const DeviceOutgoing = v.variant("type", [
  OutgoingPushTags,
  OutgoingLatchChange,
  OutgoingPing,
  OutgoingFileStart,
  OutgoingFileRequest,
  OutgoingFileDelete,
  OutgoingPlay,
  OutgoingFileList,
]);
export type DeviceOutgoing = v.InferInput<typeof DeviceOutgoing>;

export type DeviceCommand = readonly ["message", DeviceOutgoing] | readonly ["binary", Uint8Array];

export type DeviceOutgoingFn = (command: DeviceCommand) => Promise<void>;

export interface PublicDeviceInterface {
  pushValidCodes(tags: TagCode[]): Promise<void>;
  pushLatchState(latch: boolean): Promise<void>;
  getBinaryFile(request_file_name: string): Promise<Uint8Array>;
  pushBinaryFile(file_name: string, data: Uint8Array): Promise<void>;
  deleteFile(file_name: string): Promise<void>;
  playFile(file_name: string): Promise<void>;
  listFiles(): Promise<IncomingFileList["list"]>;
}

export class FakeDeviceConnection implements PublicDeviceInterface {
  async pushValidCodes(tags: TagCode[]): Promise<void> {}

  async pushLatchState(latch: boolean): Promise<void> {}

  async getBinaryFile(request_file_name: string): Promise<Uint8Array> {
    return new Uint8Array([48, 49, 50, 0x0d, 0x0a]);
  }

  async pushBinaryFile(file_name: string, data: Uint8Array): Promise<void> {
    console.log("pushBinaryFile:", file_name, data);

    for (let i = 0; i < 5; i += 1) {
      await sleep(1_000);
      DeviceEvents.emit("fileProgress", `File progress: ${i * 4096} bytes`);
    }
  }

  async deleteFile(file_name: string) {
    console.log("deleteFile:", file_name);
  }

  async playFile(file_name: string) {
    console.log("playFile:", file_name);
  }

  async listFiles(): Promise<IncomingFileList["list"]> {
    return [
      { name: "text1.txt", size: 5 },
      { name: "text2.txt", size: 5 },
      { name: "text3.txt", size: 5 },
    ];
  }
}
