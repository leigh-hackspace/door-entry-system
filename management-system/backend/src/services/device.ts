import { getTableColumns } from "drizzle-orm/utils";
import { eq } from "npm:drizzle-orm";
import { sleep } from "../../../common/src/index.ts";
import { Config } from "../config/index.ts";
import { db, TagTable, UserTable } from "../db/index.ts";

export async function startCheckDevice() {
  while (true) {
    try {
      const res = await fetch(`http://${Config.DE_DEVICE_IP}`, { signal: AbortSignal.timeout(5000) });

      if (res.status === 200) {
        console.log("Device OK");
      } else {
        console.error("Device NOT OK");
      }
    } catch (err) {
      console.error("Device ping failed!", err);
    }

    await sleep(5_000);
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
