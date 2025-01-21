import * as v from "valibot";
import { db } from "../db/index.ts";
import { ActivityLogTable, UserTable } from "../db/schema.ts";
import { tRPC } from "./trpc.ts";

export const StatsRouter = tRPC.router({
  Stats: tRPC.ProtectedProcedure.input(v.parser(v.object({}))).query(async () => {
    const userCount = await db.$count(UserTable);
    const scanCount = await db.$count(ActivityLogTable);

    return { userCount, scanCount };
  }),
});
