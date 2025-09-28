import { eq, ilike } from "drizzle-orm";
import { on } from "node:events";
import * as uuid from "npm:uuid";
import type { ElementOf } from "ts-essentials";
import * as v from "valibot";
import { ActivityLogTable, db, TagTable, UserTable } from "@/db";
import { AuthentikService, DeviceEvents, GlobalDeviceCollectionWs } from "@/services";
import { assertRole } from "./common.ts";
import { tRPC } from "./trpc.ts";

export const StatsRouter = tRPC.router({
  AdminStats: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async ({ ctx }) => {
    assertRole(ctx, "admin");

    const userCount = await db.$count(UserTable);
    const tagCount = await db.$count(TagTable);
    const scanCount = await db.$count(ActivityLogTable);

    return { userCount, tagCount, scanCount };
  }),

  UserStats: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async ({ ctx }) => {
    const tagCount = await db.$count(TagTable, eq(TagTable.user_id, ctx.session.user.id));
    const scanCount = await db.$count(ActivityLogTable, eq(ActivityLogTable.user_id, ctx.session.user.id));

    return { tagCount, scanCount };
  }),

  SetLatch: tRPC.ProtectedProcedure.input(v.parser(v.object({ latch: v.boolean() }))).mutation(
    async ({ ctx, input }) => {
      await GlobalDeviceCollectionWs.pushLatchStateAll(input.latch);
    },
  ),

  DeviceState: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    const eventName = "update";

    for await (
      const [data] of on(DeviceEvents, eventName, {
        signal: opts.signal,
      })
    ) {
      yield data as ElementOf<DeviceEvents[typeof eventName]>;
    }
  }),

  SyncAuthentik: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).mutation(async ({ ctx, input }) => {
    const authentikService = new AuthentikService();

    const res = await authentikService.getAllUsers();

    let addedUsers = 0,
      updatedUsers = 0;

    for (const apiUser of res.results) {
      if (apiUser.email === "" || !apiUser.is_active) continue;

      const shouldBeAdmin = apiUser.groups_obj.map((g) => g.name).includes("Infra");
      const gocardless_customer_id = apiUser.attributes["leighhack.org/gocardless-customer-id"];

      const matchingUsers = await db.select().from(UserTable).where(ilike(UserTable.email, apiUser.email));

      let id: string;

      if (matchingUsers.length === 0) {
        id = apiUser.uuid ?? uuid.v4();

        await db.insert(UserTable).values({
          id,
          email: apiUser.email.toLowerCase(),
          name: apiUser.name,
          role: shouldBeAdmin ? "admin" : "user",
          password_hash: "Authentik",
          gocardless_customer_id,
        });

        addedUsers += 1;
      } else {
        id = matchingUsers[0].id;

        await db
          .update(UserTable)
          .set({
            email: apiUser.email.toLowerCase(),
            name: apiUser.name,
            role: shouldBeAdmin ? "admin" : "user",
            gocardless_customer_id,
          })
          .where(eq(UserTable.id, id));

        updatedUsers += 1;
      }
    }

    return { addedUsers, updatedUsers };
  }),
});
