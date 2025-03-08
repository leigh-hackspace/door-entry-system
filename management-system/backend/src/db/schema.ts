import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { ActivityLogAction, DeviceNameLength, IpAddressLength, UserRole } from "../../../common/src/index.ts"; // Drizzle Kit bodge

export type TableType = typeof UserTable | typeof TagTable | typeof ActivityLogTable | typeof DeviceTable;

export const ScryptKeyLength = 64;
const ScryptHashLength = 88; // Base64 length of 64 bytes

export const UserRoleEnum = pgEnum("user_role", UserRole);

export const UserTable = pgTable("user", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  role: UserRoleEnum().notNull(),
  name: varchar({ length: 128 }).notNull(),
  email: varchar({ length: 128 }).notNull().unique(),
  password_hash: varchar({ length: ScryptHashLength }).notNull(),
  refresh_token: varchar({ length: 128 }),
  gocardless_customer_id: varchar({ length: 14 }),
  notes: text(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
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
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
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
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
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
  ip_address: varchar({ length: IpAddressLength }).notNull().unique(),
  created: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
  updated: timestamp({ withTimezone: false, mode: "date" }).notNull().defaultNow(),
});
