import { db, UserTable } from "@/db";
import { AuthentikService, AuthentikUserClient } from "@/services";
import { assertUnreachable } from "@door-entry-management-system/common";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { assert } from "ts-essentials";
import { assertOneRecord, type SessionUser, verifyToken } from "./common.ts";
import { MfaHelper } from "./mfa-helper.ts";

export interface Session {
  readonly user: SessionUser;
  readonly remoteAddress: string;
  readonly mfaPassed: boolean;
  readonly mfaHelper: MfaHelper;
}

// deno-lint-ignore no-namespace
export namespace tRPC {
  const tRPC = initTRPC.context<Context>().create({
    transformer: superjson,
  });

  export const createContext = async (opts: CreateHTTPContextOptions) => {
    const isMfa = opts.info.calls.some((c) => c.path.toLowerCase().includes("mfa"));

    let authorization = opts.info.connectionParams?.authorization;
    if (!authorization) authorization = opts.req.headers["authorization"];

    assert(opts.req.socket.remoteAddress, "No remoteAddress!");

    const session = await getSession(authorization, isMfa, opts.req.socket.remoteAddress);

    const getAuthentikUserClient = async () => {
      if (!session?.user.refreshToken) throw new Error("No refresh_token!");

      const authentikService = new AuthentikService();

      const { access_token, refresh_token } = await authentikService.getTokenWithRefreshToken(
        session.user.refreshToken,
      );

      await db.update(UserTable).set({ refreshToken: refresh_token }).where(eq(UserTable.id, session.user.id));

      return new AuthentikUserClient(access_token);
    };

    return {
      session,
      getAuthentikUserClient,
    };
  };

  async function getSession(authorization: string | undefined, isMfaRoute: boolean, remoteAddress: string): Promise<Session | undefined> {
    const verifyResponse = verifyToken(authorization);

    if (verifyResponse[0] === "expired") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Expired token",
      });
    }

    if (verifyResponse[0] === "invalid") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid token",
      });
    }

    if (verifyResponse[0] === "valid") {
      const userId = verifyResponse[1].id;

      const user = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, userId)));

      const mfaHelper = new MfaHelper(user, remoteAddress);

      const mfaPassed = mfaHelper.getMfaPassed();

      const triggerChallenge = !isMfaRoute && // Need to allow MFA routes to still function before MFA challenge passed
        user.role === "admin" && // Only "admin" role requires MFA (for now)
        !mfaPassed; // Only if MFA challenge is not already passed

      if (triggerChallenge) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "MFA Required",
        });
      }

      return {
        user,
        remoteAddress,
        mfaPassed,
        mfaHelper,
      };
    }

    if (verifyResponse[0] === "anon") {
      return undefined;
    }

    assertUnreachable(verifyResponse);
  }

  export type Context = Awaited<ReturnType<typeof createContext>>;

  export const router = tRPC.router;

  export const mergeRouters = tRPC.mergeRouters;

  export const PublicProcedure = tRPC.procedure;

  export const ProtectedProcedure = tRPC.procedure.use((opts) => {
    if (!opts.ctx.session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
      });
    }

    return opts.next({
      ctx: {
        // Infers the `session` as non-nullable
        session: opts.ctx.session,
      },
    });
  });
}
