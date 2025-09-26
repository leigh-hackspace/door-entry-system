import { eq } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { db } from "@/db";
import { UserTable } from "../db/schema.ts";
import { scryptAsync } from "./common.ts";

export async function bootstrap() {
  const query = db.select().from(UserTable).where(eq(UserTable.role, "admin"));

  const admins = await query;

  if (admins.length === 0) {
    console.log("==== Create default admin...");

    const id = uuid.v4();
    const password_hash = await scryptAsync("password", id);

    await db
      .insert(UserTable)
      .values({ id, role: "admin", email: "admin@example.com", name: "Default Admin", password_hash });
  } else {
    console.log("Admin already exists");
  }
}
