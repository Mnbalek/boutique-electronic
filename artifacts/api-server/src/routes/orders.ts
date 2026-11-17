import { randomInt, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, gt, inArray, isNull, lte, or, sql } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderHeader,
  CreateOrderResponse,
  GetPaymentConfigResponse,
  GetOrderPaymentStatusResponse,
  GetOrderResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  PreviewCheckoutBody,
  PreviewCheckoutResponse,
  RetryOrderPaymentResponse,
  VerifyPaymentBody,
  VerifyPaymentResponse,
} from "@workspace/api-zod";
import { getDb } from "@workspace/db";
import {
  addresses,
  auditLogs,
  cartItems,
  carts,
  categories,
  communes,
  deliveryZones,
  departments,
  orderItems,
  orderStatusHistory,
  orders,
  notifications,
  paymentAttempts,
  paymentEvents,
  productImages,
  products,
  promotionProducts,
  promotionUsages,
  promotions,
  stockReservations,
  stockMovements,
} from "@workspace/db/schema";
import { Hono, type Context } from "hono";
import { getAuthenticatedUser } from "./auth";
import { getPaymentMode } from "../payment-config";
import { cleanProductName } from "../product-names";
import { getKkiapayPublicConfig } from "../kkiapay";
import { hasValidKkiapayWebhookSecret, resolveKkiapayPartner, verifyAndSettleKkiapay } from "../payment-settlement";

const router = new Hono();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const fail = (context: Context, status: 400 | 401 | 404 | 409 | 422 | 500 | 503, code: string, message: string, details?: Record<string, unknown>) =>
  context.json({ error: { code, message, ...(details ? { details } : {}) } }, status);
const availableStock = () => sql<number>`GREATEST(
  ${products.stockPhysical} - COALESCE((
    SELECT SUM(${stockReservations.quantity}) FROM ${stockReservations}
    WHERE ${stockReservations.productId} = ${products.id}
      AND ${stockReservations.status} = 'active'
      AND ${stockReservations.expiresAt} > now()
  ), 0), 0
)`.mapWith(Number);
const referenceCode = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
const normalizeCode = (code: string) => code.trim().toLocaleLowerCase("en-US");

type QuoteLine = {
  productId: string; name: string; reference: string; categoryId: string; quantity: number;
  unitPriceFCFA: number; previousPriceFCFA: number; stockAvailable: number; imageUrl: string;
};
type PromotionRow = typeof promotions.$inferSelect;
type CheckoutError = { status: 404 | 409 | 422; code: string; message: string };
type PromotionResult =
  | { error: { code: string; message: string; reason: string } }
  | { promotion: PromotionRow | null; discountFCFA: number; lineDiscounts: Map<string, number>; message: string | null };
type CheckoutQuote = {
  lines: QuoteLine[];
  lineViews: Array<{ productId: string; name: string; imageUrl: string; quantity: number; unitPriceFCFA: number; lineTotalFCFA: number }>;
  address: NonNullable<Awaited<ReturnType<typeof getOwnedAddress>>>;
  promotion: PromotionRow | null;
  lineDiscounts: Map<string, number>;
  subtotalFCFA: number;
  discountFCFA: number;
  deliveryFCFA: number;
  totalFCFA: number;
  promotionMessage: string | null;
  requiresRevalidation: boolean;
};

async function getOwnedAddress(userId: string, addressId: string) {
  const [row] = await getDb().select({
    id: addresses.id, label: addresses.label, recipient: addresses.recipient, phone: addresses.phone,
    departmentId: addresses.departmentId, departmentName: departments.name,
    communeId: communes.id, communeName: communes.name, neighborhood: addresses.neighborhood,
    landmark: addresses.landmark, isDefault: addresses.isDefault, zoneId: deliveryZones.id,
    zoneName: deliveryZones.name, deliveryFee: deliveryZones.feeFCFA, zoneActive: deliveryZones.active,
  }).from(addresses)
    .innerJoin(departments, eq(addresses.departmentId, departments.id))
    .innerJoin(communes, eq(addresses.communeId, communes.id))
    .leftJoin(deliveryZones, eq(communes.deliveryZoneId, deliveryZones.id))
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId), isNull(addresses.deletedAt), eq(communes.active, true)))
    .limit(1);
  return row ?? null;
}

async function getQuoteLines(userId: string) {
  const db = getDb();
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!cart) return [];
  const rows = await db.select({ productId: cartItems.productId, quantity: cartItems.quantity, seenPrice: cartItems.unitPriceSeenFCFA })
    .from(cartItems).where(eq(cartItems.cartId, cart.id)).orderBy(asc(cartItems.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((row) => row.productId);
  const stock = availableStock();
  const [productRows, imageRows] = await Promise.all([
    db.select({ id: products.id, name: products.name, reference: products.reference, categoryId: products.categoryId, price: products.priceFCFA, stock, status: products.status })
      .from(products).where(inArray(products.id, ids)),
    db.select({ productId: productImages.productId, url: productImages.url }).from(productImages)
      .where(and(inArray(productImages.productId, ids), eq(productImages.isPrimary, true))),
  ]);
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const imageById = new Map(imageRows.map((row) => [row.productId, row.url]));
  return rows.flatMap((row) => {
    const product = productById.get(row.productId);
    if (!product || product.status !== "active") return [{
      productId: row.productId, name: product?.name ?? "Article indisponible", reference: product?.reference ?? "",
      categoryId: product?.categoryId ?? "", quantity: row.quantity, unitPriceFCFA: product?.price ?? row.seenPrice,
      previousPriceFCFA: row.seenPrice, stockAvailable: 0, imageUrl: imageById.get(row.productId) ?? "https://placehold.co/600x600/png",
    }];
    return [{
      productId: product.id, name: cleanProductName(product.reference, product.name), reference: product.reference, categoryId: product.categoryId,
      quantity: row.quantity, unitPriceFCFA: product.price, previousPriceFCFA: row.seenPrice,
      stockAvailable: product.stock, imageUrl: imageById.get(row.productId) ?? "https://placehold.co/600x600/png",
    }];
  });
}

async function eligiblePromotions(subtotal: number, lines: QuoteLine[], suppliedCode?: string | null): Promise<PromotionResult> {
  const db = getDb();
  const now = new Date();
  let enteredPromotion: PromotionRow | undefined;
  if (suppliedCode?.trim()) {
    [enteredPromotion] = await db.select().from(promotions)
      .where(eq(sql`lower(${promotions.code})`, normalizeCode(suppliedCode))).limit(1);
    if (!enteredPromotion) return { error: { code: "PROMOTION_INVALIDE", message: "Ce code promotionnel est inconnu.", reason: "unknown" } };
    if (!enteredPromotion.active) return { error: { code: "PROMOTION_INVALIDE", message: "Cette promotion est inactive.", reason: "inactive" } };
    if (enteredPromotion.startsAt > now || enteredPromotion.endsAt < now) return { error: { code: "PROMOTION_INVALIDE", message: "Cette promotion a expiré ou n’est pas encore valide.", reason: "expired" } };
    if (enteredPromotion.maxUses !== null) {
      const [{ total }] = await db.select({ total: count() }).from(promotionUsages).where(eq(promotionUsages.promotionId, enteredPromotion.id));
      if (total >= enteredPromotion.maxUses) return { error: { code: "PROMOTION_INVALIDE", message: "Cette promotion a atteint sa limite d’utilisation.", reason: "exhausted" } };
    }
    if (subtotal < enteredPromotion.minimumOrderFCFA) return { error: { code: "PROMOTION_INVALIDE", message: "Le minimum d’achat requis pour ce code n’est pas atteint.", reason: "minimum_not_met" } };
  }

  const candidates = await db.select().from(promotions).where(and(
    eq(promotions.active, true), lte(promotions.startsAt, now), gte(promotions.endsAt, now),
    or(isNull(promotions.code), ...(enteredPromotion ? [eq(promotions.id, enteredPromotion.id)] : [])),
  ));
  const evaluated: Array<{ promo: PromotionRow; discount: number; eligibleLines: QuoteLine[]; entered: boolean }> = [];
  for (const promo of candidates) {
    if (subtotal < promo.minimumOrderFCFA) continue;
    let targetLines = lines;
    if (promo.scope === "category") targetLines = lines.filter((line) => line.categoryId === promo.categoryId);
    if (promo.scope === "products") {
      const targets = await db.select({ productId: promotionProducts.productId }).from(promotionProducts).where(eq(promotionProducts.promotionId, promo.id));
      const targetIds = new Set(targets.map((item) => item.productId));
      targetLines = lines.filter((line) => targetIds.has(line.productId));
    }
    const base = targetLines.reduce((sum, line) => sum + line.unitPriceFCFA * line.quantity, 0);
    if (base <= 0) continue;
    const discount = Math.min(base, promo.type === "percentage" ? Math.floor(base * promo.value / 100) : promo.value);
    if (discount > 0) evaluated.push({ promo, discount, eligibleLines: targetLines, entered: promo.id === enteredPromotion?.id });
  }
  evaluated.sort((a, b) => b.discount - a.discount || Number(b.entered) - Number(a.entered) || a.promo.createdAt.getTime() - b.promo.createdAt.getTime());
  const selected = evaluated[0];
  if (!selected) return { promotion: null, discountFCFA: 0, lineDiscounts: new Map<string, number>(), message: null as string | null };

  const base = selected.eligibleLines.reduce((sum, line) => sum + line.unitPriceFCFA * line.quantity, 0);
  const shares = selected.eligibleLines.map((line) => {
    const lineTotal = line.unitPriceFCFA * line.quantity;
    return { line, lineTotal, discount: Math.floor(selected.discount * lineTotal / base) };
  });
  let remainder = selected.discount - shares.reduce((sum, share) => sum + share.discount, 0);
  shares.sort((a, b) => b.lineTotal - a.lineTotal || a.line.productId.localeCompare(b.line.productId));
  for (let i = 0; remainder > 0; i++, remainder--) shares[i % shares.length].discount++;
  return {
    promotion: selected.promo, discountFCFA: selected.discount,
    lineDiscounts: new Map(shares.map((share) => [share.line.productId, share.discount])),
    message: selected.promo.name,
  };
}

async function buildCheckout(userId: string, addressId: string, promotionCode?: string | null): Promise<{ error: CheckoutError } | CheckoutQuote> {
  const address = await getOwnedAddress(userId, addressId);
  if (!address) return { error: { status: 404 as const, code: "ADRESSE_INTROUVABLE", message: "Adresse introuvable." } };
  if (!address.zoneId || !address.zoneActive) return { error: { status: 409 as const, code: "ZONE_NON_DESSERVIE", message: "La commune de cette adresse ne peut pas être livrée." } };
  const lines = await getQuoteLines(userId);
  if (!lines.length) return { error: { status: 409 as const, code: "PANIER_VIDE", message: "Votre panier est vide." } };
  if (lines.length > 30) return { error: { status: 409 as const, code: "PANIER_TROP_LONG", message: "Un panier ne peut pas dépasser 30 articles différents." } };
  const subtotalFCFA = lines.reduce((sum, line) => sum + line.unitPriceFCFA * line.quantity, 0);
  const promo = await eligiblePromotions(subtotalFCFA, lines, promotionCode);
  if ("error" in promo) return { error: { status: 422, code: promo.error.code, message: promo.error.message } };
  const lineViews = lines.map((line) => ({
    productId: line.productId, name: line.name, imageUrl: line.imageUrl, quantity: line.quantity,
    unitPriceFCFA: line.unitPriceFCFA,
    lineTotalFCFA: Math.max(0, line.unitPriceFCFA * line.quantity - (promo.lineDiscounts.get(line.productId) ?? 0)),
  }));
  return {
    lines, lineViews, address, promotion: promo.promotion, lineDiscounts: promo.lineDiscounts,
    subtotalFCFA, discountFCFA: promo.discountFCFA, deliveryFCFA: address.deliveryFee ?? 0,
    totalFCFA: subtotalFCFA - promo.discountFCFA + (address.deliveryFee ?? 0),
    promotionMessage: promo.message,
    requiresRevalidation: lines.some((line) => line.previousPriceFCFA !== line.unitPriceFCFA || line.quantity > line.stockAvailable),
  };
}

function makeOrderData(order: typeof orders.$inferSelect, lineData: Array<{ productId: string; name: string; reference: string; imageUrl: string; unitPriceFCFA: number; quantity: number; discountFCFA: number; lineTotalFCFA: number }>, addressSnapshot: Record<string, unknown>, history: Array<{ status: string; createdAt: Date; note: string | null }>) {
  return {
    id: order.id, reference: order.reference, status: order.status, createdAt: order.createdAt, expiresAt: order.expiresAt,
    subtotalFCFA: order.subtotalFCFA, discountFCFA: order.discountFCFA, deliveryFCFA: order.deliveryFeeFCFA,
    totalFCFA: order.totalFCFA, currency: order.currency, lines: lineData,
    shippingAddress: addressSnapshot, statusHistory: history,
  };
}

async function loadOrder(userId: string, orderId: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!order) return null;
  const rows = await db.select({ productId: orderItems.productId, name: orderItems.nameSnapshot, reference: orderItems.referenceSnapshot,
    unitPriceFCFA: orderItems.unitPriceFCFA, quantity: orderItems.quantity, discountFCFA: orderItems.discountFCFA,
    lineTotalFCFA: orderItems.lineTotalFCFA, imageUrl: productImages.url })
    .from(orderItems).leftJoin(productImages, and(eq(productImages.productId, orderItems.productId), eq(productImages.isPrimary, true)))
    .where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt));
  const historyRows = await db.select({ status: orderStatusHistory.toStatus, createdAt: orderStatusHistory.createdAt, note: orderStatusHistory.reason })
    .from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt));
  const history = historyRows.map((row) => ({ status: row.status, createdAt: row.createdAt, note: row.note }));
  return makeOrderData(order, rows.map((row) => ({
    productId: row.productId, name: row.name, reference: row.reference,
    imageUrl: row.imageUrl ?? "https://placehold.co/600x600/png", unitPriceFCFA: row.unitPriceFCFA,
    quantity: row.quantity, discountFCFA: row.discountFCFA, lineTotalFCFA: row.lineTotalFCFA,
  })), order.shippingAddressSnapshot, history);
}

router.post("/checkout/preview", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = PreviewCheckoutBody.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Vérifiez l’adresse et le code promotionnel.");
  const quote = await buildCheckout(user.id, parsed.data.addressId, parsed.data.promotionCode);
  if ("error" in quote) return fail(context, quote.error.status, quote.error.code, quote.error.message);
  return context.json(PreviewCheckoutResponse.parse({ data: {
    lines: quote.lineViews, address: {
      id: quote.address.id, label: quote.address.label, recipient: quote.address.recipient, phone: quote.address.phone,
      departmentId: quote.address.departmentId, departmentName: quote.address.departmentName,
      communeId: quote.address.communeId, communeName: quote.address.communeName,
      neighborhood: quote.address.neighborhood, landmark: quote.address.landmark, isDefault: quote.address.isDefault,
    }, subtotalFCFA: quote.subtotalFCFA, discountFCFA: quote.discountFCFA, deliveryFCFA: quote.deliveryFCFA,
    totalFCFA: quote.totalFCFA, currency: "XOF", promotionMessage: quote.promotionMessage,
    requiresRevalidation: quote.requiresRevalidation,
  } }));
});

router.post("/orders", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const header = CreateOrderHeader.safeParse({ "Idempotency-Key": context.req.header("Idempotency-Key") });
  if (!header.success) return fail(context, 400, "CLE_IDEMPOTENCE_INVALIDE", "Une clé d’idempotence valide est requise.");
  const parsed = CreateOrderBody.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Vérifiez l’adresse et le code promotionnel.");
  const key = header.data["Idempotency-Key"];
  const db = getDb();
  const [existing] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, key))).limit(1);
  if (existing) {
    const data = await loadOrder(user.id, existing.id);
    if (data) return context.json(CreateOrderResponse.parse({ data }));
  }
  const preflightNow = new Date();
  await db.transaction(async (tx) => {
    const expired = await tx.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.userId, user.id), eq(orders.status, "pending_payment"), lte(orders.expiresAt, preflightNow)))
      .for("update");
    if (!expired.length) return;
    const expiredIds = expired.map((order) => order.id);
    await tx.update(orders).set({ status: "expired", updatedAt: preflightNow }).where(inArray(orders.id, expiredIds));
    await tx.update(stockReservations).set({ status: "expired", updatedAt: preflightNow })
      .where(and(inArray(stockReservations.orderId, expiredIds), eq(stockReservations.status, "active")));
    await tx.insert(orderStatusHistory).values(expiredIds.map((id) => ({
      orderId: id, fromStatus: "pending_payment" as const, toStatus: "expired" as const,
      authorType: "system", reason: "Délai de paiement dépassé",
    })));
  });
  const [pendingOrder] = await db.select({ id: orders.id }).from(orders).where(and(
    eq(orders.userId, user.id), eq(orders.status, "pending_payment"), gt(orders.expiresAt, new Date()),
  )).limit(1);
  if (pendingOrder) return fail(context, 409, "COMMANDE_EN_ATTENTE", "Une commande attend déjà le paiement. Reprenez-la pour terminer votre achat.", { orderId: pendingOrder.id });
  const quote = await buildCheckout(user.id, parsed.data.addressId, parsed.data.promotionCode);
  if ("error" in quote) return fail(context, quote.error.status, quote.error.code, quote.error.message);
  if (quote.requiresRevalidation) return fail(context, 409, "PANIER_MODIFIE", "Le prix ou le stock a changé. Vérifiez le panier avant de commander.");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const mode = getPaymentMode();
  let orderId: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const [duplicate] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, key))).limit(1);
      if (duplicate) { orderId = duplicate.id; return; }
      const expired = await tx.select({ id: orders.id }).from(orders)
        .where(and(eq(orders.userId, user.id), eq(orders.status, "pending_payment"), lte(orders.expiresAt, now)))
        .for("update");
      if (expired.length) {
        const expiredIds = expired.map((order) => order.id);
        await tx.update(orders).set({ status: "expired", updatedAt: now }).where(inArray(orders.id, expiredIds));
        await tx.update(stockReservations).set({ status: "expired", updatedAt: now })
          .where(and(inArray(stockReservations.orderId, expiredIds), eq(stockReservations.status, "active")));
        await tx.insert(orderStatusHistory).values(expiredIds.map((id) => ({
          orderId: id, fromStatus: "pending_payment" as const, toStatus: "expired" as const,
          authorType: "system", reason: "Délai de paiement dépassé",
        })));
      }
      const [pending] = await tx.select({ id: orders.id }).from(orders).where(and(
        eq(orders.userId, user.id), eq(orders.status, "pending_payment"), gt(orders.expiresAt, now),
      )).limit(1);
      if (pending) throw Object.assign(new Error("Une commande attend déjà le paiement."), { code: "PENDING_ORDER", orderId: pending.id });

      const productIds = quote.lines.map((line) => line.productId).sort();
      const lockedProducts = await tx.select({ id: products.id, status: products.status, price: products.priceFCFA, stock: products.stockPhysical })
        .from(products).where(inArray(products.id, productIds)).orderBy(asc(products.id)).for("update");
      const productsById = new Map(lockedProducts.map((product) => [product.id, product]));
      const reservationRows = await tx.select({ productId: stockReservations.productId, quantity: sql<number>`COALESCE(SUM(${stockReservations.quantity}), 0)`.mapWith(Number) })
        .from(stockReservations).where(and(inArray(stockReservations.productId, productIds), eq(stockReservations.status, "active"), gt(stockReservations.expiresAt, now)))
        .groupBy(stockReservations.productId);
      const reservedByProduct = new Map(reservationRows.map((row) => [row.productId, row.quantity]));
      for (const line of quote.lines) {
        const product = productsById.get(line.productId);
        if (!product || product.status !== "active" || product.price !== line.unitPriceFCFA) throw Object.assign(new Error("Le panier a changé; vérifiez les articles."), { code: "CART_CHANGED" });
        const available = Math.max(product.stock - (reservedByProduct.get(product.id) ?? 0), 0);
        if (line.quantity > available) throw Object.assign(new Error(`Stock insuffisant pour ${line.name}.`), { code: "OUT_OF_STOCK" });
      }

      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.userId, user.id)).limit(1);
      if (!cart) throw Object.assign(new Error("Votre panier est vide."), { code: "EMPTY_CART" });
      const addressSnapshot = {
        id: quote.address.id, label: quote.address.label, recipient: quote.address.recipient, phone: quote.address.phone,
        departmentId: quote.address.departmentId, departmentName: quote.address.departmentName,
        communeId: quote.address.communeId, communeName: quote.address.communeName,
        neighborhood: quote.address.neighborhood, landmark: quote.address.landmark, isDefault: quote.address.isDefault,
      };
      const zoneSnapshot = { id: quote.address.zoneId, name: quote.address.zoneName, feeFCFA: quote.address.deliveryFee };
      const promotionSnapshot = quote.promotion ? { name: quote.promotion.name, code: quote.promotion.code, type: quote.promotion.type, value: quote.promotion.value } : null;
      const reference = `CMD-${now.toISOString().slice(0, 7).replace("-", "")}-${referenceCode()}`;
      const [saved] = await tx.insert(orders).values({
        reference, userId: user.id, shippingAddressSnapshot: addressSnapshot, deliveryZoneSnapshot: zoneSnapshot,
        subtotalFCFA: quote.subtotalFCFA, discountFCFA: quote.discountFCFA, deliveryFeeFCFA: quote.deliveryFCFA,
        totalFCFA: quote.totalFCFA, promotionId: quote.promotion?.id ?? null, promotionSnapshot,
        idempotencyKey: key, expiresAt,
      }).returning({ id: orders.id });
      orderId = saved.id;
      const productImagesById = await tx.select({ productId: productImages.productId, url: productImages.url })
        .from(productImages).where(and(inArray(productImages.productId, productIds), eq(productImages.isPrimary, true)));
      const imageById = new Map(productImagesById.map((image) => [image.productId, image.url]));
      await tx.insert(orderItems).values(quote.lines.map((line) => {
        const discount = quote.lineDiscounts.get(line.productId) ?? 0;
        return { orderId: saved.id, productId: line.productId, nameSnapshot: line.name, referenceSnapshot: line.reference,
          unitPriceFCFA: line.unitPriceFCFA, quantity: line.quantity, discountFCFA: discount,
          lineTotalFCFA: line.unitPriceFCFA * line.quantity - discount };
      }));
      await tx.insert(stockReservations).values(quote.lines.map((line) => ({
        orderId: saved.id, productId: line.productId, quantity: line.quantity, status: "active" as const, expiresAt,
      })));
      await tx.insert(paymentAttempts).values({
        orderId: saved.id, internalReference: `PAY-${reference}`, amountFCFA: quote.totalFCFA,
        currency: "XOF", mode, status: "pending",
      });
      await tx.insert(orderStatusHistory).values({ orderId: saved.id, fromStatus: null, toStatus: "pending_payment", authorType: "customer", authorId: user.id, reason: "Commande créée" });
      await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    });
  } catch (error) {
    const value = error as { code?: string; cause?: { code?: string }; orderId?: string };
    const code = value.code ?? value.cause?.code;
    if (code === "PENDING_ORDER") return fail(context, 409, "COMMANDE_EN_ATTENTE", "Une commande attend déjà le paiement.", { orderId: value.orderId });
    if (code === "CART_CHANGED") return fail(context, 409, "PANIER_MODIFIE", "Le prix ou le statut d’un article a changé.");
    if (code === "OUT_OF_STOCK") return fail(context, 409, "STOCK_INSUFFISANT", value instanceof Error ? value.message : "Stock insuffisant.");
    if (code === "EMPTY_CART") return fail(context, 409, "PANIER_VIDE", "Votre panier est vide.");
    if (code === "23505") {
      const [retry] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, key))).limit(1);
      if (retry) orderId = retry.id;
      else return fail(context, 409, "COMMANDE_EN_ATTENTE", "Une commande attend déjà le paiement.");
    } else throw error;
  }
  if (!orderId) return fail(context, 500, "ERREUR_COMMANDE", "La commande n’a pas pu être créée.");
  const data = await loadOrder(user.id, orderId);
  if (!data) return fail(context, 500, "ERREUR_COMMANDE", "La commande créée est introuvable.");
  return context.json(CreateOrderResponse.parse({ data }), 201);
});

router.get("/orders", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = GetOrdersQueryParams.safeParse({ statut: context.req.query("statut"), page: context.req.query("page"), taille: context.req.query("taille") });
  if (!parsed.success) return fail(context, 400, "PARAMETRES_INVALIDES", "Les paramètres de pagination sont invalides.");
  const { statut, page, taille } = parsed.data;
  const filters = [eq(orders.userId, user.id)];
  if (statut) filters.push(eq(orders.status, statut as typeof orders.$inferSelect.status));
  const where = and(...filters)!;
  const [{ total }] = await getDb().select({ total: count() }).from(orders).where(where);
  const rows = await getDb().select({ id: orders.id }).from(orders).where(where).orderBy(desc(orders.createdAt)).limit(taille).offset((page - 1) * taille);
  const data = await Promise.all(rows.map((row) => loadOrder(user.id, row.id)));
  return context.json(GetOrdersResponse.parse({ data: data.filter(Boolean), meta: { page, taille, total } }));
});
router.get("/orders/:id", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const id = context.req.param("id");
  const parsed = GetOrderResponse.shape.data.shape.id.safeParse(id);
  if (!parsed.success) return fail(context, 400, "PARAMETRE_INVALIDE", "Identifiant de commande invalide.");
  const data = await loadOrder(user.id, id);
  if (!data) return fail(context, 404, "COMMANDE_INTROUVABLE", "Commande introuvable.");
  return context.json(GetOrderResponse.parse({ data }));
});

router.get("/payments/config", (context) => {
  const config = getKkiapayPublicConfig();
  return context.json(GetPaymentConfigResponse.parse({ data: config }));
});

router.post("/orders/:id/payments", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = RetryOrderPaymentResponse.shape.data.shape.orderId.safeParse(context.req.param("id"));
  if (!parsed.success) return fail(context, 400, "PARAMETRE_INVALIDE", "Identifiant de commande invalide.");

  const mode = getPaymentMode();
  if (mode === "production") return fail(context, 503, "PAIEMENT_INDISPONIBLE", "Le paiement en production n’est pas activé sur cette boutique.");
  if (mode === "sandbox") {
    if (!getKkiapayPublicConfig().enabled) return fail(context, 503, "KKIAPAY_SANDBOX_NON_CONFIGURE", "Le paiement Kkiapay Sandbox n’est pas configuré. Contactez l’administrateur du site.");
    const orderId = parsed.data;
    const now = new Date();
    const result = await getDb().transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, user.id))).for("update");
      if (!order) return { error: { status: 404 as const, code: "COMMANDE_INTROUVABLE", message: "Commande introuvable." } };
      if (order.status !== "pending_payment" || !order.expiresAt || order.expiresAt <= now) {
        return { error: { status: 409 as const, code: "COMMANDE_NON_PAYABLE", message: "Cette commande n’est plus payable." } };
      }
      const [latest] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId))
        .orderBy(desc(paymentAttempts.createdAt)).limit(1).for("update");
      if (latest?.status === "pending" && latest.mode === "sandbox") return { payment: latest, reused: true as const };
      if (latest && latest.status !== "failed" && latest.status !== "expired") {
        return { error: { status: 409 as const, code: "TENTATIVE_NON_RENOUVELABLE", message: "Une tentative de paiement est déjà en cours ou nécessite une vérification manuelle." } };
      }
      const payment = await tx.insert(paymentAttempts).values({
        orderId, internalReference: `BB-${order.reference}-${randomUUID()}`, amountFCFA: order.totalFCFA,
        currency: order.currency, mode: "sandbox", status: "pending", providerStatus: "sandbox_initialized",
      }).returning().then((rows) => rows[0]);
      return { payment, reused: false as const };
    });
    if ("error" in result && result.error) return fail(context, result.error.status, result.error.code, result.error.message);
    const paymentResponse = RetryOrderPaymentResponse.parse({ data: {
      id: result.payment.id, orderId, amountFCFA: result.payment.amountFCFA, currency: result.payment.currency,
      status: "pending", paymentUrl: null, partnerId: result.payment.internalReference, createdAt: result.payment.createdAt,
    } });
    return context.json(paymentResponse, result.reused ? 200 : 201);
  }

  const orderId = parsed.data;
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id))).for("update");
    if (!order) return { error: { status: 404 as const, code: "COMMANDE_INTROUVABLE", message: "Commande introuvable." } };

    const [latest] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId))
      .orderBy(desc(paymentAttempts.createdAt)).limit(1).for("update");
    if (order.status === "confirmed" && latest?.status === "succeeded") {
      return { payment: latest, alreadyPaid: true as const };
    }
    if (order.status !== "pending_payment" || !order.expiresAt || order.expiresAt <= now) {
      if (order.status === "pending_payment" && order.expiresAt && order.expiresAt <= now) {
        await tx.update(orders).set({ status: "expired", updatedAt: now }).where(eq(orders.id, orderId));
        await tx.update(stockReservations).set({ status: "expired", updatedAt: now })
          .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
        if (latest?.status === "pending") {
          await tx.update(paymentAttempts).set({ status: "expired", providerStatus: "order_expired", verifiedAt: now, updatedAt: now })
            .where(eq(paymentAttempts.id, latest.id));
        }
        await tx.insert(orderStatusHistory).values({ orderId, fromStatus: "pending_payment", toStatus: "expired", authorType: "system", reason: "Délai de paiement dépassé" });
      }
      return { error: { status: 409 as const, code: "COMMANDE_NON_PAYABLE", message: "Cette commande ne peut plus être payée." } };
    }

    let payment = latest;
    if (payment?.status !== "pending") {
      if (payment?.status !== "failed") return { error: { status: 409 as const, code: "TENTATIVE_ABSENTE", message: "Aucune tentative de paiement disponible." } };
      [payment] = await tx.insert(paymentAttempts).values({
        orderId, internalReference: `SIM-${order.reference}-${randomUUID()}`, amountFCFA: order.totalFCFA,
        currency: order.currency, mode: "mock", status: "pending", providerStatus: "customer_simulation_retry",
      }).returning();
    }
    if (!payment) return { error: { status: 409 as const, code: "TENTATIVE_ABSENTE", message: "Aucune tentative de paiement disponible." } };

    const lines = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity }).from(orderItems)
      .where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.productId));
    if (!lines.length) return { error: { status: 409 as const, code: "COMMANDE_VIDE", message: "La commande ne contient aucun article." } };
    const reservations = await tx.select({ productId: stockReservations.productId, quantity: stockReservations.quantity })
      .from(stockReservations).where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active"), gt(stockReservations.expiresAt, now)))
      .orderBy(asc(stockReservations.productId)).for("update");
    const reservationByProduct = new Map(reservations.map((reservation) => [reservation.productId, reservation.quantity]));
    if (lines.some((line) => reservationByProduct.get(line.productId) !== line.quantity)) {
      return { error: { status: 409 as const, code: "RESERVATION_EXPIREE", message: "La réservation de stock n’est plus valide. Reprenez votre commande." } };
    }
    const productIds = lines.map((line) => line.productId);
    const lockedProducts = await tx.select({ id: products.id, stock: products.stockPhysical }).from(products)
      .where(inArray(products.id, productIds)).orderBy(asc(products.id)).for("update");
    const stockByProduct = new Map(lockedProducts.map((product) => [product.id, product.stock]));
    if (lines.some((line) => (stockByProduct.get(line.productId) ?? 0) < line.quantity)) {
      return { error: { status: 409 as const, code: "STOCK_INSUFFISANT", message: "Le stock a changé; le paiement ne peut pas être confirmé." } };
    }

    for (const line of lines) {
      const stockBefore = stockByProduct.get(line.productId)!;
      const stockAfter = stockBefore - line.quantity;
      await tx.update(products).set({ stockPhysical: stockAfter, updatedAt: now }).where(eq(products.id, line.productId));
      await tx.insert(stockMovements).values({ productId: line.productId, type: "sale", variation: -line.quantity, stockBefore, stockAfter, orderId, authorId: user.id, reason: "Commande confirmée par paiement de démonstration" });
    }
    await tx.update(stockReservations).set({ status: "consumed", updatedAt: now })
      .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
    await tx.update(orders).set({ status: "confirmed", confirmedAt: now, updatedAt: now }).where(eq(orders.id, orderId));
    await tx.update(paymentAttempts).set({ mode: "mock", status: "succeeded", providerStatus: "customer_simulated_succeeded", verifiedAt: now,
      usefulResponse: { simulation: true, outcome: "succeeded", customerId: user.id }, updatedAt: now }).where(eq(paymentAttempts.id, payment.id));
    await tx.insert(orderStatusHistory).values({ orderId, fromStatus: "pending_payment", toStatus: "confirmed", authorType: "customer", authorId: user.id, reason: "Paiement de démonstration confirmé" });
    await tx.insert(notifications).values({ userId: user.id, type: "order_confirmed", title: "Commande confirmée", message: `La commande ${order.reference} est confirmée.`, link: `/compte/commandes/${orderId}`, idempotencyKey: `customer-sim-payment:${orderId}` }).onConflictDoNothing();
    await tx.insert(paymentEvents).values({ source: "return", payload: { simulation: true, outcome: "succeeded", internalReference: payment.internalReference, orderReference: order.reference }, reconciled: true, processedAt: now });
    await tx.insert(auditLogs).values({ actorId: user.id, action: "payment.simulated.succeeded", entityType: "order", entityId: orderId, metadata: { reference: order.reference, amountFCFA: payment.amountFCFA } });
    return { payment, alreadyPaid: false as const };
  });

  if ("error" in result && result.error) return fail(context, result.error.status, result.error.code, result.error.message);
  const data = RetryOrderPaymentResponse.parse({ data: {
    id: result.payment.id, orderId, amountFCFA: result.payment.amountFCFA, currency: result.payment.currency,
    status: "succeeded", paymentUrl: null, createdAt: result.payment.createdAt,
  } });
  return context.json(data, result.alreadyPaid ? 200 : 201);
});

router.post("/payments/verify", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  if (getPaymentMode() !== "sandbox") return fail(context, 409, "MODE_PAIEMENT_INACTIF", "La vérification Kkiapay Sandbox n’est pas active.");
  const parsed = VerifyPaymentBody.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "La référence de transaction est invalide.");
  const [ownedOrder] = await getDb().select({ id: orders.id }).from(orders)
    .where(and(eq(orders.id, parsed.data.orderId), eq(orders.userId, user.id))).limit(1);
  if (!ownedOrder) return fail(context, 404, "COMMANDE_INTROUVABLE", "Commande introuvable.");
  const result = await verifyAndSettleKkiapay({ ...parsed.data, actorId: user.id, source: "return" });
  if ("error" in result) return fail(context, result.error.status, result.error.code, result.error.message);
  const paymentStatus = result.data.paymentStatus;
  return context.json(VerifyPaymentResponse.parse({ data: {
    orderId: result.data.orderId,
    orderStatus: result.data.status,
    paymentStatus,
    verified: paymentStatus !== "pending",
    updatedAt: new Date(),
  } }));
});

router.post("/payments/kkiapay/webhook", async (context) => {
  if (!hasValidKkiapayWebhookSecret(context.req.header("x-kkiapay-secret") ?? null)) {
    return context.json({ error: { code: "SIGNATURE_WEBHOOK_INVALIDE", message: "Signature webhook invalide." } }, 401);
  }
  const body = await context.req.json().catch(() => null) as {
    transactionId?: unknown; partnerId?: unknown; event?: unknown;
  } | null;
  if (typeof body?.transactionId !== "string" || typeof body.partnerId !== "string" ||
    !["transaction.success", "transaction.failed"].includes(String(body.event))) {
    return context.json({ error: { code: "EVENEMENT_WEBHOOK_INVALIDE", message: "Événement Kkiapay invalide." } }, 400);
  }
  const payment = await resolveKkiapayPartner(body.partnerId);
  if (!payment) return context.json({ error: { code: "TENTATIVE_INTROUVABLE", message: "Tentative de paiement introuvable." } }, 404);
  const result = await verifyAndSettleKkiapay({ orderId: payment.orderId, paymentAttemptId: payment.id,
    transactionId: body.transactionId, source: "webhook" });
  if ("error" in result) {
    if (result.error.status === 503) return context.json({ error: { code: result.error.code, message: result.error.message } }, 503);
    return context.json({ received: true, needsReconciliation: result.error.status === 409 || result.error.status === 422 });
  }
  return context.json({ received: true });
});

router.get("/orders/:id/payment-status", async (context) => {
  const user = await getAuthenticatedUser(context);
  if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = GetOrderPaymentStatusResponse.shape.data.shape.orderId.safeParse(context.req.param("id"));
  if (!parsed.success) return fail(context, 400, "PARAMETRE_INVALIDE", "Identifiant de commande invalide.");
  const orderId = parsed.data;
  const [order] = await getDb().select({ id: orders.id, status: orders.status, updatedAt: orders.updatedAt }).from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, user.id))).limit(1);
  if (!order) return fail(context, 404, "COMMANDE_INTROUVABLE", "Commande introuvable.");
  const [payment] = await getDb().select({ status: paymentAttempts.status, updatedAt: paymentAttempts.updatedAt }).from(paymentAttempts)
    .where(eq(paymentAttempts.orderId, orderId)).orderBy(desc(paymentAttempts.createdAt)).limit(1);
  return context.json(GetOrderPaymentStatusResponse.parse({ data: {
    orderId, orderStatus: order.status, paymentStatus: payment?.status ?? "pending",
    verified: payment ? payment.status !== "pending" : false, updatedAt: payment?.updatedAt ?? order.updatedAt,
  } }));
});

export default router;
