import { LoginDataSchema } from "@door-entry-management-system/common";
import EventEmitter, { on } from "node:events";
import { eq } from "npm:drizzle-orm";
import jwt from "npm:jsonwebtoken";
import { assert } from "npm:ts-essentials";
import * as v from "npm:valibot";
import { Config } from "../config/index.ts";
import { db, UserTable } from "../db/index.ts";
import { scryptAsync } from "../services/index.ts";
import { assertOneRecord, type TokenPayload } from "./common.ts";
import { tRPC } from "./trpc.ts";

interface LoginActivity {
  loggedIn: string[];
}

const loginEvents = new EventEmitter<LoginActivity>();

export const AuthRouter = tRPC.router({
  Login: tRPC.PublicProcedure.input(v.parser(LoginDataSchema)).mutation(async ({ input }) => {
    const user = assertOneRecord(
      await db.select().from(UserTable).where(eq(UserTable.email, input.email.toLowerCase()))
    );

    const result = (await scryptAsync(input.password, user.id)) === user.password_hash;
    assert(result, "Invalid password");

    const payload: TokenPayload = { id: user.id };

    const token = jwt.sign(payload, Config.DE_SECRET_KEY, { expiresIn: "1h" }); // Expires in 1 hour

    loginEvents.emit("loggedIn", `User "${user.name}" just logged in`);

    return { user, token };
  }),

  Activity: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    for await (const [data] of on(loginEvents, "loggedIn", {
      signal: opts.signal,
    })) {
      yield data as string;
    }
  }),
});
