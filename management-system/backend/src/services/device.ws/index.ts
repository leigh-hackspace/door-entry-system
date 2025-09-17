import { assertUnreachable, sleep } from "@door-entry-management-system/common";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { Router } from "websocket-express";
import { GlobalDeviceCollectionWs } from "./collection.ts";
import { DeviceIncoming, type DeviceOutgoingFn } from "./common.ts";
import type { DeviceConnection } from "./connection.ts";

export * from "./collection.ts";

export function getWebSocketRouter() {
  const router = new Router();

  router.ws("/ws", async (req, res) => {
    const ip = req.socket.remoteAddress ?? "0.0.0.0";

    const ws = await res.accept();

    if (!ip) {
      console.error("No device IP!");
      return;
    }

    let connection: DeviceConnection | null = null;

    const commander: DeviceOutgoingFn = async ([type, data]) => {
      if (type === "message") {
        ws.send(JSON.stringify(data));
        console.log("==== OUT:", data);
      } else {
        ws.send(data);
        console.log("==== OUT BINARY:", data.length);
      }

      while (ws.bufferedAmount > 0) {
        console.log(ws.bufferedAmount);
        await sleep(1000);
      }
    };

    ws.on("message", async (msg, isBinary) => {
      try {
        if (!isBinary) {
          const msg_str = msg.toString("utf8");
          const deviceIncoming = v.parse(DeviceIncoming, JSON.parse(msg_str));

          console.log("===== IN:", msg_str);

          switch (deviceIncoming.type) {
            case "announce":
              connection = GlobalDeviceCollectionWs.handleAnnounce(deviceIncoming, ip, commander);
              break;
            case "status_update":
              assert(connection, "No connection!");
              connection.handleStatusUpdate(deviceIncoming);
              break;
            case "tag_scanned":
              assert(connection, "No connection!");
              connection.handleIncomingTag(deviceIncoming);
              break;
            case "latch_changed":
              assert(connection, "No connection!");
              connection.handleLatchChanged(deviceIncoming);
              break;
            case "file_start":
              assert(connection, "No connection!");
              connection.handleFileStart(deviceIncoming);
              break;
            case "file_list":
              assert(connection, "No connection!");
              connection.handleFileList(deviceIncoming);
              break;
            default:
              assertUnreachable(deviceIncoming);
          }
        } else if (msg instanceof Uint8Array) {
          console.log("===== IN BINARY:", msg.length);

          assert(connection, "No connection!");
          connection.handleBinaryData(msg);
        } else {
          console.error("Unknown WebSocket Message:", msg);
        }
      } catch (err) {
        console.error("Device request error:", err);
      }
    });

    ws.on("close", () => {
      if (connection) {
        GlobalDeviceCollectionWs.remove(connection);
      }
    });

    ws.on("error", (err) => console.error("WS Error:", err));
  });

  return router;
}
