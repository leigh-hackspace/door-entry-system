import type { ActivityLogAction } from "@door-entry-management-system/common";
import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "npm:drizzle-orm";
import * as uuid from "npm:uuid";
import * as v from "valibot";
import { ActivityLogTable, db, TagTable } from "../db/index.ts";
import { UserTable } from "../db/schema.ts";

export const LogCodeRequestSchema = v.object({
  code: v.pipe(v.string(), v.minLength(2)),
  allowed: v.boolean(), // Whether or not the ESP32 allowed or denied action based on it's local database
});

export type LogCodeRequest = v.InferInput<typeof LogCodeRequestSchema>;

export async function logCode(req: LogCodeRequest) {
  console.log("logCode:", req.code);

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

export async function handleLogCode(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/log-code" && req.method === "POST") {
    // This will prevent tRPC from handling the request
    // Needs to be sync so we send immediately before doing async stuff
    res.write("OK");
    res.end();

    try {
      const buffers = [];
      for await (const data of req) {
        buffers.push(data);
      }
      const data = v.parse(LogCodeRequestSchema, JSON.parse(Buffer.concat(buffers).toString("utf8")));

      await logCode(data);
    } catch (err) {
      console.error("handleLogCode:", err);
    }
  }
}
