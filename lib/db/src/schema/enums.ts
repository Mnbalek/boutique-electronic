import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["customer", "admin"]);
export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "disabled",
  "anonymized",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "payment_failed",
  "expired",
  "cancelled",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "expired",
  "anomaly",
]);
export const paymentModeEnum = pgEnum("payment_mode", [
  "sandbox",
  "mock",
  "production",
]);
export const stockReservationStatusEnum = pgEnum("stock_reservation_status", [
  "active",
  "consumed",
  "released",
  "expired",
]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "initial",
  "sale",
  "cancellation",
  "adjustment",
]);
export const promotionTypeEnum = pgEnum("promotion_type", [
  "percentage",
  "fixed_amount",
]);
export const promotionScopeEnum = pgEnum("promotion_scope", [
  "order",
  "category",
  "products",
]);
export const cancellationStatusEnum = pgEnum("cancellation_status", [
  "pending_decision",
  "approved",
  "rejected",
]);
export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "approved",
  "rejected",
  "recorded_mock",
]);
export const refundOriginEnum = pgEnum("refund_origin", [
  "cancellation",
  "claim",
  "insufficient_stock",
]);
export const paymentEventSourceEnum = pgEnum("payment_event_source", [
  "webhook",
  "return",
  "admin",
]);

