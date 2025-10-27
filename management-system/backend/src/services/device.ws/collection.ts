import { db, TagTable, UserTable } from "@/db";
import type { DeviceInfo } from "@door-entry-management-system/common";
import { eq, getTableColumns } from "drizzle-orm";
import {
  type DeviceOutgoingFn,
  FakeDeviceConnection,
  type IncomingAnnounce,
  type PublicDeviceInterface,
} from "./common.ts";
import { DeviceConnection } from "./connection.ts";

class DeviceCollection {
  private devices: Record<string, DeviceConnection> = {};

  constructor() {}

  public handleAnnounce(announce: IncomingAnnounce, ip_address: string, commander: DeviceOutgoingFn) {
    const deviceInfo: DeviceInfo = {
      ip_address,
      name: announce.name,
    };

    if (this.devices[announce.name]) {
      this.devices[announce.name].destroy();
    }

    return (this.devices[announce.name] = new DeviceConnection(deviceInfo, commander));
  }

  public remove(connection_to_remove: DeviceConnection) {
    for (const [device_name, connection] of Object.entries(this.devices)) {
      if (connection === connection_to_remove) {
        connection.destroy();
        delete this.devices[device_name];
      }
    }
  }

  public async pushValidCodes() {
    const rows = await db
      .select({ ...getTableColumns(TagTable), user_name: UserTable.name })
      .from(TagTable)
      .innerJoin(UserTable, eq(TagTable.user_id, UserTable.id))
      .where(eq(UserTable.paidUp, true));

    const tags = rows.map((r) => ({ tag_name: r.description, member_name: r.user_name, code: r.code }));

    console.log("Pushing tags:", tags);

    return Promise.all(Object.values(this.devices).map((device) => device.pushValidCodes(tags)));
  }

  public pushLatchStateAll(latch: boolean) {
    return Promise.all(
      Object.values(this.devices).map((device) => {
        device.pushLatchState(latch);
      })
    );
  }

  public getDeviceConnection(id: string): PublicDeviceInterface | null {
    const device = Object.values(this.devices).find((d) => d.device.id === id);

    if (!device) {
      console.error("DeviceCollection.getDevice: Device not found with ID:", id);
      return new FakeDeviceConnection();
    }

    return device;
  }
}

export const GlobalDeviceCollectionWs = new DeviceCollection();
