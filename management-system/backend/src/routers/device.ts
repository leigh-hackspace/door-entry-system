import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import * as v from "valibot";
import { db, DeviceTable, UserTable } from "../db/index.ts";
import { GlobalDeviceCollection } from "../services/index.ts";
import { assertOneRecord, PaginationSchema, toDrizzleOrderBy, UUID } from "./common.ts";
import { tRPC } from "./trpc.ts";

const DeviceSearchSchema = v.intersect([PaginationSchema]);

export const DeviceRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(DeviceSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search
        ? or(ilike(DeviceTable.ip_address, `%${search}%`), ilike(UserTable.name, `%${search}%`))
        : and();

      if (ctx.session.user.role !== "admin") throw new Error("No access");

      const condition = and(quickSearchCondition);

      const query = db
        .select({ ...getTableColumns(DeviceTable) })
        .from(DeviceTable)
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(DeviceTable, orderBy));

      const rows = await query;

      const [{ count: total }] = await db.select({ count: count() }).from(DeviceTable).where(condition);

      return { rows, total } as const;
    }
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    return assertOneRecord(await db.select().from(DeviceTable).where(eq(DeviceTable.id, input)));
  }),

  Stats: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    const device = assertOneRecord(await db.select().from(DeviceTable).where(eq(DeviceTable.id, input)));

    const connection = GlobalDeviceCollection.getDeviceConnection(device.ip_address);
    if (!connection) return null;

    return connection.getStats();
  }),

  Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    await db.delete(DeviceTable).where(eq(DeviceTable.id, input));

    await GlobalDeviceCollection.reloadDevices();
  }),
});
