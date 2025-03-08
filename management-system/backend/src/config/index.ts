import { parse } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as v from "valibot";
import { pickPrefix } from "../../../common/src/index.ts"; // Drizzle Kit bodge

export const ConfigSchema = v.object({
  DE_DATABASE_URL: v.pipe(v.string(), v.startsWith("postgresql://")),
  DE_SECRET_KEY: v.pipe(v.string(), v.minLength(16)),
  DE_BACKEND_PORT: v.pipe(
    v.string(),
    v.decimal(),
    v.transform((s) => parseInt(s, 10))
  ),
  DE_AUTHENTIK_HOST: v.string(),
  DE_AUTHENTIK_CLIENT_ID: v.string(),
  DE_AUTHENTIK_CLIENT_SECRET: v.string(),
  DE_AUTHENTIK_API_TOKEN: v.string(),
  DE_HOME_ASSISTANT_WS_URL: v.string(),
  DE_HOME_ASSISTANT_ACCESS_TOKEN: v.string(),
  DE_SLACK_API_KEY: v.string(),
  DE_SLACK_CHANNEL: v.string(),
  DE_GOCARDLESS_API_TOKEN: v.string(),
});

let env = pickPrefix(process.env, "DE_");

// This hack is only needed to make `drizzle-kit push` work as it doesn't inherit the environment...
const devEnvLocation = path.resolve("..", ".env");
if (fs.existsSync(devEnvLocation)) {
  console.log("==== Reading env from:", devEnvLocation);
  env = parse(fs.readFileSync(devEnvLocation));
}

export const Config = v.parse(ConfigSchema, env);
