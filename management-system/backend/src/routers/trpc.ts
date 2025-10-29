import { db, UserTable } from "@/db";
import { AuthentikService, AuthentikUserClient } from "@/services";
import { assertUnreachable } from "@door-entry-management-system/common";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { assertOneRecord, verifyToken } from "./common.ts";

// deno-lint-ignore no-namespace
export namespace tRPC {
  const tRPC = initTRPC.context<Context>().create({
    transformer: superjson,
  });

  export const createContext = async (opts: CreateHTTPContextOptions) => {
    let authorization = opts.info.connectionParams?.authorization;
    if (!authorization) authorization = opts.req.headers["authorization"];

    const session = await getSession(authorization);

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

  async function getSession(authorization: string | undefined) {
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

      return {
        user,
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
