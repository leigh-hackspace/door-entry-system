import { Config } from "@/config";
import { ActivityLogTable, db, UserTable } from "@/db";
import { DeviceEvents } from "@/services";
import type { ScanEvent } from "@door-entry-management-system/common";
import { and, count, desc, eq, getTableColumns, ilike, inArray, or } from "drizzle-orm";
import { on } from "node:events";
import * as v from "valibot";
import { PaginationSchema, SearchSchema, toDrizzleOrderBy } from "./common.ts";
import { tRPC } from "./trpc.ts";

const ActivityLogSearchSchema = v.intersect([PaginationSchema, SearchSchema]);

export const ActivityLogRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(ActivityLogSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search ? or(ilike(ActivityLogTable.code, `%${search}%`), ilike(UserTable.name, `%${search}%`)) : and();

      let user_id: string | undefined;

      // Normal users can only see logs belonging to them
      if (ctx.session.user.role !== "admin") {
        user_id = ctx.session.user.id;
      }

      const condition = and(quickSearchCondition, user_id ? eq(ActivityLogTable.user_id, user_id) : undefined);

      const query = db
        .select({ ...getTableColumns(ActivityLogTable), user_name: UserTable.name })
        .from(ActivityLogTable)
        .leftJoin(UserTable, eq(ActivityLogTable.user_id, UserTable.id))
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(ActivityLogTable, orderBy, { user_name: UserTable.name }));

      const rows = await query;

      const [{ count: total }] = await db
        .select({ count: count() })
        .from(ActivityLogTable)
        .leftJoin(UserTable, eq(ActivityLogTable.user_id, UserTable.id))
        .where(condition);

      return { rows, total } as const;
    },
  ),

  UnknownScans: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    const results = await db
      .select()
      .from(ActivityLogTable)
      .where(inArray(ActivityLogTable.action, ["denied-unassigned", "denied-unknown-code"]))
      .orderBy(desc(ActivityLogTable.created))
      .limit(1);

    if (results.length > 0) {
      const lastScan = results[0];

      yield { code: lastScan.code, time: lastScan.created } satisfies ScanEvent;
    }

    for await (
      const [data] of on(DeviceEvents, "unknownScans", {
        signal: opts.signal,
      })
    ) {
      yield data as ScanEvent;
    }
  }),
});

if (Config.DE_MODE === "development") {
  setInterval(() => {
    DeviceEvents.emit("unknownScans", {
      code: Math.random().toString(),
      time: new Date(),
    });
  }, 10_000);
}
