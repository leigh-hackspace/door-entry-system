import { assertUnreachable } from "@door-entry-management-system/common";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { Router } from "websocket-express";
import { GlobalDeviceCollectionWs } from "./collection.ts";
import { DeviceIncoming } from "./common.ts";
import type { DeviceConnection } from "./connection.ts";

export * from "./collection.ts";

export function getWebSocketRouter() {
  const router = new Router();

  router.ws("/ws", async (req, res) => {
    const ip = req.ip ?? "0.0.0.0";
    const ws = await res.accept();

    if (!ip) {
      console.error("No device IP!");
      return;
    }

    let connection: DeviceConnection | null = null;

    ws.on("message", async (msg) => {
      try {
        const deviceIncoming = v.parse(DeviceIncoming, JSON.parse(msg.toString()));

        switch (deviceIncoming.type) {
          case "announce":
            connection = GlobalDeviceCollectionWs.handleAnnounce(deviceIncoming, ip, (command) => {
              ws.send(JSON.stringify(command));
            });
            break;
          case "status_update":
            console.log("status_update", deviceIncoming.status, deviceIncoming.message);
            break;
          case "tag_scanned":
            assert(connection, "No connection!");
            connection.handleIncomingTag(deviceIncoming);
            break;
          case "latch_changed":
            assert(connection, "No connection!");
            connection.handleLatchChanged(deviceIncoming);
            break;
          default:
            assertUnreachable(deviceIncoming);
        }
      } catch (err) {
        console.error("Device request error:", err);
      }
    });

    ws.on("error", (err) => console.error("WS Error:", err));
  });

  return router;
}
