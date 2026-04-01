import * as v from "valibot";
import { tRPC } from "./trpc.ts";
import { TaskLogDataModel, TaskLogGetFilterOptions, TaskLogSearch, UUID } from "@/model";

export function getTaskLogRouter() {
  const dataModel = new TaskLogDataModel();

  return tRPC.router({
    search: tRPC.ProtectedProcedure.input(v.parser(TaskLogSearch)).query(async ({ ctx, input }) => {
      return dataModel.search(ctx.session.user, input);
    }),

    getOne: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
      return dataModel.getOne(ctx.session.user, input);
    }),

    getFilterOptions: tRPC.ProtectedProcedure.input(v.parser(TaskLogGetFilterOptions)).query(async ({ ctx, input }) => {
      return dataModel.getFilterOptions(ctx.session.user, input);
    }),
  });
}
