import { Config } from "@/config";
import { db, UserTable } from "@/db";
import { AuthentikService, AuthentikUserClient, scryptAsync } from "@/services";
import { LoginDataSchema } from "@door-entry-management-system/common";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { on } from "node:events";
import { assert } from "ts-essentials";
import * as uuid from "uuid";
import * as v from "valibot";
import { assertOneRecord, type TokenPayload } from "./common.ts";
import { SessionEvents } from "./events.ts";
import { tRPC } from "./trpc.ts";

export const AuthRouter = tRPC.router({
  Login: tRPC.PublicProcedure.input(v.parser(LoginDataSchema)).mutation(async ({ input }) => {
    const user = assertOneRecord(
      await db.select().from(UserTable).where(eq(UserTable.email, input.email.toLowerCase())),
    );

    const result = (await scryptAsync(input.password, user.id)) === user.passwordHash;
    assert(result, "Invalid password");

    const payload: TokenPayload = { id: user.id };

    const token = jwt.sign(payload, Config.DE_SECRET_KEY, { expiresIn: "1h" }); // Expires in 1 hour

    SessionEvents.emit("loggedIn", `User "${user.name}" just logged in`);

    return { user, token };
  }),

  BeginOAuth: tRPC.PublicProcedure.input(v.parser(v.object({ return_auth: v.string() }))).query(({ input }) => {
    const url = new URL(`https://${Config.DE_AUTHENTIK_HOST}/application/o/authorize/`);

    url.searchParams.set("client_id", Config.DE_AUTHENTIK_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.return_auth);
    url.searchParams.set("scopes", "openid profile email entitlements offline_access goauthentik.io/api");

    return {
      url: url.toString(),
    };
  }),

  CompleteOAuth: tRPC.PublicProcedure.input(v.parser(v.object({ code: v.string(), return_auth: v.string() }))).mutation(
    async ({ input }) => {
      const authentikService = new AuthentikService();

      const { access_token, refresh_token } = await authentikService.getTokenWithAuthenticationCode(
        input.code,
        input.return_auth,
      );

      const authentikUserClient = new AuthentikUserClient(access_token);

      const userData = await authentikUserClient.getUserInfo();

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
          passwordHash: "Authentik",
          refreshToken: refresh_token,
        });
      } else {
        id = matchingUsers[0].id;

        await db
          .update(UserTable)
          .set({
            email: userData.email,
            name: userData.name,
            role: shouldBeAdmin ? "admin" : "user",
            refreshToken: refresh_token,
          })
          .where(eq(UserTable.id, id));
      }

      const user = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, id)));

      const payload: TokenPayload = { id };

      const token = jwt.sign(payload, Config.DE_SECRET_KEY, { expiresIn: "1h" }); // Expires in 1 hour

      SessionEvents.emit("loggedIn", `User "${user.name}" just logged in`);

      return {
        token,
        user,
      };
    },
  ),

  GetMfaInfo: tRPC.PublicProcedure.input(v.parser(v.object({}))).mutation(
    async ({ ctx, input }) => {
      assert(ctx.session, "MFA: No session!");

      return ctx.session.mfaHelper.getMfaInfo();
    },
  ),

  SendMfaToken: tRPC.PublicProcedure.input(v.parser(v.object({ token: v.string() }))).mutation(
    async ({ ctx, input }) => {
      assert(ctx.session, "MFA: No session!");

      return ctx.session.mfaHelper.checkMfaToken(input.token);
    },
  ),

  Activity: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    for await (
      const [data] of on(SessionEvents, "loggedIn", {
        signal: opts.signal,
      })
    ) {
      yield data as string;
    }
  }),
});
