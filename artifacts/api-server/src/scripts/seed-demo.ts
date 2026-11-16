import { and, eq } from "@workspace/db";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "@workspace/db";
import {
  categories,
  productImages,
  products,
  stockMovements,
} from "@workspace/db/schema";

type DemoCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  parentId: string | null;
  productCount: number;
};
type DemoCatalogProduct = {
  id: string;
  reference: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  priceFCFA: number;
  compareAtPriceFCFA?: number | null;
  stock: number;
  popularity: number;
  isNew: boolean;
  createdAt: string;
  category: DemoCategory;
  images: Array<{ url: string; alt: string }>;
  attributes: Array<{ name: string; value: string }>;
};

const localEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

const seedDemoCatalog = async () => {
  const demoDataUrl = new URL("../../../../artifacts/boutik-benin/src/demo/catalog.ts", import.meta.url);
  const { demoCategoryTrees, demoProducts } = await import(demoDataUrl.href) as {
    demoCategoryTrees: Array<{ category: DemoCategory; children: DemoCategory[] }>;
    demoProducts: DemoCatalogProduct[];
  };
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL doit viser une base de développement avant le seed.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Le seed de démonstration est interdit en production.");
  }

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const categoryIdBySlug = new Map<string, string>();
      const upsertCategory = async (
        category: DemoCategory,
        parentId: string | null,
        position: number,
        featured: boolean,
      ) => {
        const [savedCategory] = await tx
          .insert(categories)
          .values({
            id: category.id,
            name: category.name,
            slug: category.slug,
            parentId,
            imageUrl: category.imageUrl ?? null,
            featured,
            position,
            active: true,
          })
          .onConflictDoUpdate({
            target: categories.slug,
            set: {
              name: category.name,
              parentId,
              imageUrl: category.imageUrl ?? null,
              featured,
              position,
              active: true,
              updatedAt: new Date(),
            },
          })
          .returning({ id: categories.id });
        categoryIdBySlug.set(category.slug, savedCategory.id);
      };

      for (const [parentPosition, tree] of demoCategoryTrees.entries()) {
        await upsertCategory(tree.category, null, parentPosition, true);
        for (const [childPosition, child] of tree.children.entries()) {
          const parentId = categoryIdBySlug.get(tree.category.slug);
          if (!parentId) throw new Error(`Catégorie parente absente : ${tree.category.slug}`);
          await upsertCategory(child, parentId, childPosition, false);
        }
      }

      for (const product of demoProducts) {
        const categoryId = categoryIdBySlug.get(product.category.slug);
        if (!categoryId) throw new Error(`Catégorie produit absente : ${product.category.slug}`);
        const [savedProduct] = await tx
          .insert(products)
          .values({
            id: product.id,
            reference: product.reference,
            name: product.name,
            slug: product.slug,
            shortDescription: product.shortDescription,
            description: product.description,
            priceFCFA: product.priceFCFA,
            compareAtPriceFCFA: product.compareAtPriceFCFA ?? null,
            stockPhysical: product.stock,
            lowStockThreshold: 3,
            categoryId,
            keywords: product.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/),
            attributes: product.attributes.map(({ name, value }) => ({ label: name, value })),
            status: "active",
            isNewUntil: product.isNew ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
            popularity: product.popularity,
            createdAt: new Date(product.createdAt),
          })
          .onConflictDoUpdate({
            target: products.reference,
            set: {
              name: product.name,
              slug: product.slug,
              shortDescription: product.shortDescription,
              description: product.description,
              priceFCFA: product.priceFCFA,
              compareAtPriceFCFA: product.compareAtPriceFCFA ?? null,
              stockPhysical: product.stock,
              categoryId,
              keywords: product.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/),
              attributes: product.attributes.map(({ name, value }) => ({ label: name, value })),
              status: "active",
              isNewUntil: product.isNew ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
              popularity: product.popularity,
              updatedAt: new Date(),
            },
          })
          .returning({ id: products.id });

        const publicId = `demo-${product.slug}`;
        const image = product.images[0];
        if (image) {
          await tx
            .insert(productImages)
            .values({
              productId: savedProduct.id,
              cloudinaryPublicId: publicId,
              url: image.url,
              altText: image.alt,
              position: 0,
              isPrimary: true,
            })
            .onConflictDoUpdate({
              target: productImages.cloudinaryPublicId,
              set: {
                productId: savedProduct.id,
                url: image.url,
                altText: image.alt,
                position: 0,
                isPrimary: true,
                updatedAt: new Date(),
              },
            });
        }

        const [initialMovement] = await tx
          .select({ id: stockMovements.id })
          .from(stockMovements)
          .where(and(eq(stockMovements.productId, savedProduct.id), eq(stockMovements.type, "initial")))
          .limit(1);
        if (!initialMovement) {
          await tx.insert(stockMovements).values({
            productId: savedProduct.id,
            type: "initial",
            variation: product.stock,
            stockBefore: 0,
            stockAfter: product.stock,
            reason: "Stock initial de démonstration",
          });
        }
      }
    });
    const categoryCount = demoCategoryTrees.reduce((count, tree) => count + 1 + tree.children.length, 0);
    console.info(`Seed démo terminé : ${categoryCount} catégories et ${demoProducts.length} produits.`);
  } finally {
    await closeDb();
  }
};

seedDemoCatalog().catch((error: unknown) => {
  console.error("Échec du seed démo.", error);
  process.exitCode = 1;
});
