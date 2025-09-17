import { drizzle } from "npm:drizzle-orm/node-postgres";
import { Config } from "@/config";
import * as dbSchema from "./schema.ts";

export const db = drizzle(Config.DE_DATABASE_URL, { schema: dbSchema });
