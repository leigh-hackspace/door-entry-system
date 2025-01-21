import { UserCreateSchema, UserUpdateSchema } from "@door-entry-management-system/common";
import { and, eq, ilike, or } from "drizzle-orm";
import * as uuid from "npm:uuid";
import { assert } from "ts-essentials";
import * as v from "valibot";
import { db, UserTable } from "../db/index.ts";
import { scryptAsync } from "../services/index.ts";
import { assertOneRecord, assertRole, PaginationSchema, toDrizzleOrderBy, UUID, withId } from "./common.ts";
import { tRPC } from "./trpc.ts";

const UserSearchSchema = v.intersect([PaginationSchema]);

export const UserRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(UserSearchSchema)).query(
    async ({ input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search
        ? or(ilike(UserTable.email, `%${search}%`), ilike(UserTable.name, `%${search}%`))
        : and();

      const condition = and(quickSearchCondition);

      const query = db
        .select()
        .from(UserTable)
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(UserTable, orderBy));

      const rows = await query;
      const total = await db.$count(UserTable, condition);

      return { rows, total } as const;
    }
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ input }) => {
    return assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, input)));
  }),

  Create: tRPC.ProtectedProcedure.input(v.parser(UserCreateSchema)).mutation(async ({ ctx, input }) => {
    assertRole(ctx, "admin");

    const { new_password, confirm_password, ...rest } = input;

    const id = uuid.v4();

    assert(new_password === confirm_password, "Passwords do not match");

    const password_hash = await scryptAsync(new_password, id);

    rest.email = rest.email.toLowerCase();

    await db.insert(UserTable).values({ id, ...rest, password_hash });

    return id;
  }),

  Update: tRPC.ProtectedProcedure.input(v.parser(withId(UserUpdateSchema))).mutation(({ ctx, input: [id, fields] }) => {
    assertRole(ctx, "admin");

    const { new_password, confirm_password, ...rest } = fields;

    if (rest.email) rest.email = rest.email.toLowerCase();

    return db.transaction(async (tx) => {
      await tx
        .update(UserTable)
        .set({ ...rest, updated: new Date() })
        .where(eq(UserTable.id, id));

      if (new_password) {
        assert(new_password === confirm_password, "Passwords do not match");

        const password_hash = await scryptAsync(new_password, id);
        console.log("password_hash", password_hash);

        await tx.update(UserTable).set({ password_hash }).where(eq(UserTable.id, id));
      }
    });
  }),

  Delete: tRPC.ProtectedProcedure.input(v.parser(UUID)).mutation(async ({ ctx, input }) => {
    assertRole(ctx, "admin");

    await db.delete(UserTable).where(eq(UserTable.id, input));
  }),
});
