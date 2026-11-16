import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./base";
import { users } from "./accounts";

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: idColumn(),
    name: varchar("name", { length: 120 }).notNull(),
    feeFCFA: integer("fee_fcfa").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("delivery_zones_name_uidx").on(table.name),
    check("delivery_zones_fee_nonnegative_check", sql`${table.feeFCFA} >= 0`),
  ],
);

export const departments = pgTable(
  "departments",
  {
    id: idColumn(),
    code: varchar("code", { length: 16 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("departments_code_uidx").on(table.code),
    uniqueIndex("departments_name_uidx").on(table.name),
  ],
);

export const communes = pgTable(
  "communes",
  {
    id: idColumn(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    deliveryZoneId: uuid("delivery_zone_id").references(
      () => deliveryZones.id,
      { onDelete: "restrict" },
    ),
    name: varchar("name", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("communes_department_name_uidx").on(
      table.departmentId,
      table.name,
    ),
    index("communes_delivery_zone_idx").on(table.deliveryZoneId),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 80 }).notNull(),
    recipient: varchar("recipient", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "restrict" }),
    communeId: uuid("commune_id")
      .notNull()
      .references(() => communes.id, { onDelete: "restrict" }),
    neighborhood: varchar("neighborhood", { length: 160 }).notNull(),
    landmark: text("landmark").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("addresses_user_idx").on(table.userId),
    uniqueIndex("addresses_one_default_per_user_uidx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true AND ${table.deletedAt} IS NULL`),
  ],
);

