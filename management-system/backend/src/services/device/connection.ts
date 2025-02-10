import type { ActivityLogAction, DeviceInfo } from "@door-entry-management-system/common";
import { eq } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm/utils";
import { clearInterval, setInterval } from "node:timers";
import * as uuid from "npm:uuid";
import * as v from "valibot";
import { ActivityLogTable, db, DeviceTable, TagTable, UserTable } from "../../db/index.ts";
import { DeviceEvents, DeviceResponse, type DeviceState, type LogCodeRequest } from "./common.ts";

export class DeviceConnection {
  private interval: NodeJS.Timeout;

  constructor(public device: DeviceInfo) {
    console.log("DeviceConnection:", device);

    this.interval = setInterval(() => {
      void this.checkDevice();
    }, 10_000);
  }

  public async checkDevice() {
    try {
      const res = await fetch(`http://${this.device.ip_address}`, { signal: AbortSignal.timeout(5000) });

      if (res.status === 200) {
        console.log("Device OK");

        await db.update(DeviceTable).set({ updated: new Date() }).where(eq(DeviceTable.id, this.device.id));

        const parsed = v.parse(DeviceResponse, await res.json());

        DeviceEvents.emit("update", { ...parsed[0], ...parsed[1] });
      } else {
        console.error("Device NOT OK");
      }
    } catch (err) {
      console.error("Device ping failed!", err);
    }
  }

  public async pushValidCodes() {
    for (let i = 0; i < 5; i++) {
      try {
        const rows = await db
          .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
          .from(TagTable)
          .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id));

        const body = rows.map((r) => `${r.code} ${r.user_name}`).join("\n") + "\n";

        const res = await fetch(`http://${this.device.ip_address}/file?file=codes.txt`, {
          signal: AbortSignal.timeout(5000),
          method: "POST",
          body,
        });

        if (res.status === 200) {
          console.log("Device Codes Update Successful");
          break;
        } else {
          console.error("Device Codes Update Error!");
        }
      } catch (err) {
        console.error("Device Codes Update Error!", err);
      }
    }
  }

  public async pushLatchState(latch: boolean) {
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(`http://${this.device.ip_address}/latch-${latch ? "on" : "off"}`, {
          signal: AbortSignal.timeout(5000),
          method: "POST",
        });

        if (res.status === 200) {
          console.log("setLatch: Success", latch);
          break;
        } else {
          console.error("setLatch: Error!", await res.text());
        }
      } catch (err) {
        console.error("setLatch:", err);
      }
    }
  }

  /** Called when this device detects a code */
  public async handleCode(req: LogCodeRequest) {
    console.log("DeviceConnection.receiveCode:", req.code);

    const matchingTags = await db
      .select({ id: TagTable.id, code: TagTable.code, user_id: UserTable.id })
      .from(TagTable)
      .leftJoin(UserTable, eq(TagTable.user_id, UserTable.id))
      .where(eq(TagTable.code, req.code));

    const id = uuid.v4();

    let action: ActivityLogAction;
    let user_id: string | null = null;

    if (req.allowed) {
      action = "allowed";
      user_id = matchingTags.length > 0 ? matchingTags[0].user_id : null;
    } else {
      if (matchingTags.length > 0) {
        action = "denied-unassigned";
      } else {
        action = "denied-unknown-code";
      }
    }

    await db.insert(ActivityLogTable).values({ id, user_id, code: req.code, action });
  }

  /** Called when this device has changed its latch state */
  public async handleStateUpdate(deviceState: DeviceState) {
    console.log("DeviceConnection.handleStateUpdate:", deviceState);

    DeviceEvents.emit("update", { name: this.device.name, ...deviceState });
  }

  public destroy() {
    clearInterval(this.interval);
  }
}
