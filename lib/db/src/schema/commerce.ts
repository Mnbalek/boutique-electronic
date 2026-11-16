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
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./base";
import { users } from "./accounts";
import { products } from "./catalog";
import { orderStatusEnum, paymentModeEnum, paymentStatusEnum, paymentEventSourceEnum, stockMovementTypeEnum, stockReservationStatusEnum } from "./enums";

export const carts = pgTable(
  "carts",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("carts_user_uidx").on(table.userId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: idColumn(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceSeenFCFA: integer("unit_price_seen_fcfa").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_uidx").on(table.cartId, table.productId),
    check("cart_items_quantity_positive_check", sql`${table.quantity} > 0`),
    check("cart_items_price_nonnegative_check", sql`${table.unitPriceSeenFCFA} >= 0`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: idColumn(),
    reference: varchar("reference", { length: 32 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    shippingAddressSnapshot: jsonb("shipping_address_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    deliveryZoneSnapshot: jsonb("delivery_zone_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    subtotalFCFA: integer("subtotal_fcfa").notNull(),
    discountFCFA: integer("discount_fcfa").notNull().default(0),
    deliveryFeeFCFA: integer("delivery_fee_fcfa").notNull(),
    totalFCFA: integer("total_fcfa").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
    promotionId: uuid("promotion_id"),
    promotionSnapshot: jsonb("promotion_snapshot").$type<Record<string, unknown>>(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("orders_reference_uidx").on(table.reference),
    uniqueIndex("orders_user_idempotency_uidx").on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex("orders_one_pending_payment_per_user_uidx")
      .on(table.userId)
      .where(sql`${table.status} = 'pending_payment'`),
    index("orders_user_created_idx").on(table.userId, table.createdAt),
    index("orders_expiry_idx").on(table.expiresAt),
    check("orders_amounts_nonnegative_check", sql`
      ${table.subtotalFCFA} >= 0 AND ${table.discountFCFA} >= 0 AND
      ${table.deliveryFeeFCFA} >= 0 AND ${table.totalFCFA} >= 0
    `),
    check("orders_total_consistency_check", sql`${table.totalFCFA} = ${table.subtotalFCFA} - ${table.discountFCFA} + ${table.deliveryFeeFCFA}`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    nameSnapshot: varchar("name_snapshot", { length: 200 }).notNull(),
    referenceSnapshot: varchar("reference_snapshot", { length: 80 }).notNull(),
    unitPriceFCFA: integer("unit_price_fcfa").notNull(),
    quantity: integer("quantity").notNull(),
    discountFCFA: integer("discount_fcfa").notNull().default(0),
    lineTotalFCFA: integer("line_total_fcfa").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("order_items_order_product_uidx").on(table.orderId, table.productId),
    check("order_items_quantity_positive_check", sql`${table.quantity} > 0`),
    check("order_items_amounts_nonnegative_check", sql`${table.unitPriceFCFA} >= 0 AND ${table.discountFCFA} >= 0 AND ${table.lineTotalFCFA} >= 0`),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    internalReference: varchar("internal_reference", { length: 80 }).notNull(),
    providerTransactionId: varchar("provider_transaction_id", { length: 160 }),
    amountFCFA: integer("amount_fcfa").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
    mode: paymentModeEnum("mode").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    providerStatus: varchar("provider_status", { length: 80 }),
    usefulResponse: jsonb("useful_response").$type<Record<string, unknown>>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("payment_attempts_internal_ref_uidx").on(table.internalReference),
    uniqueIndex("payment_attempts_provider_txn_uidx")
      .on(table.providerTransactionId)
      .where(sql`${table.providerTransactionId} IS NOT NULL`),
    index("payment_attempts_order_created_idx").on(table.orderId, table.createdAt),
    check("payment_attempts_amount_nonnegative_check", sql`${table.amountFCFA} >= 0`),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: idColumn(),
    providerTransactionId: varchar("provider_transaction_id", { length: 160 }),
    source: paymentEventSourceEnum("source").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    reconciled: boolean("reconciled").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("payment_events_provider_idx").on(table.providerTransactionId)],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    status: stockReservationStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("stock_reservations_order_product_uidx").on(
      table.orderId,
      table.productId,
    ),
    index("stock_reservations_product_status_expiry_idx").on(
      table.productId,
      table.status,
      table.expiresAt,
    ),
    check("stock_reservations_quantity_positive_check", sql`${table.quantity} > 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    variation: integer("variation").notNull(),
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    reason: text("reason"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (table) => [
    index("stock_movements_product_created_idx").on(table.productId, table.createdAt),
    check("stock_movements_nonnegative_check", sql`${table.stockBefore} >= 0 AND ${table.stockAfter} >= 0`),
    check("stock_movements_balance_check", sql`${table.stockAfter} = ${table.stockBefore} + ${table.variation}`),
    check("stock_movements_adjustment_reason_check", sql`${table.type} <> 'adjustment' OR length(trim(coalesce(${table.reason}, ''))) > 0`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    authorType: varchar("author_type", { length: 20 }).notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    ...timestamps(),
  },
  (table) => [
    index("order_status_history_order_created_idx").on(table.orderId, table.createdAt),
    check("order_status_history_author_type_check", sql`${table.authorType} IN ('customer', 'admin', 'system')`),
  ],
);

