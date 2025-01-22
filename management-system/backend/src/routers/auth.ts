import { LoginDataSchema } from "@door-entry-management-system/common";
import { eq } from "drizzle-orm";
import EventEmitter, { on } from "node:events";
import jwt from "npm:jsonwebtoken";
import * as uuid from "npm:uuid";
import { assert } from "ts-essentials";
import * as v from "valibot";
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

  BeginOAuth: tRPC.PublicProcedure.input(v.parser(v.object({ return_auth: v.string() }))).query(({ input }) => {
    const url = new URL(`https://${Config.DE_AUTHENTIK_HOST}/application/o/authorize/`);

    url.searchParams.set("client_id", Config.DE_AUTHENTIK_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.return_auth);

    return {
      url: url.toString(),
    };
  }),

  CompleteOAuth: tRPC.PublicProcedure.input(v.parser(v.object({ code: v.string(), return_auth: v.string() }))).mutation(
    async ({ input }) => {
      const form = new URLSearchParams();

      form.set("client_id", Config.DE_AUTHENTIK_CLIENT_ID);
      form.set("client_secret", Config.DE_AUTHENTIK_CLIENT_SECRET);
      form.set("grant_type", "authorization_code");
      form.set("code", input.code);
      form.set("redirect_uri", input.return_auth);

      const res = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/application/o/token/`, {
        method: "POST",
        headers: [["Content-Type", "application/x-www-form-urlencoded"]],
        body: form.toString(),
      });

      if (res.status !== 200) {
        console.error("CompleteOAuth:", await res.text());
        throw new Error("Error getting token");
      }

      const data = v.parse(TokenResponseSchema, await res.json());

      const access_token = data.access_token;

      const userRes = await fetch(`https://${Config.DE_AUTHENTIK_HOST}/application/o/userinfo/`, {
        method: "POST",
        headers: [["Authorization", `Bearer ${access_token}`]],
        body: form.toString(),
      });

      if (userRes.status !== 200) {
        console.error("CompleteOAuth:", await userRes.text());
        throw new Error("Error getting user info");
      }

      const userData = v.parse(UserInfoResponseSchema, await userRes.json());

      const shouldBeAdmin = userData.groups.includes("Infra");

      const matchingUsers = await db.select().from(UserTable).where(eq(UserTable.email, userData.email));

      let id: string;

      if (matchingUsers.length === 0) {
        id = uuid.v4();

        await db.insert(UserTable).values({
          id,
          email: userData.email,
          name: userData.name,
          role: shouldBeAdmin ? "admin" : "user",
          password_hash: "Authentik",
        });
      } else {
        id = matchingUsers[0].id;

        await db
          .update(UserTable)
          .set({ email: userData.email, name: userData.name, role: shouldBeAdmin ? "admin" : "user" })
          .where(eq(UserTable.id, id));
      }

      const user = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, id)));

      const payload: TokenPayload = { id };

      const token = jwt.sign(payload, Config.DE_SECRET_KEY, { expiresIn: "1h" }); // Expires in 1 hour

      loginEvents.emit("loggedIn", `User "${user.name}" just logged in`);

      return {
        token,
        user,
      };
    }
  ),

  Activity: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    for await (const [data] of on(loginEvents, "loggedIn", {
      signal: opts.signal,
    })) {
      yield data as string;
    }
  }),
});

const TokenResponseSchema = v.object({
  access_token: v.string(),
});

const UserInfoResponseSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.string(),
  groups: v.array(v.string()),
});
