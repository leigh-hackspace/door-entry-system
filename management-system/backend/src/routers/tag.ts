import { AddCodeToUserReq, TagDataModel, TagSearchArgs, withId } from "@/model";
import type { DeviceCollection } from "@/services";
import { RowSelection } from "@door-entry-management-system/common";
import * as v from "valibot";
import { UUID } from "./common.ts";
import { tRPC } from "./trpc.ts";

export function getTagRouter(deviceCollection: DeviceCollection) {
  const dataModel = new TagDataModel(deviceCollection);

  return tRPC.router({
    search: tRPC.ProtectedProcedure.input(v.parser(TagSearchArgs)).query(async ({ ctx, input }) => {
      return dataModel.search(ctx.session.user, input);
    }),

    getOne: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
      return dataModel.getOne(ctx.session.user, input);
    }),

    create: tRPC.ProtectedProcedure.input(v.parser(dataModel.getCreateSchema())).mutation(async ({ ctx, input }) => {
      return dataModel.create(ctx.session.user, input!);
    }),

    update: tRPC.ProtectedProcedure.input(v.parser(withId(dataModel.getUpdateSchema()))).mutation(async ({ ctx, input: [id, fields] }) => {
      return dataModel.update(ctx.session.user, id, fields);
    }),

    delete: tRPC.ProtectedProcedure.input(RowSelection).mutation(async ({ ctx, input: { ids } }) => {
      return dataModel.delete(ctx.session.user, ids);
    }),

    addCodeToUser: tRPC.ProtectedProcedure.input(v.parser(AddCodeToUserReq)).mutation(async ({ ctx, input }) => {
      return dataModel.addCodeToUser(ctx.session.user, input);
    }),
  });
}
