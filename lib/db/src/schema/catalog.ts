import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./base";

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "inactive",
  "archived",
]);

export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    imageUrl: text("image_url"),
    featured: boolean("featured").notNull().default(false),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("categories_slug_uidx").on(table.slug),
    index("categories_parent_position_idx").on(table.parentId, table.position),
    check("categories_parent_not_self_check", sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: idColumn(),
    reference: varchar("reference", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    priceFCFA: integer("price_fcfa").notNull(),
    compareAtPriceFCFA: integer("compare_at_price_fcfa"),
    stockPhysical: integer("stock_physical").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    attributes: jsonb("attributes")
      .$type<Array<{ label: string; value: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: productStatusEnum("status").notNull().default("draft"),
    isNewUntil: timestamp("is_new_until", { withTimezone: true }),
    popularity: integer("popularity").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("products_reference_uidx").on(table.reference),
    uniqueIndex("products_slug_uidx").on(table.slug),
    index("products_category_status_idx").on(table.categoryId, table.status),
    index("products_price_idx").on(table.priceFCFA),
    check("products_price_positive_check", sql`${table.priceFCFA} > 0`),
    check("products_compare_price_nonnegative_check", sql`${table.compareAtPriceFCFA} IS NULL OR ${table.compareAtPriceFCFA} >= 0`),
    check("products_stock_nonnegative_check", sql`${table.stockPhysical} >= 0`),
    check("products_low_stock_nonnegative_check", sql`${table.lowStockThreshold} >= 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    cloudinaryPublicId: varchar("cloudinary_public_id", { length: 255 }).notNull(),
    url: text("url").notNull(),
    altText: varchar("alt_text", { length: 255 }).notNull(),
    position: integer("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("product_images_cloudinary_id_uidx").on(table.cloudinaryPublicId),
    uniqueIndex("product_images_product_position_uidx").on(
      table.productId,
      table.position,
    ),
    uniqueIndex("product_images_one_primary_uidx")
      .on(table.productId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

