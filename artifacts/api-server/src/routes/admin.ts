import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "@workspace/db";
import { getDb } from "@workspace/db";
import {
  auditLogs,
  notifications,
  orderItems,
  orderStatusHistory,
  orders,
  paymentAttempts,
  paymentEvents,
  products,
  stockMovements,
  stockReservations,
  users,
} from "@workspace/db/schema";
import { Hono, type Context } from "hono";
import { getAuthenticatedUser } from "./auth";

const router = new Hono();
const fail = (context: Context, status: 400 | 401 | 403 | 404 | 409, code: string, message: string) =>
  context.json({ error: { code, message } }, status);

async function requireAdmin(context: Context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return { error: fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.") } as const;
  if (user.role !== "admin") return { error: fail(context, 403, "INTERDIT", "Cette action est réservée à l’administrateur.") } as const;
  return { user } as const;
}

router.get("/admin/overview", async (context) => {
  const auth = await requireAdmin(context);
  if ("error" in auth) return auth.error;
  const db = getDb();
  const [statusRows, productCount, lowStockCount, customerCount, revenueRows] = await Promise.all([
    db.select({ status: orders.status, total: count() }).from(orders).groupBy(orders.status),
    db.select({ total: count() }).from(products),
    db.select({ total: count() }).from(products).where(and(eq(products.status, "active"), sql`${products.stockPhysical} <= ${products.lowStockThreshold}`)),
    db.select({ total: count() }).from(users).where(eq(users.role, "customer")),
    db.select({ total: sql<number>`COALESCE(SUM(${orders.totalFCFA}), 0)`.mapWith(Number) }).from(orders).where(inArray(orders.status, ["confirmed", "preparing", "shipped", "delivered"])),
  ]);
  const counts = Object.fromEntries(statusRows.map((row) => [row.status, row.total]));
  return context.json({ data: {
    ordersPendingPayment: counts.pending_payment ?? 0,
    ordersToPrepare: (counts.confirmed ?? 0) + (counts.preparing ?? 0),
    ordersShipped: counts.shipped ?? 0,
    products: productCount[0]?.total ?? 0,
    lowStockProducts: lowStockCount[0]?.total ?? 0,
    customers: customerCount[0]?.total ?? 0,
    simulatedRevenueFCFA: revenueRows[0]?.total ?? 0,
    paymentMode: "simulation",
  } });
});

router.get("/admin/orders", async (context) => {
  const auth = await requireAdmin(context);
  if ("error" in auth) return auth.error;
  const rows = await getDb().select({
    id: orders.id, reference: orders.reference, status: orders.status,
    totalFCFA: orders.totalFCFA, createdAt: orders.createdAt,
    firstName: users.firstName, lastName: users.lastName, email: users.email,
  }).from(orders).innerJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.createdAt)).limit(100);
  const orderIds = rows.map((row) => row.id);
  const paymentRows = orderIds.length ? await getDb().select({ orderId: paymentAttempts.orderId, status: paymentAttempts.status, providerStatus: paymentAttempts.providerStatus, createdAt: paymentAttempts.createdAt })
    .from(paymentAttempts).where(inArray(paymentAttempts.orderId, orderIds)).orderBy(desc(paymentAttempts.createdAt)) : [];
  const latestPayments = new Map<string, (typeof paymentRows)[number]>();
  for (const payment of paymentRows) if (!latestPayments.has(payment.orderId)) latestPayments.set(payment.orderId, payment);
  const data = rows.map((row) => {
    const payment = latestPayments.get(row.id);
    return { ...row, paymentStatus: payment?.status ?? null, paymentSimulation: payment?.providerStatus?.startsWith("admin_simulated_") ?? false };
  });
  return context.json({ data });
});

router.post("/admin/orders/:id/advance", async (context) => {
  const auth = await requireAdmin(context);
  if ("error" in auth) return auth.error;
  const orderId = context.req.param("id");
  const nextStatus = await getDb().transaction(async (tx) => {
    const [order] = await tx.select({ id: orders.id, reference: orders.reference, status: orders.status }).from(orders)
      .where(eq(orders.id, orderId)).for("update");
    if (!order) return { error: { status: 404 as const, code: "INTROUVABLE", message: "Cette commande n’existe pas." } };
    const next: Record<string, "preparing" | "shipped" | "delivered" | undefined> = {
      confirmed: "preparing", preparing: "shipped", shipped: "delivered",
    };
    const status = next[order.status];
    if (!status) return { error: { status: 409 as const, code: "TRANSITION_INTERDITE", message: "Cette commande ne peut pas avancer vers une autre étape." } };
    const now = new Date();
    await tx.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: order.status, toStatus: status, authorType: "admin", authorId: auth.user.id, reason: "Mise à jour par l’administrateur" });
    await tx.insert(auditLogs).values({ actorId: auth.user.id, action: `order.status.${status}`, entityType: "order", entityId: orderId, metadata: { reference: order.reference, from: order.status, to: status } });
    return { status };
  });
  if ("error" in nextStatus && nextStatus.error) return fail(context, nextStatus.error.status, nextStatus.error.code, nextStatus.error.message);
  return context.json({ data: { orderId, status: nextStatus.status } });
});

router.post("/admin/orders/:id/simulate-payment", async (context) => {
  const auth = await requireAdmin(context);
  if ("error" in auth) return auth.error;
  const body = await context.req.json().catch(() => null) as { outcome?: unknown } | null;
  if (body?.outcome !== "succeeded" && body?.outcome !== "failed") return fail(context, 400, "DONNEES_INVALIDES", "Choisissez une issue de paiement simulée.");
  const outcome = body.outcome;

  const db = getDb();
  const orderId = context.req.param("id");
  const now = new Date();
  const error = await db.transaction(async (tx): Promise<{ status: 404 | 409; code: string; message: string } | null> => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { status: 404, code: "INTROUVABLE", message: "Cette commande n’existe pas." };
    if (order.status !== "pending_payment" || (order.expiresAt && order.expiresAt <= now)) {
      return { status: 409, code: "COMMANDE_NON_SIMULABLE", message: "Seule une commande en attente de paiement peut être simulée." };
    }
    let [payment] = await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.orderId, orderId), eq(paymentAttempts.status, "pending")))
      .orderBy(desc(paymentAttempts.createdAt)).limit(1).for("update");
    if (!payment) {
      const [latest] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).orderBy(desc(paymentAttempts.createdAt)).limit(1);
      if (latest?.status !== "failed") return { status: 409, code: "TENTATIVE_ABSENTE", message: "Aucune tentative de paiement en attente n’est disponible." };
      [payment] = await tx.insert(paymentAttempts).values({ orderId, internalReference: `SIM-${order.reference}-${randomUUID()}`, amountFCFA: order.totalFCFA, currency: order.currency, mode: "mock", status: "pending", providerStatus: "admin_simulation_retry" }).returning();
    }

    if (outcome === "succeeded") {
      const lines = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity }).from(orderItems)
        .where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.productId));
      if (!lines.length) return { status: 409, code: "COMMANDE_VIDE", message: "La commande ne contient aucun article." };
      const ids = lines.map((line) => line.productId);
      const locked = await tx.select({ id: products.id, stock: products.stockPhysical }).from(products)
        .where(inArray(products.id, ids)).orderBy(asc(products.id)).for("update");
      const stockById = new Map(locked.map((product) => [product.id, product.stock]));
      if (lines.some((line) => (stockById.get(line.productId) ?? 0) < line.quantity)) return { status: 409, code: "STOCK_INSUFFISANT", message: "Le stock a changé; paiement simulé refusé." };
      for (const line of lines) {
        const before = stockById.get(line.productId)!;
        const after = before - line.quantity;
        await tx.update(products).set({ stockPhysical: after, updatedAt: now }).where(eq(products.id, line.productId));
        await tx.insert(stockMovements).values({ productId: line.productId, type: "sale", variation: -line.quantity, stockBefore: before, stockAfter: after, orderId, authorId: auth.user.id, reason: "Paiement simulé confirmé par l’administrateur" });
      }
      await tx.update(stockReservations).set({ status: "consumed", updatedAt: now }).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
      await tx.update(orders).set({ status: "confirmed", confirmedAt: now, updatedAt: now }).where(eq(orders.id, orderId));
      await tx.insert(orderStatusHistory).values({ orderId, fromStatus: "pending_payment", toStatus: "confirmed", authorType: "admin", authorId: auth.user.id, reason: "Paiement simulé confirmé" });
      await tx.insert(notifications).values({ userId: order.userId, type: "order_confirmed", title: "Commande confirmée", message: `La commande ${order.reference} est confirmée (paiement simulé).`, link: `/compte/commandes/${orderId}`, idempotencyKey: `admin-sim-payment:${orderId}` }).onConflictDoNothing();
    }

    const providerStatus = `admin_simulated_${outcome}`;
    await tx.update(paymentAttempts).set({ mode: "mock", status: outcome, providerStatus, verifiedAt: now, usefulResponse: { simulation: true, outcome, administratorId: auth.user.id }, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
    await tx.insert(paymentEvents).values({ source: "admin", providerTransactionId: null, payload: { simulation: true, outcome, internalReference: payment.internalReference, orderReference: order.reference }, reconciled: true, processedAt: now });
    await tx.insert(auditLogs).values({ actorId: auth.user.id, action: `payment.simulated.${outcome}`, entityType: "order", entityId: orderId, metadata: { reference: order.reference, amountFCFA: payment.amountFCFA } });
    return null;
  });
  if (error) return fail(context, error.status, error.code, error.message);
  return context.json({ data: { orderId, outcome, simulated: true } });
});

export default router;
