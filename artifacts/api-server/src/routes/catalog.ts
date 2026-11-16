import { and, asc, count, desc, eq, gte, inArray, lte, or, sql, type SQL } from "@workspace/db";
import { GetCategoriesResponse, GetHomeResponse, GetProductResponse, GetProductsQueryParams, GetProductsResponse } from "@workspace/api-zod";
import { getDb } from "@workspace/db";
import { categories, productImages, products, stockReservations } from "@workspace/db/schema";
import { Hono } from "hono";

const router = new Hono();
const availableStock = () => sql<number>`GREATEST(
  ${products.stockPhysical} - COALESCE((
    SELECT SUM(${stockReservations.quantity})
    FROM ${stockReservations}
    WHERE ${stockReservations.productId} = ${products.id}
      AND ${stockReservations.status} = 'active'
      AND ${stockReservations.expiresAt} > now()
  ), 0), 0
)`.mapWith(Number);

export type CatalogDb = ReturnType<typeof getDb>;

export async function loadProductCards(
  db: CatalogDb,
  options: { where: SQL; orderBy: SQL[]; limit: number; offset?: number },
) {
  const stock = availableStock();
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      reference: products.reference,
      name: products.name,
      shortDescription: products.shortDescription,
      description: products.description,
      priceFCFA: products.priceFCFA,
      compareAtPriceFCFA: products.compareAtPriceFCFA,
      stock,
      isNewUntil: products.isNewUntil,
      popularity: products.popularity,
      attributes: products.attributes,
      createdAt: products.createdAt,
      categoryId: categories.id,
      categorySlug: categories.slug,
      categoryName: categories.name,
      categoryImageUrl: categories.imageUrl,
      categoryParentId: categories.parentId,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(options.where)
    .orderBy(...options.orderBy)
    .limit(options.limit)
    .offset(options.offset ?? 0);

  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  const [categoryCounts, imageRows] = await Promise.all([
    categoryIds.length
      ? db.select({ categoryId: products.categoryId, total: count() }).from(products)
          .where(and(eq(products.status, "active"), inArray(products.categoryId, categoryIds)))
          .groupBy(products.categoryId)
      : Promise.resolve([]),
    rows.length
      ? db.select({ productId: productImages.productId, url: productImages.url, alt: productImages.altText, isPrimary: productImages.isPrimary, position: productImages.position })
          .from(productImages)
          .where(inArray(productImages.productId, rows.map((row) => row.id)))
          .orderBy(asc(productImages.position))
      : Promise.resolve([]),
  ]);
  const categoryCountById = new Map(categoryCounts.map((row) => [row.categoryId, row.total]));
  const imagesByProduct = new Map<string, Array<{ url: string; alt: string; isPrimary: boolean }>>();
  for (const image of imageRows) {
    const list = imagesByProduct.get(image.productId) ?? [];
    list.push({ url: image.url, alt: image.alt, isPrimary: image.isPrimary });
    imagesByProduct.set(image.productId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    reference: row.reference,
    name: row.name,
    shortDescription: row.shortDescription,
    description: row.description,
    priceFCFA: row.priceFCFA,
    compareAtPriceFCFA: row.compareAtPriceFCFA,
    stock: row.stock,
    available: row.stock > 0,
    isNew: row.isNewUntil !== null && row.isNewUntil > new Date(),
    popularity: row.popularity,
    category: {
      id: row.categoryId,
      slug: row.categorySlug,
      name: row.categoryName,
      ...(row.categoryImageUrl ? { imageUrl: row.categoryImageUrl } : {}),
      productCount: categoryCountById.get(row.categoryId) ?? 0,
      parentId: row.categoryParentId,
    },
    images: imagesByProduct.get(row.id) ?? [],
    attributes: row.attributes.map(({ label, value }) => ({ name: label, value })),
    createdAt: row.createdAt,
  }));
}

async function loadCategoryTree(db: CatalogDb) {
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, imageUrl: categories.imageUrl, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.position), asc(categories.name));
  const counts = rows.length
    ? await db
        .select({ categoryId: products.categoryId, total: count() })
        .from(products)
        .where(and(eq(products.status, "active"), inArray(products.categoryId, rows.map((row) => row.id))))
        .groupBy(products.categoryId)
    : [];
  const countByCategory = new Map(counts.map((row) => [row.categoryId, row.total]));
  return rows
    .filter((row) => row.parentId === null)
    .map((row) => {
      const childRows = rows.filter((child) => child.parentId === row.id);
      const childCount = childRows.reduce((total, child) => total + (countByCategory.get(child.id) ?? 0), 0);
      return {
        category: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
          productCount: (countByCategory.get(row.id) ?? 0) + childCount,
          parentId: null,
        },
        children: childRows.map((child) => ({
          id: child.id,
          slug: child.slug,
          name: child.name,
          ...(child.imageUrl ? { imageUrl: child.imageUrl } : {}),
          productCount: countByCategory.get(child.id) ?? 0,
          parentId: child.parentId,
        })),
      };
    });
}

router.get("/categories", async (context) => {
  const data = await loadCategoryTree(getDb());
  return context.json(GetCategoriesResponse.parse({ data }));
});

router.get("/home", async (context) => {
  const db = getDb();
  const [categoryTree, newProducts, popularProducts] = await Promise.all([
    loadCategoryTree(db),
    loadProductCards(db, {
      where: and(eq(products.status, "active"), eq(categories.active, true))!,
      orderBy: [desc(products.createdAt)],
      limit: 8,
    }),
    loadProductCards(db, {
      where: and(eq(products.status, "active"), eq(categories.active, true))!,
      orderBy: [desc(products.popularity), desc(products.createdAt)],
      limit: 8,
    }),
  ]);
  const data = {
    storeName: "Boutik Bénin",
    banner: {
      title: "Des articles choisis pour le quotidien",
      subtitle: "Parcourez notre catalogue et découvrez les articles disponibles.",
      imageUrl: newProducts[0]?.images[0]?.url ?? "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "Sélection de produits Boutik Bénin",
      actionLabel: "Voir la boutique",
      actionUrl: "/produits",
    },
    featuredCategories: categoryTree.map(({ category }) => category).filter((category) => category.productCount > 0).slice(0, 4),
    promotions: [],
    newProducts,
    popularProducts,
  };
  return context.json(GetHomeResponse.parse({ data }));
});

router.get("/products", async (context) => {
  const rawQuery = context.req.query();
  if (rawQuery.disponible !== undefined && !["true", "false"].includes(rawQuery.disponible)) {
    return context.json(
      { error: { code: "PARAMETRES_INVALIDES", message: "Le filtre de disponibilité doit valoir true ou false." } },
      400,
    );
  }
  const parsed = GetProductsQueryParams.safeParse({
    ...rawQuery,
    ...(rawQuery.disponible === undefined ? {} : { disponible: rawQuery.disponible === "true" }),
  });
  if (!parsed.success) {
    return context.json(
      { error: { code: "PARAMETRES_INVALIDES", message: "Les filtres fournis sont invalides." } },
      400,
    );
  }

  const { q, categorie, prix_min, prix_max, disponible, tri, page, taille } = parsed.data;
  const db = getDb();
  const stock = availableStock();
  const filters = [eq(products.status, "active"), eq(categories.active, true)];
  if (q?.trim()) {
    const pattern = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const contains = (field: SQL) => sql`unaccent(lower(${field})) LIKE unaccent(lower(${pattern}))`;
    filters.push(or(
      contains(sql`${products.name}`),
      contains(sql`${products.reference}`),
      contains(sql`${products.shortDescription}`),
      sql`unaccent(lower(array_to_string(${products.keywords}, ' '))) LIKE unaccent(lower(${pattern}))`,
    )!);
  }
  if (prix_min !== undefined) filters.push(gte(products.priceFCFA, prix_min));
  if (prix_max !== undefined) filters.push(lte(products.priceFCFA, prix_max));
  if (categorie) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, categorie), eq(categories.active, true)))
      .limit(1);
    if (!category) {
      return context.json(GetProductsResponse.parse({ data: [], meta: { page, taille, total: 0 } }));
    }
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, category.id), eq(categories.active, true)));
    filters.push(inArray(products.categoryId, [category.id, ...children.map((child) => child.id)]));
  }
  if (disponible !== undefined) {
    filters.push(disponible ? sql`${stock} > 0` : sql`${stock} = 0`);
  }

  const where = and(...filters)!;
  const [{ total }] = await db
    .select({ total: count() })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where);
  const orderBy = tri === "prix_croissant"
    ? [asc(products.priceFCFA)]
    : tri === "prix_decroissant"
      ? [desc(products.priceFCFA)]
      : tri === "nouveaute"
        ? [desc(products.createdAt)]
        : tri === "popularite"
          ? [desc(products.popularity), desc(products.createdAt)]
          : [desc(products.popularity), desc(products.createdAt)];
  const data = await loadProductCards(db, { where, orderBy, limit: taille, offset: (page - 1) * taille });
  return context.json(GetProductsResponse.parse({ data, meta: { page, taille, total } }));
});

router.get("/products/:slug", async (context) => {
  const data = await loadProductCards(getDb(), {
    where: and(
      eq(products.slug, context.req.param("slug")),
      eq(products.status, "active"),
      eq(categories.active, true),
    )!,
    orderBy: [asc(products.createdAt)],
    limit: 1,
  });
  const product = data[0];
  if (!product) {
    return context.json({ error: { code: "INTROUVABLE", message: "Cet article n’est pas disponible." } }, 404);
  }
  return context.json(GetProductResponse.parse({ data: product }));
});

export default router;
