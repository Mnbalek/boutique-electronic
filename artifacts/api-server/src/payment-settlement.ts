import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray } from "@workspace/db";
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
} from "@workspace/db/schema";
import { verifyKkiapayTransaction, type KkiapayTransaction } from "./kkiapay";

export type PaymentResult = { orderId: string; status: "pending_payment" | "confirmed" | "expired"; paymentStatus: "pending" | "succeeded" | "failed" | "expired" | "anomaly" };
export type PaymentFailure = { status: 400 | 404 | 409 | 422 | 503; code: string; message: string };

function eventStatus(transaction: KkiapayTransaction) {
  return typeof transaction.status === "string" ? transaction.status.toUpperCase() : "";
}

async function recordFailedAttempt(orderId: string, paymentAttemptId: string, transactionId: string, response: KkiapayTransaction, source: "return" | "webhook") {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const [attempt] = await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.id, paymentAttemptId), eq(paymentAttempts.orderId, orderId))).for("update");
    if (!order || !attempt) return { error: { status: 404 as const, code: "PAIEMENT_INTROUVABLE", message: "Commande ou tentative de paiement introuvable." } };
    if (order.status !== "pending_payment" || attempt.status === "succeeded") {
      return { error: { status: 409 as const, code: "COMMANDE_NON_PAYABLE", message: "Cette commande ne peut plus être payée." } };
    }
    if (attempt.providerTransactionId && attempt.providerTransactionId !== transactionId) {
      return { error: { status: 409 as const, code: "TRANSACTION_DEJA_LIEE", message: "Cette tentative est déjà liée à une autre transaction." } };
    }
    if (attempt.status === "failed" && attempt.providerTransactionId === transactionId) {
      return { data: { orderId, status: "pending_payment" as const, paymentStatus: "failed" as const } };
    }
    const failureCode = typeof response.failureCode === "string" ? response.failureCode : "payment_failed";
    await tx.update(paymentAttempts).set({ providerTransactionId: transactionId, status: "failed", providerStatus: failureCode,
      usefulResponse: { status: eventStatus(response), failureCode, failureMessage: response.failureMessage ?? null }, verifiedAt: now, updatedAt: now })
      .where(eq(paymentAttempts.id, paymentAttemptId));
    await tx.insert(paymentEvents).values({ source, providerTransactionId: transactionId, payload: { verifiedByServer: true, status: eventStatus(response), partnerId: attempt.internalReference }, reconciled: true, processedAt: now });
    return { data: { orderId, status: "pending_payment" as const, paymentStatus: "failed" as const } };
  });
}

async function recordAnomaly(orderId: string, paymentAttemptId: string, transactionId: string, response: KkiapayTransaction, reason: string, source: "return" | "webhook") {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    const [attempt] = await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.id, paymentAttemptId), eq(paymentAttempts.orderId, orderId))).for("update");
    if (!order || !attempt) return { error: { status: 404 as const, code: "PAIEMENT_INTROUVABLE", message: "Commande ou tentative de paiement introuvable." } };
    if (attempt.status === "succeeded") return { data: { orderId, status: "confirmed" as const, paymentStatus: "succeeded" as const } };
    if (attempt.status === "anomaly" && attempt.providerTransactionId === transactionId) {
      return { error: { status: 422 as const, code: "PAIEMENT_NON_CONFORME", message: "Le paiement nécessite une vérification manuelle." } };
    }
    await tx.update(paymentAttempts).set({ providerTransactionId: transactionId, status: "anomaly", providerStatus: "verification_mismatch",
      usefulResponse: { reason, status: eventStatus(response), amount: response.amount ?? null, partnerId: response.partnerId ?? null }, verifiedAt: now, updatedAt: now })
      .where(eq(paymentAttempts.id, paymentAttemptId));
    await tx.insert(paymentEvents).values({ source, providerTransactionId: transactionId, payload: { verifiedByServer: true, anomaly: reason, partnerId: attempt.internalReference }, reconciled: false, processedAt: now });
    await tx.insert(auditLogs).values({ actorId: null, action: "payment.verification.anomaly", entityType: "order", entityId: orderId, metadata: { reference: order.reference, reason, transactionId } });
    return { error: { status: 422 as const, code: "PAIEMENT_NON_CONFORME", message: "Les informations confirmées par Kkiapay ne correspondent pas à la commande. Aucun stock n’a été déduit." } };
  });
}

export async function verifyAndSettleKkiapay(input: {
  orderId: string;
  paymentAttemptId: string;
  transactionId: string;
  actorId?: string | null;
  source?: "return" | "webhook";
}): Promise<{ data: PaymentResult } | { error: PaymentFailure }> {
  let providerResponse: KkiapayTransaction;
  try {
    providerResponse = await verifyKkiapayTransaction(input.transactionId);
  } catch (error) {
    console.error("Kkiapay transaction verification failed", error);
    return { error: { status: 503, code: "VERIFICATION_KKIAPAY_INDISPONIBLE", message: "Kkiapay n’a pas pu vérifier la transaction. Réessayez dans quelques instants." } };
  }

  const status = eventStatus(providerResponse);
  if (providerResponse.transactionId !== input.transactionId) {
    return recordAnomaly(input.orderId, input.paymentAttemptId, input.transactionId, providerResponse, "transaction_id_mismatch", input.source ?? "return");
  }
  if (status !== "SUCCESS") {
    if (["FAILED", "CANCELLED", "CANCELED"].includes(status)) {
      return recordFailedAttempt(input.orderId, input.paymentAttemptId, input.transactionId, providerResponse, input.source ?? "return");
    }
    return { error: { status: 409, code: "PAIEMENT_NON_CONFIRME", message: "Kkiapay n’a pas encore confirmé la réussite du paiement." } };
  }

  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
    const [payment] = await tx.select().from(paymentAttempts).where(and(
      eq(paymentAttempts.id, input.paymentAttemptId), eq(paymentAttempts.orderId, input.orderId),
    )).for("update");
    if (!order || !payment) return { error: { status: 404 as const, code: "PAIEMENT_INTROUVABLE", message: "Commande ou tentative de paiement introuvable." } };
    if (order.status === "confirmed" && payment.status === "succeeded" && payment.providerTransactionId === input.transactionId) {
      return { data: { orderId: order.id, status: "confirmed" as const, paymentStatus: "succeeded" as const } };
    }
    if (order.status !== "pending_payment" || !order.expiresAt || order.expiresAt <= now) {
      if (payment.status !== "anomaly" || payment.providerTransactionId !== input.transactionId) {
        await tx.update(paymentAttempts).set({ providerTransactionId: input.transactionId, status: "anomaly", providerStatus: "order_expired_after_payment",
          usefulResponse: { status: "SUCCESS", amount: providerResponse.amount ?? null, reason: "payment_verified_after_order_expiry" }, verifiedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
        await tx.insert(paymentEvents).values({ source: input.source ?? "return", providerTransactionId: input.transactionId,
          payload: { verifiedByServer: true, anomaly: "order_expired_after_payment", orderReference: order.reference }, reconciled: false, processedAt: now });
        await tx.insert(auditLogs).values({ actorId: null, action: "payment.verification.anomaly", entityType: "order", entityId: order.id,
          metadata: { reference: order.reference, transactionId: input.transactionId, reason: "order_expired_after_payment" } });
      }
      return { error: { status: 409 as const, code: "COMMANDE_NON_PAYABLE", message: "Cette commande n’est plus payable." } };
    }
    if (payment.status === "anomaly" && payment.providerTransactionId === input.transactionId) {
      return { data: { orderId: order.id, status: "pending_payment" as const, paymentStatus: "anomaly" as const } };
    }
    if (payment.mode !== "sandbox" || payment.status !== "pending") {
      return { error: { status: 409 as const, code: "TENTATIVE_NON_VALIDE", message: "Cette tentative de paiement n’est plus active." } };
    }
    if (payment.providerTransactionId && payment.providerTransactionId !== input.transactionId) {
      return { error: { status: 409 as const, code: "TRANSACTION_DEJA_LIEE", message: "Cette tentative est déjà liée à une autre transaction." } };
    }
    const amount = Number(providerResponse.amount);
    if (!Number.isFinite(amount) || amount !== payment.amountFCFA ||
      providerResponse.partnerId !== payment.internalReference ||
      (typeof providerResponse.currency === "string" && providerResponse.currency.toUpperCase() !== "XOF")) {
      await tx.update(paymentAttempts).set({ providerTransactionId: input.transactionId, status: "anomaly", providerStatus: "verification_mismatch",
        usefulResponse: { amount: providerResponse.amount ?? null, currency: providerResponse.currency ?? null, partnerId: providerResponse.partnerId ?? null }, verifiedAt: now, updatedAt: now })
        .where(eq(paymentAttempts.id, payment.id));
      await tx.insert(paymentEvents).values({ source: input.source ?? "return", providerTransactionId: input.transactionId,
        payload: { verifiedByServer: true, anomaly: "amount_currency_or_partner_mismatch", orderReference: order.reference }, reconciled: false, processedAt: now });
      await tx.insert(auditLogs).values({ actorId: input.actorId ?? null, action: "payment.verification.anomaly", entityType: "order", entityId: order.id,
        metadata: { reference: order.reference, transactionId: input.transactionId, expectedAmount: payment.amountFCFA, receivedAmount: amount } });
      return { error: { status: 422 as const, code: "PAIEMENT_NON_CONFORME", message: "Le montant ou la référence Kkiapay ne correspond pas à la commande. Aucun stock n’a été déduit." } };
    }

    const lines = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity }).from(orderItems)
      .where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.productId));
    if (!lines.length) return { error: { status: 409 as const, code: "COMMANDE_VIDE", message: "La commande ne contient aucun article." } };
    const reservations = await tx.select({ productId: stockReservations.productId, quantity: stockReservations.quantity })
      .from(stockReservations).where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active"), gt(stockReservations.expiresAt, now)))
      .orderBy(asc(stockReservations.productId)).for("update");
    const reservationByProduct = new Map(reservations.map((reservation) => [reservation.productId, reservation.quantity]));
    if (lines.some((line) => reservationByProduct.get(line.productId) !== line.quantity)) {
      await tx.update(paymentAttempts).set({ providerTransactionId: input.transactionId, status: "anomaly", providerStatus: "verified_but_stock_reservation_missing",
        usefulResponse: { status: "SUCCESS", amount: providerResponse.amount, reason: "stock_reservation_missing" }, verifiedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
      await tx.insert(paymentEvents).values({ source: input.source ?? "return", providerTransactionId: input.transactionId,
        payload: { verifiedByServer: true, anomaly: "stock_reservation_missing", orderReference: order.reference }, reconciled: false, processedAt: now });
      await tx.insert(auditLogs).values({ actorId: null, action: "payment.verification.anomaly", entityType: "order", entityId: order.id,
        metadata: { reference: order.reference, transactionId: input.transactionId, reason: "stock_reservation_missing" } });
      return { error: { status: 409 as const, code: "RESERVATION_EXPIREE", message: "La réservation du stock a expiré. La transaction a été vérifiée; contactez le service client pour son traitement." } };
    }
    const productIds = lines.map((line) => line.productId);
    const lockedProducts = await tx.select({ id: products.id, stock: products.stockPhysical }).from(products)
      .where(inArray(products.id, productIds)).orderBy(asc(products.id)).for("update");
    const stockByProduct = new Map(lockedProducts.map((product) => [product.id, product.stock]));
    if (lines.some((line) => (stockByProduct.get(line.productId) ?? 0) < line.quantity)) {
      await tx.update(paymentAttempts).set({ providerTransactionId: input.transactionId, status: "anomaly", providerStatus: "verified_but_stock_insufficient",
        usefulResponse: { status: "SUCCESS", amount: providerResponse.amount, reason: "stock_insufficient_after_payment" }, verifiedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
      await tx.insert(paymentEvents).values({ source: input.source ?? "return", providerTransactionId: input.transactionId,
        payload: { verifiedByServer: true, anomaly: "stock_insufficient_after_payment", orderReference: order.reference }, reconciled: false, processedAt: now });
      await tx.insert(auditLogs).values({ actorId: null, action: "payment.verification.anomaly", entityType: "order", entityId: order.id,
        metadata: { reference: order.reference, transactionId: input.transactionId, reason: "stock_insufficient_after_payment" } });
      return { error: { status: 409 as const, code: "STOCK_INSUFFISANT", message: "Le stock ne permet plus d’honorer la commande. La transaction a été vérifiée; une vérification manuelle est requise." } };
    }
    for (const line of lines) {
      const stockBefore = stockByProduct.get(line.productId)!;
      const stockAfter = stockBefore - line.quantity;
      await tx.update(products).set({ stockPhysical: stockAfter, updatedAt: now }).where(eq(products.id, line.productId));
      await tx.insert(stockMovements).values({ productId: line.productId, type: "sale", variation: -line.quantity, stockBefore, stockAfter,
        orderId: order.id, authorId: input.actorId ?? null, reason: "Commande réglée via Kkiapay Sandbox" });
    }
    await tx.update(stockReservations).set({ status: "consumed", updatedAt: now })
      .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active")));
    await tx.update(orders).set({ status: "confirmed", confirmedAt: now, updatedAt: now }).where(eq(orders.id, order.id));
    await tx.update(paymentAttempts).set({ status: "succeeded", providerTransactionId: input.transactionId, providerStatus: "SUCCESS",
      usefulResponse: providerResponse, verifiedAt: now, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
    await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: "pending_payment", toStatus: "confirmed",
      authorType: input.actorId ? "customer" : "system", authorId: input.actorId ?? null, reason: "Paiement Kkiapay Sandbox vérifié côté serveur" });
    await tx.insert(notifications).values({ userId: order.userId, type: "order_confirmed", title: "Commande confirmée",
      message: `Le paiement de la commande ${order.reference} est confirmé.`, link: `/compte/commandes/${order.id}`,
      idempotencyKey: `kkiapay-payment:${input.transactionId}` }).onConflictDoNothing();
    await tx.insert(paymentEvents).values({ source: input.source ?? "return", providerTransactionId: input.transactionId,
      payload: { verifiedByServer: true, status: "SUCCESS", orderReference: order.reference, partnerId: payment.internalReference }, reconciled: true, processedAt: now });
    await tx.insert(auditLogs).values({ actorId: input.actorId ?? null, action: "payment.kkiapay.sandbox.succeeded", entityType: "order", entityId: order.id,
      metadata: { reference: order.reference, amountFCFA: payment.amountFCFA, transactionId: input.transactionId } });
    return { data: { orderId: order.id, status: "confirmed" as const, paymentStatus: "succeeded" as const } };
  });
}

export async function resolveKkiapayPartner(partnerId: string) {
  const [payment] = await getDb().select({ id: paymentAttempts.id, orderId: paymentAttempts.orderId })
    .from(paymentAttempts).where(eq(paymentAttempts.internalReference, partnerId)).limit(1);
  return payment ?? null;
}

export function hasValidKkiapayWebhookSecret(supplied: string | null) {
  const expected = process.env.KKIAPAY_WEBHOOK_SECRET;
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
