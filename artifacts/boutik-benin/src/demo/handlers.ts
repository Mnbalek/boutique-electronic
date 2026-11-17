import { http, HttpResponse } from "msw";
import { demoCategories, demoCategoryTrees, demoProducts } from "./catalog";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr");

const categoryList = demoCategoryTrees.flatMap(({ category, children }) => [
  category,
  ...children,
]);

const newestProducts = [...demoProducts]
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  .slice(0, 8);

const popularProducts = [...demoProducts]
  .sort((a, b) => b.popularity - a.popularity)
  .slice(0, 8);

const homeResponse = {
  data: {
    storeName: "Boutik Bénin",
    banner: {
      title: "Des articles choisis pour le quotidien",
      subtitle: "Parcourez notre catalogue et découvrez les articles disponibles.",
      imageUrl: demoProducts[0].images[0].url,
      imageAlt: "Sélection de produits Boutik Bénin",
      actionLabel: "Voir la boutique",
      actionUrl: "/produits",
    },
    featuredCategories: demoCategories.slice(0, 4),
    promotions: [],
    newProducts: newestProducts,
    popularProducts,
  },
};

const unauthorized = () =>
  HttpResponse.json(
    {
      error: {
        code: "NON_AUTHENTIFIE",
        message: "Une connexion est nécessaire pour accéder à cette ressource.",
      },
    },
    { status: 401 },
  );

export const demoHandlers = [
  http.get("/api/home", () => HttpResponse.json(homeResponse)),

  http.get("/api/categories", () =>
    HttpResponse.json({ data: demoCategoryTrees }),
  ),

  http.get("/api/products", ({ request }) => {
    const query = new URL(request.url).searchParams;
    const search = normalize(query.get("q")?.trim() ?? "");
    const categorySlug = query.get("categorie");
    const category = categoryList.find((item) => item.slug === categorySlug);
    const minimumPrice = Number(query.get("prix_min"));
    const maximumPrice = Number(query.get("prix_max"));
    const availability = query.get("disponible");

    let products = demoProducts.filter((product) => {
      const searchable = normalize(
        `${product.name} ${product.reference} ${product.shortDescription}`,
      );
      const matchesSearch = !search || searchable.includes(search);
      const matchesCategory =
        !categorySlug ||
        product.category.slug === categorySlug ||
        (category?.parentId == null && product.category.parentId === category?.id);
      const matchesMinimum =
        !query.has("prix_min") || product.priceFCFA >= minimumPrice;
      const matchesMaximum =
        !query.has("prix_max") || product.priceFCFA <= maximumPrice;
      const matchesAvailability =
        availability == null || product.available === (availability === "true");

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinimum &&
        matchesMaximum &&
        matchesAvailability
      );
    });

    switch (query.get("tri")) {
      case "prix_croissant":
        products = products.sort((a, b) => a.priceFCFA - b.priceFCFA);
        break;
      case "prix_decroissant":
        products = products.sort((a, b) => b.priceFCFA - a.priceFCFA);
        break;
      case "nouveaute":
        products = products.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        break;
      case "popularite":
      case "pertinence":
        products = products.sort((a, b) => b.popularity - a.popularity);
        break;
    }

    const page = Math.max(1, Number.parseInt(query.get("page") ?? "1", 10) || 1);
    const taille = Math.min(
      48,
      Math.max(1, Number.parseInt(query.get("taille") ?? "24", 10) || 24),
    );
    const total = products.length;

    return HttpResponse.json({
      data: products.slice((page - 1) * taille, page * taille),
      meta: { page, taille, total },
    });
  }),

  http.get("/api/products/:slug", ({ params }) => {
    const product = demoProducts.find((item) => item.slug === params.slug);
    if (!product) {
      return HttpResponse.json(
        {
          error: {
            code: "INTROUVABLE",
            message: "Cet article n’est pas disponible.",
          },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({ data: product });
  }),

  http.get("/api/auth/me", unauthorized),
  http.get("/api/cart", unauthorized),
];
