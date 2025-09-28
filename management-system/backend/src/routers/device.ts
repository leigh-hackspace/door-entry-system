import { db, DeviceTable, UserTable } from "@/db";
import { DeviceEvents, GlobalDeviceCollectionWs } from "@/services";
import { and, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import { on } from "node:events";
import * as v from "valibot";
import { assertOneRecord, PaginationSchema, toDrizzleOrderBy, UUID } from "./common.ts";
import { tRPC } from "./trpc.ts";

const DeviceSearchSchema = v.intersect([PaginationSchema]);

export const DeviceRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(DeviceSearchSchema)).query(
    async ({ ctx, input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search ? or(ilike(DeviceTable.ip_address, `%${search}%`), ilike(UserTable.name, `%${search}%`)) : and();

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
    },
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    return assertOneRecord(await db.select().from(DeviceTable).where(eq(DeviceTable.id, input)));
  }),

  Stats: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    // const device = assertOneRecord(await db.select().from(DeviceTable).where(eq(DeviceTable.id, input)));

    const connection = GlobalDeviceCollectionWs.getDeviceConnection(input);
    if (!connection) return null;

    return {
      file_list: await connection.listFiles(),
    };
  }),

  DownloadFile: tRPC.ProtectedProcedure.input(v.object({ device_id: UUID, file_name: v.string() })).query(async ({ ctx, input }) => {
    const connection = GlobalDeviceCollectionWs.getDeviceConnection(input.device_id);
    if (!connection) return null;

    return {
      file_data: await connection.getBinaryFile(input.file_name),
    };
  }),

  UploadFile: tRPC.ProtectedProcedure.input(v.object({ device_id: UUID, file_name: v.string(), file_data: v.any() })).mutation(
    async ({ ctx, input }) => {
      const connection = GlobalDeviceCollectionWs.getDeviceConnection(input.device_id);
      if (!connection) return null;

      await connection.pushBinaryFile(input.file_name, input.file_data);
    },
  ),

  DeleteFile: tRPC.ProtectedProcedure.input(v.object({ device_id: UUID, file_name: v.string() })).mutation(
    async ({ ctx, input }) => {
      const connection = GlobalDeviceCollectionWs.getDeviceConnection(input.device_id);
      if (!connection) return null;

      await connection.deleteFile(input.file_name);
    },
  ),

  PlayFile: tRPC.ProtectedProcedure.input(v.object({ device_id: UUID, file_name: v.string() })).query(
    async ({ ctx, input }) => {
      const connection = GlobalDeviceCollectionWs.getDeviceConnection(input.device_id);
      if (!connection) return null;

      await connection.playFile(input.file_name);
    },
  ),

  Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
    if (ctx.session.user.role !== "admin") throw new Error("No access");

    await db.delete(DeviceTable).where(eq(DeviceTable.id, input));
  }),

  Progress: tRPC.ProtectedProcedure.subscription(async function* (opts) {
    for await (
      const [data] of on(DeviceEvents, "fileProgress", {
        signal: opts.signal,
      })
    ) {
      yield data as string;
    }
  }),
});
