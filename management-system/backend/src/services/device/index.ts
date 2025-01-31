import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as v from "valibot";
import { GlobalDeviceCollection } from "./collection.ts";
import { AnnounceRequest, DeviceState, LogCodeRequest } from "./common.ts";

export * from "./collection.ts";
export * from "./common.ts";
export * from "./connection.ts";

export async function handleDeviceNotification(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith("/notify") && req.method === "POST") {
    // This will prevent tRPC from handling the request
    // Needs to be sync so we send immediately before doing async stuff
    res.write("OK");
    res.end();

    const ip_address = req.socket.remoteAddress ?? "unknown";

    try {
      const buffers = [];
      for await (const data of req) {
        buffers.push(data);
      }

      const json = JSON.parse(Buffer.concat(buffers).toString("utf8"));

      if (req.url.endsWith("/announce")) {
        const data = v.parse(AnnounceRequest, json);
        await GlobalDeviceCollection.handleAnnounce(ip_address, data.name);
      } else if (req.url.endsWith("/code")) {
        const data = v.parse(LogCodeRequest, json);
        await GlobalDeviceCollection.handleCode(ip_address, data);
      } else if (req.url.endsWith("/state")) {
        const data = v.parse(DeviceState, json);
        await GlobalDeviceCollection.handleStateUpdate(ip_address, data);
      } else {
        console.error("Unknown notification", req.url, json);
      }
    } catch (err) {
      console.error("handleAnnounce:", err);
    }
  }
}
