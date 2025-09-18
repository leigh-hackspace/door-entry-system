import type { ActivityLogAction, DeviceInfo } from "@door-entry-management-system/common";
import { WebClient } from "@slack/web-api";
import { eq, getTableColumns } from "drizzle-orm";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import * as uuid from "uuid";
import { Config } from "../../config/index.ts";
import { ActivityLogTable, db, DeviceTable, TagTable, UserTable } from "../../db/index.ts";
import { DeviceEvents } from "../device/index.ts";
import type {
  DeviceOutgoingFn,
  IncomingFileList,
  IncomingFileStart,
  IncomingLatchChanged,
  IncomingStatusUpdate,
  IncomingTagScanned,
  PublicDeviceInterface,
} from "./common.ts";
import { assert } from "ts-essentials";

const CHUNK_SIZE = 4 * 1024;
const WRITE_TIMEOUT = 10_000;

export class DeviceConnection implements PublicDeviceInterface {
  private interval: NodeJS.Timeout;

  constructor(
    public device: DeviceInfo,
    public commander: DeviceOutgoingFn,
  ) {
    console.log("DeviceConnection:", device);

    this.commander(["message", { type: "ping", payload: "Connection successful" }]);

    void this.commitToDatabase().catch((err) => console.error("DeviceConnection.commitToDatabase", err));

    this.interval = setInterval(() => {
      void this.checkDevice();
    }, 5_000);
  }

  private async commitToDatabase() {
    const rows = await db.select().from(DeviceTable).where(eq(DeviceTable.name, this.device.name));

    let id: string;

    if (rows.length === 0) {
      id = uuid.v4();
      await db.insert(DeviceTable).values({ id, name: this.device.name, ip_address: this.device.ip_address });
    } else {
      id = rows[0].id;
      await db.update(DeviceTable).set({ ip_address: this.device.ip_address, updated: new Date() }).where(eq(DeviceTable.id, id));
    }

    this.device = (await db.select().from(DeviceTable).where(eq(DeviceTable.id, id)))[0];
  }

  private async checkDevice() {
    if (this.statusUpdateHandler || this.fileStartHandler || this.binaryDataHandler) return;
    this.commander(["message", { type: "ping", payload: "Server ping" }]);
  }

  public async pushValidCodes() {
    const rows = await db
      .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
      .from(TagTable)
      .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id));

    this.commander(["message", {
      type: "push_tags",
      tags: rows.map((r) => ({ tag_name: r.description, member_name: r.user_name, code: r.code })),
    }]);
  }

  public async pushLatchState(latch: boolean) {
    this.commander(["message", { type: "latch_change", latch_state: latch }]);
  }

  async pushBinaryFile(file_name: string, data: Uint8Array, on_progress: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      void this.commander(["message", {
        type: "file_start",
        file_name,
        length: data.length,
      }]);

      const chunk_count = Math.ceil(data.length / CHUNK_SIZE);
      let chunk_index = 0;

      const cleanUp = () => {
        this.statusUpdateHandler = undefined;
        clearTimeout(timeout);
      };

      const timedOut = () => {
        cleanUp();
        return reject(new Error("Timed out sending chunk"));
      };

      let timeout = setTimeout(timedOut, WRITE_TIMEOUT);

      this.statusUpdateHandler = async (update) => {
        if (update.message === "Ready for next chunk") {
          clearTimeout(timeout);

          const chunk = data.slice(chunk_index * CHUNK_SIZE, Math.min((chunk_index + 1) * CHUNK_SIZE, data.length));

          // await sleep(1_000);
          await this.commander(["binary", chunk]);

          on_progress(chunk_index * CHUNK_SIZE);

          chunk_index += 1;

          if (chunk_index === chunk_count) {
            cleanUp();
            return resolve();
          }

          timeout = setTimeout(timedOut, WRITE_TIMEOUT);
        }
      };
    });
  }

  public getBinaryFile(requestFileName: string) {
    return new Promise<Uint8Array>((resolve, reject) => {
      this.commander(["message", {
        type: "file_request",
        file_name: requestFileName,
      }]);

      const cleanUp = () => {
        this.fileStartHandler = undefined;
        this.binaryDataHandler = undefined;
        clearTimeout(timeout);
      };

      const success = (buffer: Uint8Array) => {
        cleanUp();
        return resolve(buffer);
      };

      const failure = (err: unknown) => {
        cleanUp();
        return reject(err);
      };

      let file_buffer: Uint8Array | undefined;
      let remaining_bytes = 0;

      const timedOut = () => {
        cleanUp();
        return reject(new Error("Timed out sending chunk"));
      };

      let timeout = setTimeout(timedOut, WRITE_TIMEOUT);

      this.fileStartHandler = ({ file_name, length }) => {
        clearTimeout(timeout);
        console.log("fileStartHandler", file_name, length);

        try {
          assert(file_name == requestFileName, `Incoming file does not match: ${file_name} != ${requestFileName}`);

          file_buffer = new Uint8Array(length);
          remaining_bytes = length;
        } catch (err) {
          return failure(err);
        }
      };

      this.binaryDataHandler = (chunk) => {
        clearTimeout(timeout);
        console.log("binaryDataHandler", chunk, chunk.length, remaining_bytes);

        try {
          assert(file_buffer, "No buffer!");
          assert(remaining_bytes > 0, "Cannot receive more!");

          const start = file_buffer.length - remaining_bytes;

          for (let b = 0; b < chunk.length; b++) {
            file_buffer[start + b] = chunk[b];
          }

          remaining_bytes -= chunk.length;

          assert(remaining_bytes >= 0, "Exceeded file length!");

          if (remaining_bytes === 0) {
            return success(file_buffer);
          }

          timeout = setTimeout(timedOut, WRITE_TIMEOUT);
        } catch (err) {
          return failure(err);
        }
      };
    });
  }

  public async deleteFile(file_name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanUp();
        return reject(new Error(`Timed out deleting "${file_name}"`));
      }, WRITE_TIMEOUT);

      const cleanUp = () => {
        this.statusUpdateHandler = undefined;
        clearTimeout(timeoutId);
      };

      // Set up handler FIRST
      this.statusUpdateHandler = (update) => {
        if (update.message === `File deleted successfully: ${file_name}`) {
          cleanUp();
          return resolve();
        }
      };

      // Then start the command
      this.commander(["message", {
        type: "file_delete",
        file_name,
      }]).catch((error) => {
        cleanUp();
        return reject(error);
      });
    });
  }

  public async playFile(file_name: string) {
    await this.commander(["message", {
      type: "play",
      file_name,
    }]);
  }

  public listFiles() {
    return new Promise<IncomingFileList["list"]>((resolve) => {
      this.commander(["message", {
        type: "file_list",
      }]);

      this.fileListHandler = ({ list }) => {
        this.fileListHandler = undefined;

        return resolve(list);
      };
    });
  }

  /** Called when this device has changed its latch state */
  public handleLatchChanged(incoming: IncomingLatchChanged) {
    console.log("DeviceConnection.handleLatchChanged:", incoming);

    DeviceEvents.emit("update", { name: this.device.name, latch: incoming.latch_state });
  }

  private statusUpdateHandler?: (update: IncomingStatusUpdate) => void;

  public async handleStatusUpdate(update: IncomingStatusUpdate) {
    console.log("handleStatusUpdate", update.status, update.message);

    if (this.statusUpdateHandler) this.statusUpdateHandler(update);
  }

  public async handleIncomingTag(req: IncomingTagScanned) {
    console.log("DeviceConnection.receiveCode:", req.code);

    const slackClient = new WebClient(Config.DE_SLACK_API_KEY, {});

    const matchingTags = await db
      .select({ id: TagTable.id, code: TagTable.code, user_id: UserTable.id, user_name: UserTable.name })
      .from(TagTable)
      .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
      .where(eq(TagTable.code, req.code));

    const id = uuid.v4();

    let action: ActivityLogAction;
    let user_id: string | null = null;
    let user_name: string | null = null;

    if (req.allowed) {
      action = "allowed";

      const tag = matchingTags.length > 0 ? matchingTags[0] : null;

      if (tag) {
        ({ user_id, user_name } = tag);
      }
    } else {
      if (matchingTags.length > 0) {
        action = "denied-unassigned";
      } else {
        action = "denied-unknown-code";
      }
    }

    if (user_name) {
      try {
        await slackClient.chat.postMessage({
          channel: Config.DE_SLACK_CHANNEL,
          text: `${user_name} has entered the hackspace`,
        });
      } catch (err) {
        console.error("slackClient.chat.postMessage ERROR:", err);
      }
    }

    await db.insert(ActivityLogTable).values({ id, user_id, code: req.code, action });
  }

  private fileStartHandler?: (fileStart: IncomingFileStart) => void;

  public handleFileStart(fileStart: IncomingFileStart) {
    if (this.fileStartHandler) this.fileStartHandler(fileStart);
  }

  private fileListHandler?: (list: IncomingFileList) => void;

  public handleFileList(list: IncomingFileList) {
    if (this.fileListHandler) this.fileListHandler(list);
  }

  private binaryDataHandler?: (data: Uint8Array) => void;

  public handleBinaryData(data: Uint8Array) {
    if (this.binaryDataHandler) this.binaryDataHandler(data);
  }

  public destroy() {
    clearInterval(this.interval);
  }
}
