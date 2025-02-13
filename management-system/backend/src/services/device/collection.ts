import { eq } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { db, DeviceTable } from "../../db/index.ts";
import type { DeviceState, LogCodeRequest } from "./common.ts";
import { DeviceConnection } from "./connection.ts";

export class DeviceCollection {
  private devices: Record<string, DeviceConnection> = {};

  constructor() {
    void this.reloadDevices();
  }

  public async reloadDevices() {
    const rows = await db.select().from(DeviceTable);

    for (const [name, deviceConnection] of Object.entries(this.devices)) {
      deviceConnection.destroy();
      delete this.devices[name];
    }

    for (const row of rows) {
      this.devices[row.name] = new DeviceConnection(row);
    }
  }

  public async handleAnnounce(ip_address: string, name: string) {
    const rows = await db.select().from(DeviceTable).where(eq(DeviceTable.name, name));

    let id: string;

    if (rows.length === 0) {
      id = uuid.v4();
      await db.insert(DeviceTable).values({ id, name, ip_address });
    } else {
      id = rows[0].id;
      await db.update(DeviceTable).set({ ip_address, updated: new Date() }).where(eq(DeviceTable.id, id));
    }

    const deviceInfo = (await db.select().from(DeviceTable).where(eq(DeviceTable.id, id)))[0];

    if (this.devices[name]) {
      this.devices[name].destroy();
    }

    this.devices[name] = new DeviceConnection(deviceInfo);
  }

  public async handleCode(ip_address: string, data: LogCodeRequest) {
    const device = this.getDeviceConnection(ip_address);

    await device?.handleCode(data);
  }

  public async handleStateUpdate(ip_address: string, state: DeviceState) {
    const device = this.getDeviceConnection(ip_address);

    await device?.handleStateUpdate(state);
  }

  public pushValidCodes() {
    return Promise.all(Object.values(this.devices).map((device) => device.pushValidCodes()));
  }

  public async pushLatchState(name: string, latch: boolean) {
    const deviceConnection = this.devices[name];
    if (!deviceConnection) return;

    await deviceConnection.pushLatchState(latch);
  }

  public pushLatchStateAll(latch: boolean) {
    return Promise.all(
      Object.values(this.devices).map((device) => {
        device.pushLatchState(latch);
      })
    );
  }

  public getDeviceConnection(ip_address: string) {
    const device = Object.values(this.devices).find((d) => d.device.ip_address === ip_address);

    if (!device) {
      console.error("DeviceCollection.getDevice: Device not found with IP address:", ip_address);
      return;
    }

    return device;
  }
}

export const GlobalDeviceCollection = new DeviceCollection();
