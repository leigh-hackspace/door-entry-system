import { defineConfig } from "drizzle-kit";
import { Config } from "./src/config/index.ts";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: Config.DE_DATABASE_URL,
  },
});
