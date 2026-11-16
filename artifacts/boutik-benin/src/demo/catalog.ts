import type { Category, CategoryTree, Product } from "@workspace/api-client-react";

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const categoryDefinitions = [
  {
    id: 1,
    slug: "high-tech",
    name: "High-tech",
    children: [
      { id: 101, slug: "telephonie", name: "Téléphonie" },
      { id: 102, slug: "audio-image", name: "Audio et image" },
    ],
  },
  {
    id: 2,
    slug: "mode-accessoires",
    name: "Mode et accessoires",
    children: [
      { id: 201, slug: "sacs", name: "Sacs" },
      { id: 202, slug: "chaussures", name: "Chaussures" },
    ],
  },
  {
    id: 3,
    slug: "maison-deco",
    name: "Maison et décoration",
    children: [
      { id: 301, slug: "mobilier", name: "Mobilier" },
      { id: 302, slug: "decoration", name: "Décoration" },
    ],
  },
  {
    id: 4,
    slug: "beaute-soins",
    name: "Beauté et soins",
    children: [
      { id: 401, slug: "soin-visage", name: "Soin du visage" },
      { id: 402, slug: "parfums", name: "Parfums" },
    ],
  },
  {
    id: 5,
    slug: "cuisine",
    name: "Cuisine",
    children: [
      { id: 501, slug: "preparation", name: "Préparation" },
      { id: 502, slug: "art-table", name: "Art de la table" },
    ],
  },
  {
    id: 6,
    slug: "bijoux-montres",
    name: "Bijoux et montres",
    children: [
      { id: 601, slug: "montres", name: "Montres" },
      { id: 602, slug: "bijoux", name: "Bijoux" },
    ],
  },
] as const;

const imageUrl = (photoId: string, width = 640) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${width}&h=${Math.round(width * 1.25)}&q=78`;

const categoryFor = new Map<string, Category>();

export const demoCategoryTrees: CategoryTree[] = categoryDefinitions.map(
  (definition) => {
    const parent: Category = {
      id: uuid(definition.id),
      slug: definition.slug,
      name: definition.name,
      imageUrl: imageUrl(
        definition.id === 1
          ? "1511707171634-5f897ff02aa9"
          : definition.id === 2
            ? "1548036328-c9fa89d128fa"
            : definition.id === 3
              ? "1503602642458-232111445657"
              : definition.id === 4
                ? "1556228720-195a672e8a03"
                : definition.id === 5
                  ? "1556911220-bff31c812dba"
                  : "1523275335684-37898b6baf30",
      ),
      productCount: 8,
      parentId: null,
    };
    categoryFor.set(definition.slug, parent);

    const children: Category[] = definition.children.map((child) => {
      const category: Category = {
        id: uuid(child.id),
        slug: child.slug,
        name: child.name,
        imageUrl: parent.imageUrl,
        productCount: 4,
        parentId: parent.id,
      };
      categoryFor.set(child.slug, category);
      return category;
    });

    return { category: parent, children };
  },
);

export const demoCategories = demoCategoryTrees.map(({ category }) => category);

type ProductSeed = {
  name: string;
  slug: string;
  reference: string;
  categorySlug: string;
  priceFCFA: number;
  stock: number;
  photoId: string;
  description: string;
  isNew?: boolean;
  compareAtPriceFCFA?: number;
};

const seeds: ProductSeed[] = [
  { name: "Smartphone Noku A8", slug: "smartphone-noku-a8", reference: "BB-HT-001", categorySlug: "telephonie", priceFCFA: 89500, stock: 14, photoId: "1511707171634-5f897ff02aa9", description: "Un téléphone polyvalent présenté dans la sélection high-tech de démonstration.", isNew: true },
  { name: "Smartphone Aza 128 Go", slug: "smartphone-aza-128", reference: "BB-HT-002", categorySlug: "telephonie", priceFCFA: 112000, stock: 9, photoId: "1598327105666-5b89351aff97", description: "Un format moderne pour rester joignable et consulter vos applications au quotidien.", compareAtPriceFCFA: 125000 },
  { name: "Ordinateur portable Alada 14", slug: "ordinateur-alada-14", reference: "BB-HT-003", categorySlug: "telephonie", priceFCFA: 245000, stock: 5, photoId: "1517336714731-489689fd1ca8", description: "Un ordinateur compact présenté pour illustrer les fiches du catalogue.", isNew: true },
  { name: "Tablette Sèmè 10", slug: "tablette-seme-10", reference: "BB-HT-004", categorySlug: "telephonie", priceFCFA: 138000, stock: 11, photoId: "1531297484001-80022131f5a1", description: "Un grand écran dans un format pensé pour la consultation et les loisirs." },
  { name: "Ordinateur portable Kétou 15", slug: "ordinateur-ketou-15", reference: "BB-HT-005", categorySlug: "telephonie", priceFCFA: 289000, stock: 7, photoId: "1496181133206-80ce9b88a853", description: "Un ordinateur de démonstration pour la sélection des équipements numériques." },
  { name: "Appareil photo compact Wémè", slug: "appareil-photo-weme", reference: "BB-HT-006", categorySlug: "audio-image", priceFCFA: 159000, stock: 4, photoId: "1526170375885-4d8ecf77b99f", description: "Un appareil compact présenté parmi les équipements d’image." },
  { name: "Casque audio Atakora", slug: "casque-audio-atakora", reference: "BB-HT-007", categorySlug: "audio-image", priceFCFA: 32500, stock: 0, photoId: "1505740420928-5e560c06d30e", description: "Un casque audio de démonstration, actuellement indiqué comme épuisé." },
  { name: "Enceinte portable Kora Mini", slug: "enceinte-kora-mini", reference: "BB-HT-008", categorySlug: "audio-image", priceFCFA: 27900, stock: 18, photoId: "1583394838336-acd977736f90", description: "Une enceinte nomade pour écouter vos contenus à la maison ou en déplacement.", isNew: true },

  { name: "Sac tissé Ébène", slug: "sac-tisse-ebene", reference: "BB-MA-001", categorySlug: "sacs", priceFCFA: 18500, stock: 12, photoId: "1548036328-c9fa89d128fa", description: "Un sac de démonstration aux lignes sobres, photographié sur fond neutre.", compareAtPriceFCFA: 22000 },
  { name: "Sac à main Naya", slug: "sac-a-main-naya", reference: "BB-MA-002", categorySlug: "sacs", priceFCFA: 24000, stock: 8, photoId: "1590874103328-eac38a683ce7", description: "Un accessoire de ville présenté dans la sélection mode.", isNew: true },
  { name: "Sac bandoulière Lagon", slug: "sac-bandouliere-lagon", reference: "BB-MA-003", categorySlug: "sacs", priceFCFA: 16500, stock: 3, photoId: "1584917865442-de89df76afd3", description: "Un sac compact pour garder vos effets essentiels à portée de main." },
  { name: "Sac à dos Sè", slug: "sac-a-dos-se", reference: "BB-MA-004", categorySlug: "sacs", priceFCFA: 29500, stock: 16, photoId: "1553062407-98eeb64c6a62", description: "Un sac à dos de démonstration pour les déplacements du quotidien." },
  { name: "Baskets rouges Cotonou", slug: "baskets-rouges-cotonou", reference: "BB-MA-005", categorySlug: "chaussures", priceFCFA: 32000, stock: 10, photoId: "1542291026-7eec264c27ff", description: "Des baskets colorées présentées pour illustrer la catégorie chaussures.", isNew: true },
  { name: "Baskets en toile Dantokpa", slug: "baskets-toile-dantokpa", reference: "BB-MA-006", categorySlug: "chaussures", priceFCFA: 21500, stock: 6, photoId: "1525966222134-fcfa99b8ae77", description: "Une paire en toile au style décontracté, donnée de démonstration." },
  { name: "Sandales Kora", slug: "sandales-kora", reference: "BB-MA-007", categorySlug: "chaussures", priceFCFA: 14500, stock: 13, photoId: "1543163521-1bf539c55dd2", description: "Des sandales présentées dans la sélection mode et accessoires." },
  { name: "Chemise coton Djougou", slug: "chemise-coton-djougou", reference: "BB-MA-008", categorySlug: "chaussures", priceFCFA: 19500, stock: 9, photoId: "1551488831-00ddcb6c6bd3", description: "Une pièce vestimentaire de démonstration pour compléter le catalogue." },

  { name: "Fauteuil Akpakpa", slug: "fauteuil-akpakpa", reference: "BB-MD-001", categorySlug: "mobilier", priceFCFA: 98500, stock: 5, photoId: "1503602642458-232111445657", description: "Un fauteuil présenté dans une mise en scène claire et lumineuse.", isNew: true },
  { name: "Canapé compact Zinsou", slug: "canape-compact-zinsou", reference: "BB-MD-002", categorySlug: "mobilier", priceFCFA: 285000, stock: 2, photoId: "1555041469-a586c61ea9bc", description: "Un canapé de démonstration pour illustrer la sélection maison." },
  { name: "Bureau compact Ganvié", slug: "bureau-compact-ganvie", reference: "BB-MD-003", categorySlug: "mobilier", priceFCFA: 76500, stock: 7, photoId: "1524758631624-e2822e304c36", description: "Un espace de travail sobre pour la maison ou un petit bureau." },
  { name: "Fauteuil d’appoint Porto-Novo", slug: "fauteuil-appoint-porto-novo", reference: "BB-MD-004", categorySlug: "mobilier", priceFCFA: 62500, stock: 11, photoId: "1505693416388-ac5ce068fe85", description: "Une assise d’appoint dans une ambiance intérieure chaleureuse." },
  { name: "Lampe Sèmè", slug: "lampe-seme", reference: "BB-MD-005", categorySlug: "decoration", priceFCFA: 34000, stock: 9, photoId: "1600210492486-724fe5c67fb0", description: "Une lampe décorative présentée dans une composition de démonstration.", compareAtPriceFCFA: 39000 },
  { name: "Suspension Ouémé", slug: "suspension-oueme", reference: "BB-MD-006", categorySlug: "decoration", priceFCFA: 42000, stock: 8, photoId: "1556911220-bff31c812dba", description: "Un luminaire de démonstration pour une pièce à vivre." },
  { name: "Coussin tissé Tori", slug: "coussin-tisse-tori", reference: "BB-MD-007", categorySlug: "decoration", priceFCFA: 12500, stock: 20, photoId: "1586023492125-27b2c045efd7", description: "Un élément textile décoratif présenté dans la sélection maison." },
  { name: "Vase de table Aplahoué", slug: "vase-table-aplahoue", reference: "BB-MD-008", categorySlug: "decoration", priceFCFA: 9800, stock: 15, photoId: "1494438639946-1ebd1d20bf85", description: "Un objet de décoration de démonstration pour les étagères et les tables." },

  { name: "Sérum visage Adja", slug: "serum-visage-adja", reference: "BB-BS-001", categorySlug: "soin-visage", priceFCFA: 12500, stock: 13, photoId: "1556228720-195a672e8a03", description: "Un soin visage présenté dans la sélection beauté de démonstration." },
  { name: "Crème hydratante Sô-Ava", slug: "creme-hydratante-so-ava", reference: "BB-BS-002", categorySlug: "soin-visage", priceFCFA: 8900, stock: 17, photoId: "1556229010-6c3f2c9ca5f8", description: "Une crème de soin illustrant les fiches produits de la catégorie beauté." },
  { name: "Nettoyant doux Mono", slug: "nettoyant-doux-mono", reference: "BB-BS-003", categorySlug: "soin-visage", priceFCFA: 7500, stock: 6, photoId: "1556228578-0d85b1a4d571", description: "Un produit de soin de démonstration au format quotidien.", isNew: true },
  { name: "Huile de soin Kpassè", slug: "huile-soin-kpasse", reference: "BB-BS-004", categorySlug: "soin-visage", priceFCFA: 10500, stock: 12, photoId: "1608248543803-ba4f8c70ae0b", description: "Une huile de soin présentée dans la sélection de démonstration." },
  { name: "Eau de parfum Éclat", slug: "eau-de-parfum-eclat", reference: "BB-BS-005", categorySlug: "parfums", priceFCFA: 28500, stock: 8, photoId: "1598440947619-2c35fc9aa908", description: "Un parfum de démonstration présenté dans un univers épuré." },
  { name: "Parfum Ambre Atlantique", slug: "parfum-ambre-atlantique", reference: "BB-BS-006", categorySlug: "parfums", priceFCFA: 34500, stock: 4, photoId: "1585386959984-a4155224a1ad", description: "Une fragrance de démonstration pour illustrer la gamme parfumerie." },
  { name: "Brume parfumée Cotonou", slug: "brume-parfumee-cotonou", reference: "BB-BS-007", categorySlug: "parfums", priceFCFA: 14500, stock: 19, photoId: "1594035910387-fea47794261f", description: "Une brume parfumée présentée dans la sélection beauté." },
  { name: "Soin quotidien Dassa", slug: "soin-quotidien-dassa", reference: "BB-BS-008", categorySlug: "parfums", priceFCFA: 9900, stock: 10, photoId: "1571781926291-c477ebfd024b", description: "Un soin de démonstration pour compléter une routine quotidienne." },

  { name: "Blender compact Ifè", slug: "blender-compact-ife", reference: "BB-CU-001", categorySlug: "preparation", priceFCFA: 29500, stock: 11, photoId: "1556911220-e15b29be8c8f", description: "Un appareil de préparation présenté dans la sélection cuisine." },
  { name: "Moulin à café Ouidah", slug: "moulin-cafe-ouidah", reference: "BB-CU-002", categorySlug: "preparation", priceFCFA: 18500, stock: 7, photoId: "1495474472287-4d71bcdd2085", description: "Un moulin de démonstration pour les amateurs de café." },
  { name: "Bouteille isotherme Zè", slug: "bouteille-isotherme-ze", reference: "BB-CU-003", categorySlug: "preparation", priceFCFA: 9500, stock: 16, photoId: "1586201375761-83865001e31c", description: "Une bouteille réutilisable présentée dans la gamme cuisine." },
  { name: "Kit de préparation Savè", slug: "kit-preparation-save", reference: "BB-CU-004", categorySlug: "preparation", priceFCFA: 22500, stock: 3, photoId: "1528825871115-3581a5387919", description: "Un ensemble de démonstration pour les préparations du quotidien." },
  { name: "Poêle familiale Bohicon", slug: "poele-familiale-bohicon", reference: "BB-CU-005", categorySlug: "art-table", priceFCFA: 15500, stock: 14, photoId: "1556909114-f6e7ad7d3136", description: "Un ustensile présenté dans la sélection des indispensables de cuisine." },
  { name: "Service de table Savalou", slug: "service-table-savalou", reference: "BB-CU-006", categorySlug: "art-table", priceFCFA: 26500, stock: 9, photoId: "1570197788417-0e82375c9371", description: "Un service de démonstration pour la table familiale." },
  { name: "Boîte de conservation Nikki", slug: "boite-conservation-nikki", reference: "BB-CU-007", categorySlug: "art-table", priceFCFA: 7800, stock: 24, photoId: "1615874959474-d609969a20ed", description: "Une boîte de rangement présentée parmi les accessoires de cuisine." },
  { name: "Théière en verre Djougou", slug: "theiere-verre-djougou", reference: "BB-CU-008", categorySlug: "art-table", priceFCFA: 13200, stock: 12, photoId: "1573867639040-6dd25fa5f597", description: "Une théière de démonstration pour les moments de partage." },

  { name: "Montre Néré", slug: "montre-nere", reference: "BB-BM-001", categorySlug: "montres", priceFCFA: 38500, stock: 10, photoId: "1523275335684-37898b6baf30", description: "Une montre présentée dans la sélection accessoires.", isNew: true },
  { name: "Montre connectée Kandi", slug: "montre-connectee-kandi", reference: "BB-BM-002", categorySlug: "montres", priceFCFA: 52000, stock: 8, photoId: "1546868871-7041f2a55e12", description: "Une montre connectée de démonstration pour le catalogue high-tech." },
  { name: "Boucles d’oreilles Agoué", slug: "boucles-oreilles-agoue", reference: "BB-BM-003", categorySlug: "bijoux", priceFCFA: 12500, stock: 5, photoId: "1535632066927-ab7c9ab60908", description: "Une paire de boucles d’oreilles présentée dans la sélection bijoux." },
  { name: "Collier perles Ganvié", slug: "collier-perles-ganvie", reference: "BB-BM-004", categorySlug: "bijoux", priceFCFA: 17800, stock: 7, photoId: "1611652022419-a9419f74343d", description: "Un collier de démonstration pour illustrer les accessoires." },
  { name: "Bracelet fin Abomey", slug: "bracelet-fin-abomey", reference: "BB-BM-005", categorySlug: "bijoux", priceFCFA: 9800, stock: 18, photoId: "1605100804763-247f67b3557e", description: "Un bracelet présenté dans la sélection de bijoux." },
  { name: "Collier doré Ségbana", slug: "collier-dore-segbana", reference: "BB-BM-006", categorySlug: "bijoux", priceFCFA: 22000, stock: 9, photoId: "1599643478518-a784e5dc4c8f", description: "Un collier de démonstration aux lignes délicates." },
  { name: "Lunettes de soleil Zagnanado", slug: "lunettes-soleil-zagnanado", reference: "BB-BM-007", categorySlug: "bijoux", priceFCFA: 14500, stock: 0, photoId: "1572635196237-14b3f281503f", description: "Une paire de lunettes de démonstration actuellement épuisée." },
  { name: "Gourde nomade Karimama", slug: "gourde-nomade-karimama", reference: "BB-BM-008", categorySlug: "bijoux", priceFCFA: 8900, stock: 2, photoId: "1602143407151-7111542de6e8", description: "Une gourde réutilisable de démonstration, avec un stock faible." },
];

export const demoProducts: Product[] = seeds.map((seed, index) => {
  const category = categoryFor.get(seed.categorySlug);
  if (!category) throw new Error(`Missing demo category: ${seed.categorySlug}`);

  return {
    id: uuid(1001 + index),
    slug: seed.slug,
    reference: seed.reference,
    name: seed.name,
    shortDescription: seed.description,
    description: `${seed.description} Les caractéristiques, le prix et le stock de cette fiche sont des données de démonstration.`,
    priceFCFA: seed.priceFCFA,
    compareAtPriceFCFA: seed.compareAtPriceFCFA ?? null,
    stock: seed.stock,
    available: seed.stock > 0,
    isNew: seed.isNew ?? false,
    popularity: ((index * 17 + 13) % seeds.length) * 3,
    category,
    images: [
      {
        url: imageUrl(seed.photoId),
        alt: `Photo de démonstration : ${seed.name}`,
        isPrimary: true,
      },
    ],
    attributes: [],
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
  };
});

export const unsplashDemoImageLicense =
  "https://unsplash.com/license";
