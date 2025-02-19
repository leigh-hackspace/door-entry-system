import type { ActivityLogAction, DeviceInfo } from "@door-entry-management-system/common";
import { eq } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm/utils";
import { clearInterval, setInterval } from "node:timers";
import { WebClient } from "npm:@slack/web-api";
import * as uuid from "npm:uuid";
import * as v from "valibot";
import { Config } from "../../config/index.ts";
import { ActivityLogTable, db, DeviceTable, TagTable, UserTable } from "../../db/index.ts";
import { DeviceEvents, DeviceResponse, type DeviceState, type LogCodeRequest } from "./common.ts";

const HTTP_RETRY_LIMIT = 5;

export class DeviceConnection {
  private interval: NodeJS.Timeout;

  constructor(public device: DeviceInfo) {
    console.log("DeviceConnection:", device);

    this.interval = setInterval(() => {
      void this.checkDevice();
    }, 10_000);
  }

  private async doRequest(url: string, method: "GET" | "POST", body?: string) {
    for (let i = 0; i < HTTP_RETRY_LIMIT; i++) {
      try {
        const res = await fetch(`http://${this.device.ip_address}/${url}`, {
          method,
          body,
          signal: AbortSignal.timeout(5000),
        });

        if (res.status === 200) {
          return res;
        } else {
          console.error("doRequest: Bad response:", res.status, await res.text());
        }
      } catch (err) {
        console.error("doRequest: Error:", err);
      }
    }

    return null;
  }

  public async checkDevice() {
    try {
      const res = await this.doRequest("", "GET");

      if (!res) {
        console.log("Device NOT OK!");
        return;
      }

      await db.update(DeviceTable).set({ updated: new Date() }).where(eq(DeviceTable.id, this.device.id));

      const parsed = v.parse(DeviceResponse, await res.json());

      DeviceEvents.emit("update", { ...parsed[0], ...parsed[1] });

      console.log("Device OK");
    } catch (err) {
      console.error("checkDevice: ERROR:", err);
    }
  }

  public async getStats() {
    const res = await this.doRequest("stats", "GET");
    if (!res) return null;

    return await res.json();
  }

  public async pushValidCodes() {
    const rows = await db
      .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
      .from(TagTable)
      .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id));

    const body = rows.map((r) => `${r.code} ${r.user_name}`).join("\n") + "\n";

    const res = await this.doRequest(`file?file=codes.txt`, "POST", body);

    if (res) {
      console.log("Device Codes Update Successful");
    } else {
      console.error("Device Codes Update Error!");
    }
  }

  public async pushLatchState(latch: boolean) {
    const res = await this.doRequest(`latch-${latch ? "on" : "off"}`, "POST");

    if (res) {
      console.log("setLatch: Success", latch);
    } else {
      console.error("setLatch: Error!");
    }
  }

  /** Called when this device detects a code */
  public async handleCode(req: LogCodeRequest) {
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

  /** Called when this device has changed its latch state */
  public handleStateUpdate(deviceState: DeviceState) {
    console.log("DeviceConnection.handleStateUpdate:", deviceState);

    DeviceEvents.emit("update", { name: this.device.name, ...deviceState });
  }

  public destroy() {
    clearInterval(this.interval);
  }
}
