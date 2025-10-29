import { db, PaymentTable, UserTable } from "@/db";
import { getHexEncodedSha256, GoCardlessService, scryptAsync } from "@/services";
import { RowSelection, UserCreateSchema, UserUpdateSchema } from "@door-entry-management-system/common";
import { and, eq, ilike, inArray, notInArray, or } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { assert } from "ts-essentials";
import * as uuid from "uuid";
import * as v from "valibot";
import { assertOneRecord, assertRole, PaginationSchema, toDrizzleOrderBy, UUID, withId } from "./common.ts";
import { tRPC } from "./trpc.ts";

const UserSearchSchema = v.intersect([PaginationSchema]);

export const UserRouter = tRPC.router({
  Search: tRPC.ProtectedProcedure.input(v.parser(UserSearchSchema)).query(
    async ({ input: { take, skip, orderBy, search } }) => {
      const quickSearchCondition = search ? or(ilike(UserTable.email, `%${search}%`), ilike(UserTable.name, `%${search}%`)) : and();

      const condition = and(quickSearchCondition);

      const query = db
        .select()
        .from(UserTable)
        .where(condition)
        .limit(take)
        .offset(skip)
        .orderBy(toDrizzleOrderBy(UserTable, orderBy));

      const db_rows = await query;
      const total = await db.$count(UserTable, condition);

      const rows = await Promise.all(
        db_rows.map(async (user) => ({
          ...user,
          image_url: "https://gravatar.com/avatar/" + (await getHexEncodedSha256(user.email)),
        })),
      );

      return { rows, total } as const;
    },
  ),

  One: tRPC.ProtectedProcedure.input(v.parser(UUID)).query(async ({ input }) => {
    const user = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, input)));

    const payments = await db.select().from(PaymentTable).where(eq(PaymentTable.user_id, input));

    return {
      ...user,
      payments,
    };
  }),

  Create: tRPC.ProtectedProcedure.input(v.parser(UserCreateSchema)).mutation(async ({ ctx, input }) => {
    assertRole(ctx, "admin");

    const { newPassword, confirmPassword, ...rest } = input;

    const id = uuid.v4();

    assert(newPassword === confirmPassword, "Passwords do not match");

    const passwordHash = await scryptAsync(newPassword, id);

    rest.email = rest.email.toLowerCase();

    await db.insert(UserTable).values({ id, ...rest, passwordHash });

    return id;
  }),

  Update: tRPC.ProtectedProcedure.input(v.parser(withId(UserUpdateSchema))).mutation(
    async ({ ctx, input: [id, fields] }) => {
      assertRole(ctx, "admin");

      const { newPassword, confirmPassword, ...rest } = fields;

      if (newPassword) {
        assert(newPassword === confirmPassword, "Passwords do not match");
      }

      const currentUser = assertOneRecord(await db.select().from(UserTable).where(eq(UserTable.id, id)));

      const update: PgUpdateSetSource<typeof UserTable> = {
        ...rest,
        updated: new Date(),
      };

      if (rest.email) {
        update.email = rest.email.toLowerCase();

        if (!currentUser.gocardlessCustomerId) {
          try {
            const goCardlessService = new GoCardlessService();

            update.gocardlessCustomerId = await goCardlessService.getCustomerId(update.email);
          } catch (err: unknown) {
            console.error("goCardlessService.getCustomerId", err);
          }
        }
      }

      if (newPassword) {
        update.passwordHash = await scryptAsync(newPassword, id);
      }

      await db.update(UserTable).set(update).where(eq(UserTable.id, id));
    },
  ),

  Delete: tRPC.ProtectedProcedure.input(RowSelection).mutation(async ({ ctx, input: { ids, mode } }) => {
    assertRole(ctx, "admin");

    const where = mode === "noneBut" ? inArray(UserTable.id, ids) : notInArray(UserTable.id, ids.slice());

    await db.delete(UserTable).where(where);
  }),
});
