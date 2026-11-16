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
import { accountStatusEnum, userRoleEnum } from "./enums";
import { idColumn, timestamps } from "./base";

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    role: userRoleEnum("role").notNull().default("customer"),
    status: accountStatusEnum("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_email_lower_uidx").on(sql`lower(${table.email})`),
    uniqueIndex("users_single_admin_uidx")
      .on(table.role)
      .where(sql`${table.role} = 'admin'`),
    check("users_email_nonempty_check", sql`length(trim(${table.email})) > 0`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    index("sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("password_reset_token_hash_uidx").on(table.tokenHash),
    index("password_reset_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: idColumn(),
    key: varchar("key", { length: 255 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("rate_limit_key_action_window_uidx").on(
      table.key,
      table.action,
      table.windowStart,
    ),
    check("rate_limit_count_nonnegative_check", sql`${table.count} >= 0`),
    index("rate_limit_window_idx").on(table.windowStart),
  ],
);

