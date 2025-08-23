import type { ActivityLogAction, DeviceInfo } from "@door-entry-management-system/common";
import { WebClient } from "@slack/web-api";
import { eq, getTableColumns } from "drizzle-orm";
import { setInterval } from "node:timers";
import * as uuid from "uuid";
import { Config } from "../../config/index.ts";
import { ActivityLogTable, db, DeviceTable, TagTable, UserTable } from "../../db/index.ts";
import { DeviceEvents } from "../device/index.ts";
import type { DeviceOutgoingFn, IncomingLatchChanged, IncomingTagScanned } from "./common.ts";

export class DeviceConnection {
  private interval: NodeJS.Timeout;

  constructor(
    public device: DeviceInfo,
    public commander: DeviceOutgoingFn,
  ) {
    console.log("DeviceConnection:", device);

    this.commander({ type: "ping", payload: "Connection successful" });

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
    this.commander({ type: "ping", payload: "Server ping" });
  }

  public async pushValidCodes() {
    const rows = await db
      .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
      .from(TagTable)
      .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id));

    this.commander({ type: "push_tags", tags: rows.map((r) => ({ tag_name: r.description, member_name: r.user_name, code: r.code })) });
  }

  public async pushLatchState(latch: boolean) {
    this.commander({ type: "latch_change", latch_state: latch });
  }

  /** Called when this device has changed its latch state */
  public handleLatchChanged(incoming: IncomingLatchChanged) {
    console.log("DeviceConnection.handleLatchChanged:", incoming);

    DeviceEvents.emit("update", { name: this.device.name, latch: incoming.latch_state });
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

  public destroy() {
  }
}
