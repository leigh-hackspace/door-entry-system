import { relations, sql } from "drizzle-orm";
import { boolean, date, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { ElementOf } from "ts-essentials";
import * as v from "valibot";
import { ActivityLogAction, DeviceNameLength, IpAddressLength, IsoDateDb, TaskLogLevel, UserRole } from "../../../common/src/index.ts"; // Drizzle Kit bodge

export type TableType =
  | typeof UserTable
  | typeof TagTable
  | typeof ActivityLogTable
  | typeof DeviceTable
  | typeof TaskLogTable;

const UTC_NOW = sql`(NOW() AT TIME ZONE 'UTC')`;

export const ScryptKeyLength = 64;
const ScryptHashLength = 88; // Base64 length of 64 bytes

const GoCardlessCustomerIdLength = 14;
const GoCardlessPaymentIdLength = 14;

export const UserRoleEnum = pgEnum("user_role", UserRole);

export const MfaData = v.variant("type", [
  v.object({ type: v.literal("not_set") }),
  v.object({ type: v.literal("unconfirmed"), secret_key: v.string() }),
  v.object({
    type: v.literal("confirmed"),
    secret_key: v.string(),
    confirmed: v.pipe(
      v.string(),
      v.regex(IsoDateDb),
    ),
    challenges: v.record(v.string(), v.pipe(v.string(), v.regex(IsoDateDb))),
  }),
]);

export type MfaData = v.InferInput<typeof MfaData>;

export const UserTable = pgTable("user", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  role: UserRoleEnum("role").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 128 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: ScryptHashLength }).notNull(),
  refreshToken: varchar("refresh_token", { length: 128 }),
  gocardlessCustomerId: varchar("gocardless_customer_id", { length: GoCardlessCustomerIdLength }),
  notes: text("notes"),
  paidUp: boolean("paid_up").default(false).notNull(),
  mfaData: jsonb("mfa_data").notNull().$type<MfaData>().default({ type: "not_set" }),
  created: timestamp("created", { withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
  updated: timestamp("updated", { withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
});

export const UsersRelations = relations(UserTable, ({ many }) => ({
  tags: many(TagTable),
}));

export const TagCodeLength = 64;

export const TagTable = pgTable("tag", {
  id: uuid().primaryKey(),
  user_id: uuid("user_id").references(() => UserTable.id),
  code: varchar({ length: TagCodeLength }).notNull().unique(),
  description: varchar({ length: 128 }).notNull(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
});

export const TagRelations = relations(TagTable, ({ one }) => ({
  user: one(UserTable, {
    fields: [TagTable.user_id],
    references: [UserTable.id],
  }),
}));

export const ActivityLogActionEnum = pgEnum("activity_log_action", ActivityLogAction);

export const ActivityLogTable = pgTable("activity_log", {
  id: uuid().primaryKey(),
  user_id: uuid("user_id").references(() => UserTable.id),
  action: ActivityLogActionEnum().notNull(),
  code: varchar({ length: TagCodeLength }).notNull(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
});

export const ActivityLogRelations = relations(ActivityLogTable, ({ one }) => ({
  user: one(UserTable, {
    fields: [ActivityLogTable.user_id],
    references: [UserTable.id],
  }),
}));

export const DeviceTable = pgTable("device", {
  id: uuid().primaryKey(),
  name: varchar({ length: DeviceNameLength }).notNull().unique(),
  ip_address: varchar({ length: IpAddressLength }).notNull(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
});

export const PaymentStatus = [
  "pending_customer_approval",
  "pending_submission",
  "submitted",
  "confirmed",
  "paid_out",
  "cancelled",
  "customer_approval_denied",
  "failed",
  "charged_back",
] as const;
export type PaymentStatus = ElementOf<typeof PaymentStatus>;
export const PaymentStatusEnum = pgEnum("payment_status", PaymentStatus);

export const PaymentTable = pgTable("payment", {
  id: varchar({ length: GoCardlessPaymentIdLength }).primaryKey(),
  user_id: uuid("user_id")
    .references(() => UserTable.id)
    .notNull(),
  status: PaymentStatusEnum().notNull(),
  amount: numeric({ scale: 2, precision: 10 }).notNull(),
  charge_date: date({ mode: "date" }).notNull(),
  description: varchar({ length: 100 }).notNull(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().default(UTC_NOW),
});

export const PaymentRelations = relations(PaymentTable, ({ one }) => ({
  user: one(UserTable, {
    fields: [PaymentTable.user_id],
    references: [UserTable.id],
  }),
}));

export const TaskLogLevelEnum = pgEnum("log_level", TaskLogLevel);

export const TaskLogTable = pgTable("task_log", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  level: TaskLogLevelEnum().notNull(),
  job_started: timestamp({ withTimezone: false, mode: "date", precision: 3 }).notNull(),
  type: varchar({ length: 50 }).notNull(),
  notes: text(),
  data: jsonb()
    .notNull()
    .default(sql`'{}'`),
  created: timestamp({ withTimezone: false, mode: "date", precision: 3 }).notNull().default(UTC_NOW),
});
