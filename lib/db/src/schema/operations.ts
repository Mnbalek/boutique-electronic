import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./base";
import { orders } from "./commerce";
import { users } from "./accounts";
import { cancellationStatusEnum, refundOriginEnum, refundStatusEnum } from "./enums";

export const cancellationRequests = pgTable(
  "cancellation_requests",
  {
    id: idColumn(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: cancellationStatusEnum("status").notNull().default("pending_decision"),
    reason: text("reason").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("cancellation_requests_order_created_idx").on(table.orderId, table.createdAt),
    check("cancellation_requests_reason_nonempty_check", sql`length(trim(${table.reason})) > 0`),
    check("cancellation_requests_decision_check", sql`(${table.status} = 'pending_decision' AND ${table.decidedAt} IS NULL) OR (${table.status} <> 'pending_decision' AND ${table.decidedAt} IS NOT NULL)`),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: idColumn(),
    reference: varchar("reference", { length: 32 }).notNull().unique(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    subject: varchar("subject", { length: 160 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("claims_user_created_idx").on(table.userId, table.createdAt),
    index("claims_status_created_idx").on(table.status, table.createdAt),
    check("claims_status_check", sql`${table.status} IN ('open', 'in_progress', 'resolved', 'closed')`),
    check("claims_content_nonempty_check", sql`length(trim(${table.subject})) > 0 AND length(trim(${table.message})) > 0`),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: idColumn(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "restrict" }),
    cancellationRequestId: uuid("cancellation_request_id").references(() => cancellationRequests.id, { onDelete: "restrict" }),
    origin: refundOriginEnum("origin").notNull(),
    status: refundStatusEnum("status").notNull().default("requested"),
    amountFCFA: integer("amount_fcfa").notNull(),
    reason: text("reason").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps(),
  },
  (table) => [
    index("refunds_order_created_idx").on(table.orderId, table.createdAt),
    check("refunds_amount_positive_check", sql`${table.amountFCFA} > 0`),
    check("refunds_origin_reference_check", sql`(${table.origin} = 'cancellation' AND ${table.cancellationRequestId} IS NOT NULL AND ${table.claimId} IS NULL) OR (${table.origin} = 'claim' AND ${table.claimId} IS NOT NULL AND ${table.cancellationRequestId} IS NULL) OR (${table.origin} = 'insufficient_stock' AND ${table.claimId} IS NULL AND ${table.cancellationRequestId} IS NULL)`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: idColumn(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ipAddress: varchar("ip_address", { length: 64 }),
    ...timestamps(),
  },
  (table) => [index("audit_logs_entity_created_idx").on(table.entityType, table.entityId, table.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    message: text("message").notNull(),
    link: text("link"),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("notifications_user_idempotency_uidx").on(table.userId, table.idempotencyKey),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: idColumn(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    template: varchar("template", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("email_outbox_idempotency_uidx").on(table.idempotencyKey),
    index("email_outbox_pending_idx").on(table.status, table.availableAt),
    check("email_outbox_status_check", sql`${table.status} IN ('pending', 'sending', 'sent', 'failed')`),
    check("email_outbox_attempts_nonnegative_check", sql`${table.attempts} >= 0`),
  ],
);
