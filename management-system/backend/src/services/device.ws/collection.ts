import type { DeviceInfo } from "@door-entry-management-system/common";
import type { DeviceOutgoingFn, IncomingAnnounce } from "./common.ts";
import { DeviceConnection } from "./connection.ts";

class DeviceCollection {
  private devices: Record<string, DeviceConnection> = {};

  constructor() {
  }

  public handleAnnounce(announce: IncomingAnnounce, ip_address: string, commander: DeviceOutgoingFn) {
    const deviceInfo: DeviceInfo = {
      ip_address,
      name: announce.name,
    };

    if (this.devices[announce.name]) {
      this.devices[announce.name].destroy();
    }

    return this.devices[announce.name] = new DeviceConnection(deviceInfo, commander);
  }

  public pushValidCodes() {
    return Promise.all(Object.values(this.devices).map((device) => device.pushValidCodes()));
  }

  public pushLatchStateAll(latch: boolean) {
    return Promise.all(
      Object.values(this.devices).map((device) => {
        device.pushLatchState(latch);
      }),
    );
  }
}

export const GlobalDeviceCollectionWs = new DeviceCollection();
