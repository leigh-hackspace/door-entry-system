import { Config } from "@/config";
import { type DataField, type DataModel, type FieldsToObject, type FieldsWithSelect, SearchArgs, UUID, withId } from "@/model";
import { assertError, RowSelection, type UserRole } from "@door-entry-management-system/common";
// @deno-types="@types/jsonwebtoken"
import jwt from "jsonwebtoken";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { tRPC } from "./trpc.ts";

export * from "../model/common.ts"; // Temp

export interface TokenPayload {
  id: string;
}

export type ValidToken = readonly ["valid", TokenPayload];
export type ExpiredToken = readonly ["expired", undefined];
export type InvalidToken = readonly ["invalid", undefined];
export type AnonymousNoToken = readonly ["anon", undefined];

export type TokenResponse = ValidToken | ExpiredToken | InvalidToken | AnonymousNoToken;

export function verifyToken(token: string | undefined): TokenResponse {
  if (!token) return ["anon", undefined];

  try {
    const payload = jwt.verify(token, Config.DE_SECRET_KEY) as TokenPayload;
    return ["valid", payload];
  } catch (err) {
    assertError(err);

    if (err instanceof jwt.TokenExpiredError) {
      return ["expired", undefined];
    }

    return ["invalid", undefined];
  }
}

export function assertRole(ctx: tRPC.Context, role: UserRole) {
  assert(ctx.session?.user.role === role, `Must be role of "${role}". You are "${ctx.session?.user.role ?? "Anon"}."`);
}

export function getRouter<
  TFields extends Record<string, DataField>,
  TSelect extends FieldsToObject<FieldsWithSelect<TFields>>,
>(dataModel: DataModel<TFields, TSelect>, _fields: TFields) {
  return tRPC.router({
    Search: tRPC.ProtectedProcedure.input(v.parser(SearchArgs)).query(async ({ ctx, input }) => {
      return dataModel.search(ctx.session.user, input);
    }),

    GetOne: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ ctx, input }) => {
      return dataModel.getOne(ctx.session.user, input);
    }),

    Create: tRPC.ProtectedProcedure.input(v.parser(dataModel.getCreateSchema())).mutation(async ({ ctx, input }) => {
      return dataModel.create(ctx.session.user, input!);
    }),

    Update: tRPC.ProtectedProcedure.input(v.parser(withId(dataModel.getUpdateSchema()))).mutation(async ({ ctx, input: [id, fields] }) => {
      return dataModel.update(ctx.session.user, id, fields);
    }),

    Delete: tRPC.ProtectedProcedure.input(RowSelection).mutation(async ({ ctx, input: { ids } }) => {
      return dataModel.delete(ctx.session.user, ids);
    }),
  });
}
