import { getTableColumns } from "drizzle-orm/utils";
import EventEmitter from "node:events";
import { eq } from "npm:drizzle-orm";
import * as v from "valibot";
import { sleep } from "../../../common/src/index.ts";
import { Config } from "../config/index.ts";
import { db, TagTable, UserTable } from "../db/index.ts";

interface DeviceEvents {
  check: DeviceState[];
}

export const DeviceState = v.object({
  latch: v.boolean(),
});

export type DeviceState = v.InferInput<typeof DeviceState>;

export const DeviceEvents = new EventEmitter<DeviceEvents>();

export async function startCheckDevice() {
  while (true) {
    await checkDevice();

    await sleep(5_000);
  }
}

export async function checkDevice() {
  try {
    const res = await fetch(`http://${Config.DE_DEVICE_IP}`, { signal: AbortSignal.timeout(5000) });

    if (res.status === 200) {
      console.log("Device OK");

      DeviceEvents.emit("check", v.parse(DeviceState, await res.json()));
    } else {
      console.error("Device NOT OK");
    }
  } catch (err) {
    console.error("Device ping failed!", err);
  }
}

export async function updateValidCodes() {
  for (let i = 0; i < 5; i++) {
    try {
      const rows = await db
        .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
        .from(TagTable)
        .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id));

      const body = rows.map((r) => `${r.code} ${r.user_name}`).join("\n") + "\n";

      const res = await fetch(`http://${Config.DE_DEVICE_IP}/file?file=codes.txt`, {
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

export async function setLatch(latch: boolean) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`http://${Config.DE_DEVICE_IP}/latch-${latch ? "on" : "off"}`, {
        signal: AbortSignal.timeout(5000),
        method: "POST",
      });

      if (res.status === 200) {
        console.log("setLatch: Success");
        break;
      } else {
        console.error("setLatch: Error!", await res.text());
      }
    } catch (err) {
      console.error("setLatch:", err);
    }
  }
}
