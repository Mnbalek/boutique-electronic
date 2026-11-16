import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./base";
import { users } from "./accounts";
import { categories, products } from "./catalog";
import { orders } from "./commerce";
import { promotionScopeEnum, promotionTypeEnum } from "./enums";

export const promotions = pgTable(
  "promotions",
  {
    id: idColumn(),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 80 }),
    type: promotionTypeEnum("type").notNull(),
    value: integer("value").notNull(),
    scope: promotionScopeEnum("scope").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    minimumOrderFCFA: integer("minimum_order_fcfa").notNull().default(0),
    maxUses: integer("max_uses"),
    active: boolean("active").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("promotions_code_lower_uidx")
      .on(sql`lower(${table.code})`)
      .where(sql`${table.code} IS NOT NULL`),
    check("promotions_value_positive_check", sql`${table.value} > 0`),
    check("promotions_percent_range_check", sql`${table.type} <> 'percentage' OR (${table.value} >= 1 AND ${table.value} <= 90)`),
    check("promotions_minimum_nonnegative_check", sql`${table.minimumOrderFCFA} >= 0`),
    check("promotions_max_uses_positive_check", sql`${table.maxUses} IS NULL OR ${table.maxUses} > 0`),
    check("promotions_date_order_check", sql`${table.endsAt} >= ${table.startsAt}`),
    check("promotions_scope_category_check", sql`(${table.scope} = 'category') = (${table.categoryId} IS NOT NULL)`),
  ],
);

export const promotionProducts = pgTable(
  "promotion_products",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.promotionId, table.productId] }),
    uniqueIndex("promotion_products_product_promotion_uidx").on(
      table.productId,
      table.promotionId,
    ),
  ],
);

export const promotionUsages = pgTable(
  "promotion_usages",
  {
    id: idColumn(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    discountFCFA: integer("discount_fcfa").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("promotion_usages_order_uidx").on(table.orderId),
    check("promotion_usages_discount_nonnegative_check", sql`${table.discountFCFA} >= 0`),
  ],
);

