import { and, asc, eq, inArray, isNull, sql } from "@workspace/db";
import { CreateAddressBody, DeleteAddressResponse, GetAddressesResponse, GetCartResponse, GetDeliveryQuoteQueryParams, GetDeliveryQuoteResponse, GetNotificationsQueryParams, GetNotificationsResponse, GetUnreadNotificationCountResponse, MergeCartBody, MergeCartResponse, RemoveCartItemResponse, SetCartItemBody, SetCartItemResponse, UpdateAddressBody } from "@workspace/api-zod";
import { getDb } from "@workspace/db";
import { addresses, cartItems, carts, communes, deliveryZones, departments, products } from "@workspace/db/schema";
import { Hono, type Context } from "hono";
import { getAuthenticatedUser } from "./auth";
import { loadProductCards } from "./catalog";

const router = new Hono();
const fail = (context: Context, status: 400 | 401 | 404 | 409, code: string, message: string) => context.json({ error: { code, message } }, status);

async function requireUser(context: Context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return null;
  return user;
}

async function getCartPayload(userId: string) {
  const db = getDb();
  const [cart] = await db.insert(carts).values({ userId }).onConflictDoNothing({ target: carts.userId }).returning({ id: carts.id });
  const [existing] = cart ? [cart] : await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!existing) throw new Error("Cart could not be initialized");
  const rows = await db.select({ productId: cartItems.productId, quantity: cartItems.quantity, seenPrice: cartItems.unitPriceSeenFCFA })
    .from(cartItems).where(eq(cartItems.cartId, existing.id)).orderBy(asc(cartItems.createdAt));
  if (!rows.length) return { items: [], subtotalFCFA: 0, itemCount: 0, hasChanges: false };
  const cards = await loadProductCards(db, {
    where: and(inArray(products.id, rows.map((row) => row.productId)), eq(products.status, "active"))!,
    orderBy: [asc(products.name)], limit: rows.length,
  });
  const byId = new Map(cards.map((product) => [product.id, product]));
  const items = rows.flatMap((row) => {
    const product = byId.get(row.productId);
    if (!product) return [];
    const quantity = Math.min(row.quantity, 10);
    return [{ productId: row.productId, product, quantity, previousPriceFCFA: row.seenPrice === product.priceFCFA ? null : row.seenPrice, priceChanged: row.seenPrice !== product.priceFCFA, lineTotalFCFA: product.priceFCFA * quantity }];
  });
  return { items, subtotalFCFA: items.reduce((sum, item) => sum + item.lineTotalFCFA, 0), itemCount: items.reduce((sum, item) => sum + item.quantity, 0), hasChanges: items.some((item) => item.priceChanged || !item.product.available || item.quantity > item.product.stock) };
}

async function cartIdFor(userId: string) {
  const db = getDb();
  const [created] = await db.insert(carts).values({ userId }).onConflictDoNothing({ target: carts.userId }).returning({ id: carts.id });
  if (created) return created.id;
  const [row] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  return row.id;
}

async function addressPayload(userId: string) {
  return getDb().select({ id: addresses.id, label: addresses.label, recipient: addresses.recipient, phone: addresses.phone, departmentId: addresses.departmentId, departmentName: departments.name, communeId: addresses.communeId, communeName: communes.name, neighborhood: addresses.neighborhood, landmark: addresses.landmark, isDefault: addresses.isDefault })
    .from(addresses).innerJoin(departments, eq(addresses.departmentId, departments.id)).innerJoin(communes, eq(addresses.communeId, communes.id))
    .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt))).orderBy(asc(addresses.createdAt));
}

router.get("/geo/departements", async (context) => {
  const data = await getDb().select({ id: departments.id, name: departments.name, code: departments.code }).from(departments).orderBy(asc(departments.name));
  return context.json({ data });
});
router.get("/geo/communes", async (context) => {
  const departmentId = context.req.query("departement_id");
  const filters = [eq(communes.active, true)];
  if (departmentId) filters.push(eq(communes.departmentId, departmentId));
  const data = await getDb().select({ id: communes.id, departmentId: communes.departmentId, name: communes.name, deliveryAvailable: sql<boolean>`COALESCE(${deliveryZones.active}, false)`, zoneName: sql<string | null>`CASE WHEN ${deliveryZones.active} THEN ${deliveryZones.name} ELSE NULL END` }).from(communes).leftJoin(deliveryZones, eq(communes.deliveryZoneId, deliveryZones.id)).where(and(...filters)).orderBy(asc(communes.name));
  return context.json({ data });
});
router.get("/delivery/quote", async (context) => {
  const parsed = GetDeliveryQuoteQueryParams.safeParse({ commune_id: context.req.query("commune_id") });
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "La commune est invalide.");
  const communeId = parsed.data.commune_id;
  const [row] = await getDb().select({ communeId: communes.id, zoneName: deliveryZones.name, feeFCFA: deliveryZones.feeFCFA, active: deliveryZones.active })
    .from(communes).leftJoin(deliveryZones, eq(communes.deliveryZoneId, deliveryZones.id)).where(and(eq(communes.id, communeId), eq(communes.active, true))).limit(1);
  const available = Boolean(row?.active && row.zoneName);
  return context.json(GetDeliveryQuoteResponse.parse({ data: {
    communeId,
    zoneName: available ? row!.zoneName : "Non desservie",
    feeFCFA: available ? row!.feeFCFA : 0,
    deliveryAvailable: available,
  } }));
});

router.get("/cart", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  return context.json(GetCartResponse.parse({ data: await getCartPayload(user.id) }));
});
router.delete("/cart", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  await getDb().delete(cartItems).where(eq(cartItems.cartId, await cartIdFor(user.id)));
  return context.json({ data: await getCartPayload(user.id) });
});
router.put("/cart/items/:productId", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const productId = context.req.param("productId"); const parsed = SetCartItemBody.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Quantité ou prix invalide.");
  const db = getDb(); const [product] = await db.select({ id: products.id, price: products.priceFCFA, stock: products.stockPhysical, status: products.status }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.status !== "active") return fail(context, 404, "PRODUIT_INTROUVABLE", "Ce produit n'est pas disponible.");
  if (parsed.data.quantity > product.stock) return fail(context, 409, "STOCK_INSUFFISANT", "La quantité dépasse le stock disponible.");
  const id = await cartIdFor(user.id);
  const [existingLine] = await db.select({ id: cartItems.id }).from(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.productId, productId))).limit(1);
  if (!existingLine) {
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(cartItems).where(eq(cartItems.cartId, id));
    if (total >= 30) return fail(context, 409, "PANIER_TROP_LONG", "Un panier ne peut pas dépasser 30 articles différents.");
  }
  await db.insert(cartItems).values({ cartId: id, productId, quantity: parsed.data.quantity, unitPriceSeenFCFA: parsed.data.lastSeenPriceFCFA }).onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity: parsed.data.quantity, unitPriceSeenFCFA: parsed.data.lastSeenPriceFCFA, updatedAt: new Date() } });
  return context.json(SetCartItemResponse.parse({ data: await getCartPayload(user.id) }));
});
router.delete("/cart/items/:productId", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const id = await cartIdFor(user.id); await getDb().delete(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.productId, context.req.param("productId"))));
  return context.json(RemoveCartItemResponse.parse({ data: await getCartPayload(user.id) }));
});
router.post("/cart/merge", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = MergeCartBody.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Panier local invalide.");
  const db = getDb(); const id = await cartIdFor(user.id);
  const existingIds = await db.select({ productId: cartItems.productId }).from(cartItems).where(eq(cartItems.cartId, id));
  const combinedIds = new Set([...existingIds.map((line) => line.productId), ...parsed.data.items.map((line) => line.productId)]);
  if (combinedIds.size > 30) return fail(context, 409, "PANIER_TROP_LONG", "Un panier ne peut pas dépasser 30 articles différents.");
  for (const line of parsed.data.items) {
    const [product] = await db.select({ id: products.id, price: products.priceFCFA, stock: products.stockPhysical, status: products.status }).from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product || product.status !== "active") continue;
    const [old] = await db.select({ quantity: cartItems.quantity }).from(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.productId, product.id))).limit(1);
    const quantity = Math.min(10, (old?.quantity ?? 0) + line.quantity, product.stock);
    if (quantity > 0) await db.insert(cartItems).values({ cartId: id, productId: product.id, quantity, unitPriceSeenFCFA: line.lastSeenPriceFCFA }).onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity, unitPriceSeenFCFA: line.lastSeenPriceFCFA, updatedAt: new Date() } });
  }
  return context.json(MergeCartResponse.parse({ data: await getCartPayload(user.id) }));
});

router.get("/me/addresses", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  return context.json(GetAddressesResponse.parse({ data: await addressPayload(user.id) }));
});

router.get("/notifications", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const parsed = GetNotificationsQueryParams.safeParse({ page: context.req.query("page"), taille: context.req.query("taille") });
  if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Les paramètres de pagination sont invalides.");
  return context.json(GetNotificationsResponse.parse({ data: [], meta: { page: parsed.data.page, taille: parsed.data.taille, total: 0 } }));
});

router.get("/notifications/unread-count", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  return context.json(GetUnreadNotificationCountResponse.parse({ data: { count: 0 } }));
});
async function saveAddress(context: Context, userId: string, addressId?: string) {
  const schema = addressId ? UpdateAddressBody : CreateAddressBody;
  const parsed = schema.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return fail(context, 400, "DONNEES_INVALIDES", "Vérifiez les informations de l'adresse.");
  const body = parsed.data; const db = getDb();
  const [commune] = await db.select({ id: communes.id, departmentId: communes.departmentId, active: communes.active }).from(communes).where(eq(communes.id, body.communeId)).limit(1);
  if (!commune || !commune.active || commune.departmentId !== body.departmentId) return fail(context, 400, "COMMUNE_INVALIDE", "La commune ne correspond pas au département sélectionné.");
  const saved = await db.transaction(async (tx) => {
    if (!addressId) {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(addresses).where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
      if (total >= 10) return null;
    }
    if (body.isDefault) await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
    if (addressId) {
      const [row] = await tx.update(addresses).set({ ...body, updatedAt: new Date() }).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId), isNull(addresses.deletedAt))).returning({ id: addresses.id });
      return row;
    }
    const [row] = await tx.insert(addresses).values({ ...body, userId }).returning({ id: addresses.id }); return row;
  });
  if (!saved) return addressId
    ? fail(context, 404, "ADRESSE_INTROUVABLE", "Adresse introuvable.")
    : fail(context, 409, "LIMITE_ADRESSES", "Vous ne pouvez pas enregistrer plus de 10 adresses.");
  const data = await addressPayload(userId); return context.json({ data: data.find((row) => row.id === saved.id) });
}
router.post("/me/addresses", async (context) => { const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire."); return saveAddress(context, user.id); });
router.put("/me/addresses/:id", async (context) => { const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire."); return saveAddress(context, user.id, context.req.param("id")); });
router.delete("/me/addresses/:id", async (context) => {
  const user = await requireUser(context); if (!user) return fail(context, 401, "NON_AUTHENTIFIE", "Une connexion est nécessaire.");
  const [row] = await getDb().update(addresses).set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() }).where(and(eq(addresses.id, context.req.param("id")), eq(addresses.userId, user.id), isNull(addresses.deletedAt))).returning({ id: addresses.id });
  if (!row) return fail(context, 404, "ADRESSE_INTROUVABLE", "Adresse introuvable.");
  return context.json(DeleteAddressResponse.parse({ data: { success: true, message: "Adresse supprimée." } }));
});

export default router;
