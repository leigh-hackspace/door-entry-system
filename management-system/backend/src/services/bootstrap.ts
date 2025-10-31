import { db } from "@/db";
import { eq } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { UserTable } from "../db/schema.ts";
import { scryptAsync } from "./common.ts";

export async function bootstrap() {
  const query = db.select().from(UserTable).where(eq(UserTable.role, "admin"));

  const admins = await query;

  if (admins.length === 0) {
    console.log("==== Create default admin...");

    const id = uuid.v4();
    const passwordHash = await scryptAsync("password", id);

    await db
      .insert(UserTable)
      .values({ id, role: "admin", email: "admin@example.com", name: "Default Admin", passwordHash });
  } else {
    console.log("Admin already exists");
  }
}
