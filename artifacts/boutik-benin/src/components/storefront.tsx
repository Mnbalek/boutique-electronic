import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import {
  useGetHome, useGetCategories, useGetProducts, useGetProduct, useGetCurrentUser,
  useGetCart, useSetCartItem, useRemoveCartItem, useClearCart, useMergeCart,
  useRegister, useLogin, useLogout, useRequestPasswordReset, useResetPassword,
  useGetProfile, useUpdateProfile, useAnonymizeAccount, useGetAddresses,
  useCreateAddress, useUpdateAddress, useDeleteAddress, useGetDepartments,
  useGetCommunes, usePreviewCheckout, useGetOrders, useCreateOrder, useGetOrder,
  useCancelPendingOrder, useRequestOrderCancellation, useRetryOrderPayment,
  useGetOrderPaymentStatus, useGetOrderReceipt, useGetNotifications, useGetPaymentConfig, useVerifyPayment,
  useMarkNotificationRead, useMarkAllNotificationsRead, useGetUnreadNotificationCount,
  getGetCartQueryKey, getGetCurrentUserQueryKey, getGetProfileQueryKey,
  getGetAddressesQueryKey, getGetOrderPaymentStatusQueryKey, getGetNotificationsQueryKey, getGetPaymentConfigQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from '@workspace/api-client-react';
import type { Product, GetProductsParams, Address, Order, CartResponse } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleHelp, Heart, LockKeyhole,
  Menu, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Truck, UserRound, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AdminPage from '@/components/admin';
import { openKkiapayPayment } from '@/lib/kkiapay';

const money = (n?: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n || 0)} FCFA`;
const localDate = (date?: string) => date ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Africa/Porto-Novo' }).format(new Date(date)) : '—';
const normalizeBeninPhone = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('229')) digits = digits.slice(3);
  if (digits.length === 8) digits = '01' + digits;
  return /^01\d{8}$/.test(digits) ? '+229' + digits : null;
};
type GuestCartItem = { productId: string; quantity: number; lastSeenPriceFCFA: number };
type GuestCart = Record<string, GuestCartItem>;
const readGuest = (): GuestCart => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('boutik-panier-invite') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return [[key, { productId: key, quantity: Math.max(1, Math.floor(value)), lastSeenPriceFCFA: 1 }]];
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const item = value as Partial<GuestCartItem>;
      if (typeof item.productId !== 'string' || typeof item.quantity !== 'number') return [];
      return [[key, {
        productId: item.productId,
        quantity: Math.max(1, Math.floor(item.quantity)),
        lastSeenPriceFCFA: typeof item.lastSeenPriceFCFA === 'number' ? item.lastSeenPriceFCFA : 1,
      }]];
    })) as GuestCart;
  } catch { return {}; }
};
const saveGuest = (data: GuestCart) => localStorage.setItem('boutik-panier-invite', JSON.stringify(data));

type CartLine = CartResponse['data']['items'][number];
const emptyCart: CartResponse = { data: { items: [], subtotalFCFA: 0, itemCount: 0, hasChanges: false } };

function makeCartResponse(items: CartLine[]): CartResponse {
  return { data: {
    items,
    subtotalFCFA: items.reduce((sum, line) => sum + line.lineTotalFCFA, 0),
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    hasChanges: items.some((line) => line.priceChanged || !line.product.available || line.quantity > line.product.stock),
  } };
}

function optimisticallySetCartLine(current: CartResponse | undefined, product: Product, quantity: number): CartResponse {
  const items = current?.data.items ?? [];
  const line: CartLine = {
    productId: product.id,
    product,
    quantity,
    previousPriceFCFA: null,
    priceChanged: false,
    lineTotalFCFA: product.priceFCFA * quantity,
  };
  const index = items.findIndex((item) => item.productId === product.id);
  const nextItems = index < 0 ? [...items, line] : items.map((item, itemIndex) => itemIndex === index ? line : item);
  return makeCartResponse(nextItems);
}

function optimisticallyRemoveCartLine(current: CartResponse | undefined, productId: string): CartResponse {
  return makeCartResponse((current?.data.items ?? []).filter((item) => item.productId !== productId));
}

function Retry({ onClick }: { onClick: () => void }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900" data-testid="status-error"><p className="font-semibold">Le contenu n’a pas pu être chargé.</p><p className="mt-1 text-red-800">Vérifiez votre connexion et réessayez.</p><button onClick={onClick} className="btn btn-sm btn-outline mt-3" data-testid="button-retry">Réessayer</button></div>;
}
function Loading({ lines = 3 }: { lines?: number }) {
  return <div aria-label="Chargement" className="space-y-3" data-testid="status-loading">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div>;
}
function Empty({ title, text, href = '/produits', action = 'Voir les produits' }: { title: string; text: string; href?: string; action?: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center" data-testid="state-empty"><Package className="mx-auto mb-3 text-primary" /><h2 className="font-display text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{text}</p><Link href={href} className="btn btn-primary mt-5" data-testid="link-empty-action">{action}</Link></div>;
}
function ProductCard({ product, add }: { product: Product; add: (p: Product) => void }) {
  const image = product.images?.[0];
  return <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid={`card-product-${product.id}`}>
    <Link href={`/produits/${product.slug}`} className="product-art product-card-art block" data-testid={`link-product-${product.id}`}>
      {image ? <img src={image.url} srcSet={`${image.url} 1x`} alt={image.alt || product.name} loading="lazy" data-testid={`img-product-${product.id}`} /> : <div className="grid h-full place-items-center text-slate-500">Image indisponible</div>}
    </Link>
    <div className="flex flex-1 flex-col p-3 sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{product.category?.name}</p>
      <Link href={`/produits/${product.slug}`} className="mt-1 line-clamp-2 min-h-10 block font-display font-semibold leading-5 text-slate-900 hover:text-primary" data-testid={`link-title-${product.id}`}>{product.name}</Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-lg font-bold text-primary" data-testid={`text-price-${product.id}`}>{money(product.priceFCFA)}</p>
        {product.compareAtPriceFCFA && product.compareAtPriceFCFA > product.priceFCFA && <del className="text-xs text-slate-600" data-testid={`text-original-price-${product.id}`}>{money(product.compareAtPriceFCFA)}</del>}
      </div>
      <p className={`mt-1 text-xs ${product.available ? 'text-emerald-800' : 'text-red-800'}`} data-testid={`status-stock-${product.id}`}>{product.available ? 'Disponible' : 'Épuisé'}</p>
      <button disabled={!product.available || product.stock < 1} aria-label={product.available ? `Ajouter ${product.name} au panier` : `${product.name} est épuisé`} onClick={() => add(product)} className="btn btn-primary btn-sm mt-auto min-h-9 w-full flex-nowrap gap-1.5 whitespace-nowrap px-2 text-xs sm:text-sm" data-testid={`button-add-${product.id}`}><ShoppingCart size={15} /><span className="hidden sm:inline">{product.available ? 'Ajouter au panier' : 'Épuisé'}</span><span className="sm:hidden">{product.available ? 'Ajouter' : 'Épuisé'}</span></button>
    </div>
  </article>;
}
function ProductGrid({ products, add }: { products: Product[]; add: (p: Product) => void }) {
  if (!products.length) return <Empty title="Aucun article trouvé" text="Modifiez vos critères ou explorez tous les articles disponibles." />;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5" data-testid="grid-products">{products.map(p => <ProductCard key={p.id} product={p} add={add} />)}</div>;
}

function StoreShell({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const cart = useGetCart({ query: { enabled: !!user.data?.data, queryKey: getGetCartQueryKey() } });
  const count = cart.data?.data?.itemCount ?? Object.values(readGuest()).reduce((total, item) => total + item.quantity, 0);
  const unread = useGetUnreadNotificationCount({ query: { enabled: !!user.data?.data, queryKey: getGetUnreadNotificationCountQueryKey() } });
  return <div className="min-h-[100dvh] overflow-x-clip">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-[#F8FAFC]/95 backdrop-blur">
      <div className="showcase-shell flex min-h-[68px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" data-testid="link-brand-home"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-accent"><ShoppingBag size={19}/></span><span className="leading-tight"><b className="font-display block text-base tracking-tight">boutik<span className="text-primary">.</span></b><small className="block text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">Bénin</small></span></Link>
        <form action="/produits" className="hidden min-w-0 flex-1 md:block"><label className="sr-only" htmlFor="header-search">Rechercher un article</label><div className="relative mx-auto max-w-xl"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input id="header-search" name="q" placeholder="Que recherchez-vous ?" className="input input-bordered w-full pl-10" data-testid="input-header-search"/></div></form>
        <nav className={`${menu ? 'absolute left-0 right-0 top-full flex flex-col border-b bg-white p-4 shadow-lg' : 'hidden'} md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:shadow-none`} aria-label="Navigation principale">
          <Link href="/produits" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-emerald-50" data-testid="link-shop">Boutique</Link>
          <Link href={user.data?.data ? '/compte' : '/connexion'} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-emerald-50" data-testid="link-account">{user.data?.data ? 'Mon compte' : 'Connexion'}</Link>
          {user.data?.data?.role==='admin'&&<Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-emerald-50" data-testid="link-admin">Administration</Link>}
          {user.data?.data && <Link href="/compte/notifications" className="relative rounded-lg px-3 py-2 text-sm font-semibold hover:bg-emerald-50" data-testid="link-notifications"><Bell size={17} className="inline"/> Notifications{(unread.data?.data?.count || 0) > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs">{unread.data?.data?.count}</span>}</Link>}
        </nav>
        <Link href="/panier" className="relative ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white" aria-label="Ouvrir le panier" data-testid="link-cart"><ShoppingCart size={19}/><span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-[10px] font-bold" data-testid="text-cart-count">{count}</span></Link>
        <button className="btn btn-ghost btn-square md:hidden" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setMenu(!menu)} data-testid="button-mobile-menu">{menu ? <X/> : <Menu/>}</button>
      </div>
      <div className="px-4 pb-3 md:hidden"><form action="/produits" className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input name="q" placeholder="Rechercher un article" className="input input-bordered input-sm w-full pl-10" data-testid="input-mobile-search"/></form></div>
    </header>
    <main className="showcase-shell min-h-[65vh] px-4 py-6 sm:px-6 sm:py-9">{children}</main>
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="showcase-shell grid gap-8 px-4 py-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        <div><Link href="/" className="font-display text-lg font-bold" data-testid="link-footer-home">boutik<span className="text-primary">.</span></Link><p className="mt-2 text-sm text-slate-600">Une boutique en ligne conçue pour vos achats au Bénin.</p></div>
        <div><h2 className="font-semibold">Informations</h2><div className="mt-3 flex flex-col gap-2 text-sm text-slate-600"><Link href="/cgv" data-testid="link-cgv">Conditions générales</Link><Link href="/mentions-legales" data-testid="link-legal">Mentions légales</Link><Link href="/confidentialite" data-testid="link-privacy">Confidentialité</Link><Link href="/retours" data-testid="link-returns">Retours</Link></div></div>
        <div><h2 className="font-semibold">Votre espace</h2><div className="mt-3 flex flex-col gap-2 text-sm text-slate-600"><Link href="/compte/commandes" data-testid="link-orders">Mes commandes</Link><Link href="/compte/adresses" data-testid="link-addresses">Mes adresses</Link><Link href="/contact" data-testid="link-contact">Nous contacter</Link></div></div>
      </div>
    </footer>
  </div>;
}

function HomePage({ add }: { add: (p: Product) => void }) {
  const q = useGetHome();
  if (q.isLoading) return <Loading lines={6}/>;
  if (q.isError) return <Retry onClick={() => void q.refetch()}/>;
  const d = q.data?.data;
  if (!d) return <Empty title="La boutique se prépare" text="Aucun contenu n’est disponible pour le moment." />;
  return <div data-testid="page-home">
    <section className="relative mb-10 overflow-hidden rounded-2xl bg-primary text-white">
      <img className="absolute inset-0 h-full w-full object-cover opacity-35" src={d.banner.imageUrl} alt={d.banner.imageAlt} fetchPriority="high" data-testid="img-home-banner"/>
      <div className="relative grid min-h-[330px] content-center gap-6 p-6 sm:min-h-[400px] sm:p-12 lg:max-w-3xl">
        <h1 className="font-display text-4xl font-bold leading-tight tracking-[-.05em] sm:text-6xl" data-testid="text-home-title">{d.banner.title}</h1>
        <p className="max-w-xl text-base leading-7 text-white/90 sm:text-lg">{d.banner.subtitle}</p>
        <Link href={d.banner.actionUrl || '/produits'} className="btn btn-accent w-fit" data-testid="link-home-cta">{d.banner.actionLabel || 'Voir les produits'} <ArrowRight size={17}/></Link>
      </div>
    </section>
    {d.featuredCategories?.length > 0 && <section className="mb-12"><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Parcourir</p><h2 className="font-display text-2xl font-semibold">Nos catégories</h2></div><Link href="/produits" className="text-sm font-semibold text-primary" data-testid="link-all-categories">Tout voir</Link></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{d.featuredCategories.map(c=><Link href={`/categories/${c.slug}`} key={c.id} className="relative flex min-h-32 items-end overflow-hidden rounded-xl bg-emerald-100 p-4 text-white" data-testid={`link-category-${c.id}`}>{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover"/>}<span className="absolute inset-0 bg-gradient-to-t from-slate-950/75 to-transparent"/><span className="relative font-display font-semibold">{c.name}</span></Link>)}</div></section>}
    {d.promotions?.length > 0 && <section className="mb-12"><div className="mb-4"><p className="eyebrow">Sélection du moment</p><h2 className="font-display text-2xl font-semibold">Promotions actives</h2></div><div className="grid gap-3 sm:grid-cols-2">{d.promotions.map(p=><article key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 p-5" data-testid={`card-promotion-${p.id}`}><h3 className="font-display text-lg font-semibold">{p.title}</h3><p className="mt-1 text-sm text-slate-700">{p.description}</p>{p.code && <p className="mt-3 font-mono text-sm font-bold">Code : {p.code}</p>}</article>)}</div></section>}
    {[['Nouveautés',d.newProducts],['Les plus appréciés',d.popularProducts]].map(([title,items])=><section className="mb-12" key={title as string}><div className="mb-4 flex items-end justify-between"><h2 className="font-display text-2xl font-semibold">{title as string}</h2><Link href="/produits" className="text-sm font-semibold text-primary" data-testid={`link-more-${String(title).toLowerCase().replaceAll(' ','-')}`}>Voir tout <ArrowRight className="inline" size={15}/></Link></div><ProductGrid products={items as Product[]} add={add}/></section>)}
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 sm:grid-cols-3 sm:p-5">
      {[['Choix clair','Des informations utiles sur chaque article.'],['Livraison indiquée','Les frais sont présentés avant validation.'],['Achat accompagné','Retrouvez vos commandes dans votre compte.']].map(([a,b])=><div key={a} className="flex gap-3"><ShieldCheck className="shrink-0 text-primary"/><div><p className="text-sm font-semibold">{a}</p><p className="text-xs text-slate-600">{b}</p></div></div>)}
    </div>
  </div>;
}

function ProductsPage({ add, categorySlug }: { add: (p: Product) => void; categorySlug?: string }) {
  const [loc, setLoc] = useLocation();
  const [queryString, setQueryString] = useState(() => window.location.search);
  const params = new URLSearchParams(queryString);
  const [search, setSearch] = useState(() => params.get('q') || '');
  useEffect(() => {
    const syncQuery = () => {
      const nextQuery = window.location.search;
      setQueryString(nextQuery);
      setSearch(new URLSearchParams(nextQuery).get('q') || '');
    };
    window.addEventListener('popstate', syncQuery);
    return () => window.removeEventListener('popstate', syncQuery);
  }, []);
  useEffect(() => {
    const nextQuery = window.location.search;
    setQueryString(nextQuery);
    setSearch(new URLSearchParams(nextQuery).get('q') || '');
  }, [categorySlug]);
  const apiParams: GetProductsParams = {
    q: params.get('q') || undefined, categorie: categorySlug || params.get('categorie') || undefined,
    prix_min: params.has('prix_min') ? Number(params.get('prix_min')) : undefined,
    prix_max: params.has('prix_max') ? Number(params.get('prix_max')) : undefined,
    disponible: params.get('disponible') === 'true' ? true : undefined,
    tri: (params.get('tri') as GetProductsParams['tri']) || 'pertinence',
    page: Math.max(1, Number(params.get('page') || 1)), taille: 24,
  };
  const query = useGetProducts(apiParams);
  const categories = useGetCategories();
  const setParam = (key: string, value: string) => { const n = new URLSearchParams(queryString); value ? n.set(key, value) : n.delete(key); n.delete('page'); const nextQuery = n.toString(); setQueryString(nextQuery ? `?${nextQuery}` : ''); setLoc(`${categorySlug ? `/categories/${categorySlug}` : '/produits'}${nextQuery ? `?${nextQuery}` : ''}`); };
  const submit = (e: FormEvent) => { e.preventDefault(); setParam('q', search.trim()); };
  const meta = query.data?.meta;
  return <div data-testid="page-products">
    <div className="mb-6"><p className="eyebrow">{categorySlug ? 'Catégorie' : 'La boutique'}</p><h1 className="font-display text-3xl font-semibold tracking-tight">{categorySlug ? categories.data?.data?.flatMap(x => [x.category,...x.children]).find(x => x.slug === categorySlug)?.name || 'Catégorie' : 'Tous les produits'}</h1><p className="mt-2 text-sm text-slate-600">Découvrez notre sélection et trouvez l’article qui vous correspond.</p></div>
    <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_190px_190px]">
      <form onSubmit={submit} className="relative"><label htmlFor="products-search" className="sr-only">Rechercher</label><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input id="products-search" value={search} onChange={e=>setSearch(e.target.value)} className="input input-bordered w-full pl-10" placeholder="Rechercher un article" data-testid="input-products-search"/></form>
      <label className="text-xs font-semibold">Catégorie<select value={params.get('categorie') || ''} onChange={e=>setParam('categorie',e.target.value)} className="select select-bordered mt-1 w-full" data-testid="select-category"><option value="">Toutes</option>{categories.data?.data?.flatMap(x=>[x.category,...x.children]).map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
      <label className="text-xs font-semibold">Trier par<select value={params.get('tri') || 'pertinence'} onChange={e=>setParam('tri',e.target.value)} className="select select-bordered mt-1 w-full" data-testid="select-sort"><option value="pertinence">Pertinence</option><option value="prix_croissant">Prix croissant</option><option value="prix_decroissant">Prix décroissant</option><option value="nouveaute">Nouveautés</option><option value="popularite">Popularité</option></select></label>
      <label className="text-xs font-semibold">Prix minimum<input type="number" min="0" value={params.get('prix_min') || ''} onChange={e=>setParam('prix_min',e.target.value)} className="input input-bordered mt-1 w-full" data-testid="input-price-min"/></label>
      <label className="text-xs font-semibold">Prix maximum<input type="number" min="0" value={params.get('prix_max') || ''} onChange={e=>setParam('prix_max',e.target.value)} className="input input-bordered mt-1 w-full" data-testid="input-price-max"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={params.get('disponible') === 'true'} onChange={e=>setParam('disponible',e.target.checked?'true':'')} className="checkbox checkbox-primary checkbox-sm" data-testid="checkbox-available"/>Disponibles uniquement</label>
    </div>
    {query.isLoading ? <Loading lines={8}/> : query.isError ? <Retry onClick={()=>void query.refetch()}/> : <>
      <div className="mb-4 text-sm text-slate-600" data-testid="text-results-count">{meta?.total ?? query.data?.data?.length ?? 0} article(s)</div><ProductGrid products={query.data?.data || []} add={add}/>
      {(meta?.total || 0) > (meta?.taille || 24) && <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Pagination"><button disabled={apiParams.page! <= 1} className="btn btn-outline btn-sm" onClick={()=>setParam('page',String(apiParams.page!-1))} data-testid="button-page-previous">Précédent</button><span data-testid="text-current-page">Page {meta?.page} / {Math.ceil((meta?.total||0)/(meta?.taille||24))}</span><button disabled={apiParams.page! >= Math.ceil((meta?.total||0)/(meta?.taille||24))} className="btn btn-outline btn-sm" onClick={()=>setParam('page',String(apiParams.page!+1))} data-testid="button-page-next">Suivant</button></nav>}
    </>}
  </div>;
}

function ProductPage({ add }: { add: (p: Product, quantity?: number) => void }) {
  const { slug = '' } = useParams<{slug:string}>();
  const q = useGetProduct(slug);
  const [imageIndex,setImageIndex]=useState(0);
  const [quantity,setQuantity]=useState(1);
  useEffect(()=>{setImageIndex(0);setQuantity(1);},[slug]);
  if(q.isLoading)return <Loading lines={5}/>;
  if(q.isError)return <Retry onClick={()=>void q.refetch()}/>;
  const p=q.data?.data;
  if(!p)return <Empty title="Article introuvable" text="Cet article n’est plus accessible." />;
  const image=p.images?.[imageIndex];
  const maxQuantity=Math.min(10,p.stock);
  return <div data-testid="page-product">
    <Link href="/produits" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary" data-testid="link-back-products"><ArrowLeft size={16}/> Tous les produits</Link>
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <div className="product-art product-detail-art overflow-hidden rounded-xl bg-white">
          {image?<img src={image.url} alt={image.alt||p.name} fetchPriority="high" data-testid="img-product-detail"/>:<div className="grid h-full place-items-center text-slate-500">Image indisponible</div>}
        </div>
        {p.images?.length>1&&<div className="mt-3 flex gap-2">{p.images.map((im,i)=><button key={im.url} onClick={()=>setImageIndex(i)} className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i===imageIndex?'border-primary':'border-slate-200'}`} aria-label={`Afficher l’image ${i+1}`} data-testid={`button-image-${i}`}><img src={im.url} alt={im.alt||''} className="h-full w-full object-cover"/></button>)}</div>}
      </div>
      <section>
        <p className="eyebrow">{p.category.name}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight" data-testid="text-product-name">{p.name}</h1>
        <div className="mt-4 flex flex-wrap items-baseline gap-2">
          <p className="text-2xl font-bold text-primary" data-testid="text-product-price">{money(p.priceFCFA)}</p>
          {p.compareAtPriceFCFA&&p.compareAtPriceFCFA>p.priceFCFA&&<del className="text-sm text-slate-600" data-testid="text-product-original-price">{money(p.compareAtPriceFCFA)}</del>}
        </div>
        <p className={`mt-2 text-sm font-semibold ${p.available?'text-emerald-800':'text-red-800'}`} data-testid="status-product-availability">{p.available?`Disponible · ${p.stock} en stock`:'Épuisé'}</p>
        <p className="mt-5 leading-7 text-slate-700">{p.description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="form-label w-full sm:max-w-32">Quantité
            <select value={quantity} onChange={e=>setQuantity(Number(e.target.value))} disabled={!p.available||maxQuantity<1} className="select select-bordered mt-1 w-full" data-testid="select-product-quantity">
              {Array.from({length:Math.max(1,maxQuantity)},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
          </label>
          <button disabled={!p.available||maxQuantity<1} onClick={()=>add(p,quantity)} className="btn btn-primary w-full sm:w-auto" data-testid="button-add-product"><ShoppingCart size={17}/>{p.available?'Ajouter au panier':'Épuisé'}</button>
        </div>
         <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm"><p className="flex gap-2"><Truck size={17} className="shrink-0 text-primary"/>Les options et frais de livraison sont indiqués avant la validation de la commande.</p></div>
        {p.attributes?.length>0&&<div className="mt-8"><h2 className="font-display text-lg font-semibold">Caractéristiques</h2><dl className="mt-3 divide-y">{p.attributes.map(a=><div key={a.name} className="flex justify-between py-2 text-sm"><dt className="text-slate-600">{a.name}</dt><dd className="font-medium">{a.value}</dd></div>)}</dl></div>}
      </section>
    </div>
  </div>;
}

function AuthPage({ mode }: { mode: 'login'|'register'|'forgot'|'reset' }) {
  const [,setLocation]=useLocation();
  const queryClient=useQueryClient();
  const reg=useRegister(); const login=useLogin();
  const forgot=useRequestPasswordReset(); const reset=useResetPassword();
  const {jeton=''}=useParams<{jeton:string}>();
  const [error,setError]=useState(''); const [success,setSuccess]=useState('');
  const [form,setForm]=useState({firstName:'',lastName:'',email:'',phone:'',password:'',confirm:''});
  const title={login:'Heureux de vous revoir',register:'Créer votre compte',forgot:'Mot de passe oublié',reset:'Choisir un nouveau mot de passe'}[mode];
  const submit=(e:FormEvent)=>{e.preventDefault();setError('');setSuccess('');
    if(mode==='register'||mode==='login'){
      if(mode==='register'&&form.password!==form.confirm){setError('Les mots de passe ne correspondent pas.');return;}
      const mutation=mode==='register'?reg:login;
      const phone=normalizeBeninPhone(form.phone);
      if(mode==='register'&&!phone){setError('Saisissez un numéro béninois à 10 chiffres (01 suivi de 8 chiffres), ou un ancien numéro à 8 chiffres.');return;}
      const data=mode==='register'?{email:form.email,password:form.password,firstName:form.firstName,lastName:form.lastName,phone}:{email:form.email,password:form.password};
      mutation.mutate({data} as never,{onSuccess:(result)=>{queryClient.setQueryData(getGetCurrentUserQueryKey(),result);setLocation('/compte');},onError:(err)=>setError((err as Error).message||'Vérifiez les informations saisies.')});
    } else if(mode==='forgot') forgot.mutate({data:{email:form.email}},{onSuccess:()=>setSuccess('Si cette adresse correspond à un compte, une instruction de réinitialisation est disponible pour le moment.'),onError:()=>setError('La demande n’a pas pu être traitée. Réessayez.')});
    else reset.mutate({data:{token:jeton,password:form.password}},{onSuccess:()=>{setSuccess('Le mot de passe a été mis à jour.');setTimeout(()=>setLocation('/connexion'),1200);},onError:()=>setError('Le lien est invalide ou expiré.')});
  };
  const pending=reg.isPending||login.isPending||forgot.isPending||reset.isPending;
  return <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[.8fr_1.2fr]" data-testid={`page-${mode}`}>
    <aside className="hidden bg-primary p-8 text-white md:flex md:flex-col md:justify-between"><ShoppingBag className="text-accent" size={30}/><div><h2 className="font-display text-3xl font-semibold">Votre espace Boutik Bénin</h2><p className="mt-3 text-sm leading-6 text-white/85">Retrouvez vos commandes, vos adresses et les informations de votre compte.</p></div><Link href="/" className="text-sm font-semibold" data-testid="link-auth-home">Retour à la boutique <ArrowRight className="inline" size={15}/></Link></aside>
    <form onSubmit={submit} className="p-5 sm:p-9"><p className="eyebrow">Boutik Bénin</p><h1 className="font-display text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-slate-600">{mode==='register'?'Vos informations servent à gérer vos commandes.':mode==='login'?'Connectez-vous pour retrouver votre espace.':mode==='forgot'?'Saisissez l’adresse e-mail associée à votre compte.':'Choisissez un nouveau mot de passe pour votre compte.'}</p>
       {(mode==='register')&&<div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="form-label">Prénom<input autoComplete="given-name" required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-first-name"/></label><label className="form-label">Nom<input autoComplete="family-name" required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-last-name"/></label></div>}
       <label className="form-label mt-5 block">Adresse e-mail<input autoComplete="email" required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-email"/></label>
       {mode==='register'&&<label className="form-label mt-4 block">Téléphone<input autoComplete="tel" required type="tel" placeholder="01 90 00 00 00 ou +229 01 90 00 00 00" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value.replace(/[^\d+]/g,'')})} className="input input-bordered mt-1 w-full" data-testid="input-phone"/><span className="mt-1 block text-xs text-slate-600">Saisissez le numéro national ou international ; l’indicatif et le préfixe sont normalisés automatiquement.</span></label>}
       {(mode==='register'||mode==='login'||mode==='reset')&&<label className="form-label mt-4 block">Mot de passe<input autoComplete={mode==='login'?'current-password':'new-password'} required minLength={8} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-password"/></label>}
       {(mode==='register'||mode==='reset')&&<label className="form-label mt-4 block">Confirmer le mot de passe<input autoComplete="new-password" required minLength={8} type="password" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-password-confirm"/></label>}
      {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" data-testid="status-auth-error">{error}</p>}{success&&<p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="status-auth-success">{success}</p>}
      <button disabled={pending} className="btn btn-primary mt-6 w-full" data-testid="button-auth-submit">{pending?'Veuillez patienter…': mode==='register'?'Créer mon compte':mode==='login'?'Se connecter':mode==='forgot'?'Demander la réinitialisation':'Réinitialiser le mot de passe'}</button>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-primary">{mode!=='login'&&mode!=='register'&&<Link href="/connexion" data-testid="link-login">Connexion</Link>}{mode==='login'&&<Link href="/inscription" data-testid="link-register">Créer un compte</Link>}</div>
    </form>
  </div>;
}

function CartPage({ isGuest, setGuest }: {isGuest:boolean;setGuest:(x:GuestCart)=>void}) {
  const [,go]=useLocation(); const queryClient=useQueryClient(); const cartKey=getGetCartQueryKey();
  const cartQ=useGetCart({query:{enabled:!isGuest,queryKey:cartKey}}); const guest=readGuest();
  const syncCart=(response:CartResponse)=>queryClient.setQueryData(cartKey,response);
  const refreshCart=()=>{void queryClient.invalidateQueries({queryKey:cartKey});};
  const setItem=useSetCartItem({mutation:{scope:{id:'customer-cart'},onSuccess:syncCart,onError:refreshCart}});
  const remove=useRemoveCartItem({mutation:{scope:{id:'customer-cart'},onSuccess:syncCart,onError:refreshCart}});
  const clear=useClearCart({mutation:{scope:{id:'customer-cart'},onSuccess:syncCart,onError:refreshCart}});
  const entries=cartQ.data?.data?.items||[];
  if(!isGuest&&cartQ.isLoading)return <Loading/>;
  if(!isGuest&&cartQ.isError)return <Retry onClick={()=>void cartQ.refetch()}/>;
  if((isGuest?Object.keys(guest).length===0:entries.length===0))return <Empty title="Votre panier est vide" text="Parcourez la boutique et ajoutez les articles qui vous intéressent." />;
  const update=(id:string,q:number,price:number,stock:number,productId=id)=>{if(stock<1)return;const next=Math.max(1,Math.min(10,stock,Math.floor(q)));if(isGuest){const n={...guest,[id]:{productId,quantity:next,lastSeenPriceFCFA:price}};saveGuest(n);setGuest(n);}else{const line=cartQ.data?.data.items.find(item=>item.productId===id);if(line)queryClient.setQueryData(cartKey,(current:CartResponse|undefined)=>optimisticallySetCartLine(current,line.product,next));setItem.mutate({productId:id,data:{quantity:next,lastSeenPriceFCFA:price}} as never);}};
  const erase=(id:string)=>{if(isGuest){const n={...guest};delete n[id];saveGuest(n);setGuest(n);}else{queryClient.setQueryData(cartKey,(current:CartResponse|undefined)=>optimisticallyRemoveCartLine(current,id));remove.mutate({productId:id});}};
  const emptyCustomerCart=()=>{if(isGuest){saveGuest({});setGuest({});}else{queryClient.setQueryData(cartKey,emptyCart);clear.mutate(undefined);}};
  return <div data-testid="page-cart"><h1 className="font-display text-3xl font-semibold">Votre panier</h1><p className="mt-2 text-sm text-slate-600">{isGuest?'Panier invité enregistré sur cet appareil.':'Panier synchronisé à votre compte.'}</p>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]"><section className="space-y-3">{isGuest?Object.entries(guest).map(([slug,item])=><GuestLine key={slug} slug={slug} qty={item.quantity} onUpdate={(p,q)=>update(slug,q,p.priceFCFA,p.stock,p.id)} onRemove={()=>erase(slug)}/>):entries.map(line=><article key={line.productId} className="flex gap-4 rounded-xl border bg-white p-3 sm:p-4" data-testid={`row-cart-${line.productId}`}><img className="h-24 w-24 rounded-lg object-cover" src={line.product.images[0]?.url} alt={line.product.images[0]?.alt||line.product.name}/><div className="min-w-0 flex-1"><Link href={`/produits/${line.product.slug}`} className="font-semibold" data-testid={`link-cart-product-${line.productId}`}>{line.product.name}</Link><p className="mt-1 text-sm text-slate-600">{money(line.product.priceFCFA)} · {line.product.stock} disponible(s)</p>{line.priceChanged&&<p className="text-xs font-semibold text-amber-800">Le prix a changé : vérifiez avant de continuer.</p>}<div className="mt-2 flex items-center gap-2"><button className="btn btn-ghost btn-xs" onClick={()=>update(line.productId,line.quantity-1,line.product.priceFCFA,line.product.stock)} aria-label="Diminuer la quantité" data-testid={`button-minus-${line.productId}`}><Minus size={14}/></button><span data-testid={`text-quantity-${line.productId}`}>{line.quantity}</span><button className="btn btn-ghost btn-xs" onClick={()=>update(line.productId,line.quantity+1,line.product.priceFCFA,line.product.stock)} aria-label="Augmenter la quantité" data-testid={`button-plus-${line.productId}`}><Plus size={14}/></button><button className="ml-auto text-xs font-semibold text-red-800 underline" onClick={()=>erase(line.productId)} data-testid={`button-remove-${line.productId}`}>Retirer</button></div></div><strong className="whitespace-nowrap text-sm" data-testid={`text-line-total-${line.productId}`}>{money(line.lineTotalFCFA)}</strong></article>)}</section>
      <aside className="h-fit rounded-xl border bg-white p-5"><h2 className="font-display text-lg font-semibold">Récapitulatif</h2><p className="mt-3 flex justify-between text-sm"><span>Sous-total</span><strong>{isGuest?'Calculé à la validation':money(cartQ.data?.data?.subtotalFCFA)}</strong></p><p className="mt-3 text-xs leading-5 text-slate-600">Les montants définitifs sont fournis lors de l’aperçu de commande.</p><button className="btn btn-primary mt-5 w-full" onClick={()=>go(isGuest?'/connexion?retour=commande':'/commande')} data-testid="button-continue-checkout">Continuer</button><button className="btn btn-ghost btn-sm mt-2 w-full" onClick={emptyCustomerCart} data-testid="button-clear-cart">Vider le panier</button></aside>
    </div>
  </div>;
}
function GuestLine({slug,qty,onUpdate,onRemove}:{slug:string;qty:number;onUpdate:(p:Product,q:number)=>void;onRemove:()=>void}){
  const p=useGetProduct(slug);
  if(p.isLoading)return <Loading lines={1}/>;
  if(p.isError||!p.data?.data)return <article className="rounded-lg border bg-white p-4" data-testid={`row-guest-${slug}`}><p>Un article du panier invité n’est plus disponible.</p><button className="btn btn-sm btn-outline mt-2" onClick={onRemove} data-testid={`button-remove-${slug}`}>Retirer</button></article>;
  const prod=p.data.data;
  return <article className="flex gap-4 rounded-xl border bg-white p-3" data-testid={`row-cart-${slug}`}><img className="h-24 w-24 rounded-lg object-cover" src={prod.images[0]?.url} alt={prod.images[0]?.alt||prod.name}/><div className="flex-1"><Link href={`/produits/${prod.slug}`} className="font-semibold" data-testid={`link-guest-cart-product-${slug}`}>{prod.name}</Link><p>{money(prod.priceFCFA)}</p><div className="mt-2 flex items-center gap-2"><button className="btn btn-ghost btn-xs" aria-label="Diminuer la quantité" onClick={()=>onUpdate(prod,qty-1)} data-testid={`button-minus-${slug}`}><Minus size={14}/></button><span data-testid={`text-quantity-${slug}`}>{qty}</span><button className="btn btn-ghost btn-xs" aria-label="Augmenter la quantité" onClick={()=>onUpdate(prod,qty+1)} data-testid={`button-plus-${slug}`}><Plus size={14}/></button><button className="ml-auto text-xs text-red-800 underline" onClick={onRemove} data-testid={`button-remove-${slug}`}>Retirer</button></div></div><strong>{money(prod.priceFCFA*qty)}</strong></article>;
}

function CheckoutPage() {
  const queryClient=useQueryClient();
  const addressQ=useGetAddresses(); const preview=usePreviewCheckout();
  const paymentConfig=useGetPaymentConfig({query:{queryKey:getGetPaymentConfigQueryKey(),staleTime:60_000}});
  const profile=useGetProfile();
  const [idempotencyKey,setIdempotencyKey]=useState(()=>crypto.randomUUID());
  const order=useCreateOrder({request:{headers:{'Idempotency-Key':idempotencyKey}}});
  const pay=useRetryOrderPayment();
  const verify=useVerifyPayment();
  const [addressId,setAddress]=useState('');const [promotion,setPromotion]=useState('');const [message,setMessage]=useState('');
  const addresses=addressQ.data?.data||[];
  useEffect(()=>{if(!addressId&&addresses.length)setAddress(addresses.find(a=>a.isDefault)?.id||addresses[0].id);},[addressId,addresses]);
  const loadPreview=()=>{setMessage('');if(!addressId){setMessage('Choisissez une adresse de livraison.');return;}preview.mutate({data:{addressId,promotionCode:promotion||null}},{onError:()=>setMessage('Impossible de préparer le récapitulatif. Vérifiez votre adresse et réessayez.')});};
  const sendOrder=async()=>{setMessage('');if(!addressId){setMessage('Choisissez une adresse avant de continuer.');return;}if(paymentConfig.data?.data.mode==='sandbox'&&!paymentConfig.data.data.enabled){setMessage('Kkiapay Sandbox doit être configuré avec les clés de test avant les paiements.');return;}let createdOrderId='';let reference='';try{const created=await order.mutateAsync({data:{addressId,promotionCode:promotion||null}} as never);createdOrderId=created.data.id;reference=created.data.reference;queryClient.setQueryData(getGetCartQueryKey(),emptyCart);const attempt=await pay.mutateAsync({id:createdOrderId});if(paymentConfig.data?.data.mode==='sandbox'){const widget=paymentConfig.data.data;if(!widget.enabled||!widget.publicKey)throw new Error('Le paiement Kkiapay Sandbox n’est pas encore configuré.');const result=await openKkiapayPayment({publicKey:widget.publicKey,sandbox:true},{amount:attempt.data.amountFCFA,partnerId:attempt.data.partnerId||'',orderReference:reference,customerName:[profile.data?.data?.firstName,profile.data?.data?.lastName].filter(Boolean).join(' '),email:profile.data?.data?.email,phone:profile.data?.data?.phone});await verify.mutateAsync({data:{orderId:createdOrderId,paymentAttemptId:attempt.data.id,transactionId:result.transactionId}});window.location.assign(`/commande/${createdOrderId}/verification`);return;}window.location.assign(`/commande/${createdOrderId}/verification`);}catch(e){if(createdOrderId){if(e instanceof Error&&e.message)sessionStorage.setItem(`payment-message:${createdOrderId}`,e.message);window.location.assign(`/commande/${createdOrderId}/verification`);return;}const apiError=e as {data?:{error?:{code?:string;message?:string}}};const code=apiError.data?.error?.code||'';const msgs:Record<string,string>={STOCK_INSUFFISANT:'Un article n’est plus disponible dans la quantité demandée.',PANIER_MODIFIE:'Le panier, le prix ou le stock a changé. Actualisez le panier avant de réessayer.',PANIER_VIDE:'Votre panier est vide. Ajoutez des articles avant de commander.',COMMANDE_EN_ATTENTE:'Une commande est déjà en attente de paiement. Reprenez-la depuis vos commandes.',ZONE_NON_DESSERVIE:'Cette zone de livraison n’est pas desservie.',PROMOTION_INVALIDE:'Ce code promotionnel n’est pas valide.',CLE_IDEMPOTENCE_INVALIDE:'La demande doit être relancée. Actualisez la page puis réessayez.',DONNEES_INVALIDES:'Vérifiez l’adresse et le code promotionnel.',KKIAPAY_SANDBOX_NON_CONFIGURE:'Kkiapay Sandbox doit être configuré avec les clés de test dans Netlify.',PAIEMENT_INDISPONIBLE:'Le paiement est indisponible pour le moment.'};setMessage(msgs[code]||apiError.data?.error?.message||(e instanceof Error?e.message:'La commande n’a pas pu être créée. Vérifiez les informations puis réessayez.'));}};
  if(addressQ.isLoading)return <Loading/>;
  if(addressQ.isError)return <Retry onClick={()=>void addressQ.refetch()}/>;
  return <div className="mx-auto max-w-4xl" data-testid="page-checkout"><p className="eyebrow">Dernière étape</p><h1 className="font-display text-3xl font-semibold">Valider votre commande</h1>
    {addresses.length===0?<div className="mt-6"><Empty title="Aucune adresse enregistrée" text="Ajoutez une adresse avant de préparer votre commande." href="/compte/adresses" action="Ajouter une adresse"/></div>:<div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]"><section className="rounded-xl border bg-white p-5"><label className="form-label">Adresse de livraison<select value={addressId} onChange={e=>{setAddress(e.target.value);setIdempotencyKey(crypto.randomUUID());}} className="select select-bordered mt-2 w-full" data-testid="select-checkout-address"><option value="">Choisir une adresse</option>{addresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.communeName}{a.isDefault?' · par défaut':''}</option>)}</select></label><label className="form-label mt-5 block">Code promotionnel (facultatif)<input value={promotion} onChange={e=>{setPromotion(e.target.value);setIdempotencyKey(crypto.randomUUID());}} className="input input-bordered mt-2 w-full" data-testid="input-promotion"/></label><button className="btn btn-outline mt-4" disabled={preview.isPending} onClick={loadPreview} data-testid="button-preview-checkout">{preview.isPending?'Préparation…':'Afficher le récapitulatif'}</button>
      {preview.isError&&<p role="alert" className="mt-4 text-sm text-red-800" data-testid="status-preview-error">Impossible de charger l’aperçu. Réessayez.</p>}{preview.data?.data&&<div className="mt-5 rounded-lg bg-emerald-50 p-4" data-testid="panel-checkout-preview"><h2 className="font-semibold">Votre récapitulatif</h2>{preview.data.data.lines.map(l=><p key={l.productId} className="mt-2 flex justify-between gap-3 text-sm"><span>{l.name} × {l.quantity}</span><span>{money(l.lineTotalFCFA)}</span></p>)}<hr className="my-3 border-emerald-200"/><p className="flex justify-between text-sm"><span>Sous-total</span><span>{money(preview.data.data.subtotalFCFA)}</span></p><p className="mt-1 flex justify-between text-sm"><span>Réduction</span><span>− {money(preview.data.data.discountFCFA)}</span></p><p className="mt-1 flex justify-between text-sm"><span>Livraison</span><span>{money(preview.data.data.deliveryFCFA)}</span></p><p className="mt-3 flex justify-between border-t border-emerald-200 pt-3 font-bold"><span>Total ({preview.data.data.currency})</span><span data-testid="text-checkout-total">{money(preview.data.data.totalFCFA)}</span></p>{preview.data.data.promotionMessage&&<p className="mt-2 text-xs">{preview.data.data.promotionMessage}</p>}</div>}</section>
      <aside className="h-fit rounded-xl border bg-white p-5"><h2 className="font-display text-lg font-semibold">Paiement</h2><p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">{paymentConfig.data?.data.mode==='sandbox'?'Paiement sécurisé par Kkiapay Sandbox. Aucun débit réel ne sera effectué.':'Paiement de démonstration, sans transaction bancaire.'}</p>{paymentConfig.data?.data.mode==='sandbox'&&!paymentConfig.data.data.enabled&&<p className="mt-3 text-sm text-amber-900">Le paiement Sandbox sera disponible après la configuration des clés Kkiapay dans Netlify.</p>}{message&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900" data-testid="status-order-error">{message}</p>}<button disabled={order.isPending||pay.isPending||verify.isPending||!preview.data?.data||paymentConfig.isLoading||(paymentConfig.data?.data.mode==='sandbox'&&!paymentConfig.data.data.enabled)} className="btn btn-primary mt-5 w-full" onClick={sendOrder} data-testid="button-create-order">{order.isPending?'Création…':pay.isPending||verify.isPending?'Paiement en cours…':preview.data?.data?`Payer ${money(preview.data.data.totalFCFA)}`:'Préparer le paiement'}</button><p className="mt-3 text-xs text-slate-600">Un aperçu à jour est requis pour continuer.</p></aside>
    </div>}</div>;
}

function PaymentReturnPage(){
  const {id=''}=useParams<{id:string}>();
  const queryClient=useQueryClient();const pay=useRetryOrderPayment();const verify=useVerifyPayment();const config=useGetPaymentConfig({query:{queryKey:getGetPaymentConfigQueryKey(),staleTime:60_000}});const order=useGetOrder(id);const profile=useGetProfile();const [paymentError,setPaymentError]=useState('');
  const q=useGetOrderPaymentStatus(id,{query:{queryKey:getGetOrderPaymentStatusQueryKey(id),refetchInterval:query=>query.state.data?.data?.paymentStatus!=='pending'?false:3000}});
  useEffect(()=>{const saved=sessionStorage.getItem(`payment-message:${id}`);if(saved){setPaymentError(saved);sessionStorage.removeItem(`payment-message:${id}`);}},[id]);
  if(q.isLoading)return <Loading lines={3}/>;
  if(q.isError)return <Retry onClick={()=>void q.refetch()}/>;
  const status=q.data?.data;
  const paid=status?.verified&&status.paymentStatus==='succeeded';const expired=status?.orderStatus==='expired'||status?.orderStatus==='cancelled';
  const runPayment=async()=>{setPaymentError('');try{const configResult=config.data?.data??(await config.refetch()).data?.data;if(!configResult)throw new Error('La configuration du paiement ne peut pas être chargée.');const attempt=await pay.mutateAsync({id});if(configResult.mode==='sandbox'){if(!configResult.enabled||!configResult.publicKey)throw new Error('Kkiapay Sandbox doit être configuré avec ses clés de test dans Netlify.');const orderData=order.data?.data;if(!orderData)throw new Error('Les informations de la commande ne sont pas encore chargées.');const result=await openKkiapayPayment({publicKey:configResult.publicKey,sandbox:true},{amount:attempt.data.amountFCFA,partnerId:attempt.data.partnerId||'',orderReference:orderData.reference,customerName:[profile.data?.data?.firstName,profile.data?.data?.lastName].filter(Boolean).join(' '),email:profile.data?.data?.email,phone:profile.data?.data?.phone});await verify.mutateAsync({data:{orderId:id,paymentAttemptId:attempt.data.id,transactionId:result.transactionId}});}await queryClient.invalidateQueries({queryKey:getGetOrderPaymentStatusQueryKey(id)});await order.refetch();}catch(error){const apiError=error as {data?:{error?:{message?:string}}};setPaymentError(apiError.data?.error?.message||(error instanceof Error?error.message:'Le paiement n’a pas pu être vérifié. Réessayez.'));await q.refetch();}};
  const busy=pay.isPending||verify.isPending;
  return <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 sm:p-10" data-testid="page-payment-return"><span className={`grid h-12 w-12 place-items-center rounded-full ${paid?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-700'}`}>{paid?<Check/>:<CircleHelp/>}</span><h1 className="mt-5 font-display text-2xl font-semibold">{paid?'Commande confirmée':expired?'Commande expirée':'Finaliser le paiement'}</h1><div role="status" className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-medium text-slate-800" data-testid="status-payment">{paid?'Paiement confirmé par Kkiapay. Votre commande est payée.':expired?'Cette commande n’est plus payable. Recommencez votre commande depuis le panier.':status?.paymentStatus==='failed'?'Le paiement a été refusé. Vous pouvez réessayer.':status?.paymentStatus==='anomaly'?'La transaction doit être vérifiée par le service client.':'Paiement en attente.'}</div><p className="mt-2 text-xs text-slate-600">Dernière mise à jour : {localDate(status?.updatedAt)}</p>{paymentError&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" data-testid="status-payment-error">{paymentError}</p>}{status?.orderStatus==='pending_payment'&&status.paymentStatus!=='anomaly'&&<button className="btn btn-primary mt-6" disabled={busy||config.isLoading} onClick={()=>void runPayment()} data-testid="button-pay-order">{busy?'Paiement en cours…':status.paymentStatus==='failed'?'Réessayer le paiement':'Payer maintenant'}</button>}<Link href={`/compte/commandes/${id}`} className="btn btn-outline mt-6 ml-2" data-testid="link-order-detail">Voir la commande</Link></div>;
}

function AccountPage({section}:{section:string}){
 const queryClient=useQueryClient();
 const user=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});const logout=useLogout();const profile=useGetProfile();const update=useUpdateProfile();const anon=useAnonymizeAccount();
 const addresses=useGetAddresses();const departments=useGetDepartments();const communes=useGetCommunes();
 const orders=useGetOrders({page:1,taille:20});const notifications=useGetNotifications({page:1,taille:30});
 const createAddress=useCreateAddress();const updateAddress=useUpdateAddress();const deleteAddress=useDeleteAddress();
 const mark=useMarkNotificationRead();const markAll=useMarkAllNotificationsRead();
 const [note,setNote]=useState('');const [editing,setEditing]=useState('');const [logoutError,setLogoutError]=useState('');
 const [profileForm,setProfileForm]=useState({firstName:'',lastName:'',phone:''});
 const [addressForm,setAddressForm]=useState({label:'',recipient:'',phone:'',departmentId:'',communeId:'',neighborhood:'',landmark:'',isDefault:false});
 const [,go]=useLocation();
 const current=user.data?.data;
 useEffect(()=>{if(profile.data?.data){const p=profile.data.data;setProfileForm({firstName:p.firstName,lastName:p.lastName,phone:p.phone});}},[profile.data]);
 if(user.isLoading)return <Loading/>;
 if(!current){return <div className="rounded-xl border bg-white p-8 text-center"><h1 className="font-display text-2xl font-semibold">Connectez-vous à votre espace</h1><p className="mt-2 text-slate-600">Votre compte permet de consulter les commandes, les adresses et les notifications.</p><Link href="/connexion" className="btn btn-primary mt-5" data-testid="link-account-login">Se connecter</Link></div>;}
 const nav=[['','Vue d’ensemble'],['profil','Mon profil'],['adresses','Mes adresses'],['commandes','Mes commandes'],['notifications','Notifications']];
 const title=nav.find(([id])=>id===section)?.[1]||'Mon compte';
 const submitAddress=(e:FormEvent)=>{e.preventDefault();setNote('');const phone=normalizeBeninPhone(addressForm.phone);if(!phone){setNote('Saisissez un numéro béninois à 10 chiffres (01 suivi de 8 chiffres), ou un ancien numéro à 8 chiffres.');return;}const data={...addressForm,phone};const done={onSuccess:async()=>{setEditing('');setAddressForm({label:'',recipient:'',phone:'',departmentId:'',communeId:'',neighborhood:'',landmark:'',isDefault:false});setNote('Adresse enregistrée.');await queryClient.invalidateQueries({queryKey:getGetAddressesQueryKey()});},onError:(error:Error)=>setNote(error.message||'Impossible d’enregistrer cette adresse.')};if(editing)updateAddress.mutate({id:editing,data} as never,done);else createAddress.mutate({data},done);};
 return <div className="grid gap-6 md:grid-cols-[220px_1fr]" data-testid={`page-account-${section||'home'}`}><aside className="h-fit rounded-xl border bg-white p-4"><p className="font-display font-semibold">Bonjour, {current.firstName}</p><nav className="mt-4 grid gap-1" aria-label="Navigation du compte">{nav.map(([path,label])=><Link href={`/compte${path?`/${path}`:''}`} key={path} className={`rounded-lg px-3 py-2 text-sm ${section===path?'bg-emerald-50 font-semibold text-primary':'hover:bg-slate-50'}`} data-testid={`link-account-${path||'home'}`}>{label}</Link>)}</nav><button disabled={logout.isPending} className="btn btn-ghost btn-sm mt-4 w-full justify-start" onClick={()=>{setLogoutError('');logout.mutate(undefined,{onSuccess:()=>{queryClient.removeQueries();go('/connexion');},onError:()=>setLogoutError('La déconnexion a échoué. Vérifiez votre connexion puis réessayez.')});}} data-testid="button-logout">{logout.isPending?'Déconnexion…':'Se déconnecter'}</button>{logoutError&&<p role="alert" className="mt-2 text-sm text-red-800" data-testid="status-logout-error">{logoutError}</p>}</aside>
 <section className="min-w-0"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Mon espace</p><h1 className="font-display text-3xl font-semibold">{title}</h1></div>{section==='notifications'&&<button className="btn btn-outline btn-sm" onClick={()=>markAll.mutate(undefined)} data-testid="button-mark-all-read">Tout marquer comme lu</button>}</div>
 {section===''&&<div className="grid gap-4 sm:grid-cols-2"><Link href="/compte/commandes" className="rounded-xl border bg-white p-5" data-testid="card-account-orders"><Package className="text-primary"/><h2 className="mt-3 font-semibold">Mes commandes</h2><p className="mt-1 text-sm text-slate-600">Consultez le suivi de vos achats.</p></Link><Link href="/compte/adresses" className="rounded-xl border bg-white p-5" data-testid="card-account-addresses"><Truck className="text-primary"/><h2 className="mt-3 font-semibold">Mes adresses</h2><p className="mt-1 text-sm text-slate-600">Gérez vos informations de livraison.</p></Link></div>}
 {section==='profil'&&<form className="rounded-xl border bg-white p-5" onSubmit={e=>{e.preventDefault();update.mutate({data:profileForm},{onSuccess:()=>setNote('Profil mis à jour.'),onError:()=>setNote('La mise à jour a échoué.')});}}><div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Prénom<input required value={profileForm.firstName} onChange={e=>setProfileForm({...profileForm,firstName:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-profile-first-name"/></label><label className="form-label">Nom<input required value={profileForm.lastName} onChange={e=>setProfileForm({...profileForm,lastName:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-profile-last-name"/></label><label className="form-label">Téléphone<input required value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-profile-phone"/></label><label className="form-label">Adresse e-mail<input disabled value={current.email} className="input input-bordered mt-1 w-full" data-testid="input-profile-email"/></label></div>{note&&<p role="status" className="mt-4 text-sm text-primary" data-testid="status-account">{note}</p>}<button disabled={update.isPending} className="btn btn-primary mt-5" data-testid="button-save-profile">Enregistrer</button><div className="mt-8 border-t pt-5"><h2 className="font-semibold text-red-900">Supprimer votre compte</h2><p className="mt-1 text-sm text-slate-600">Cette action anonymise les informations du compte.</p><button type="button" className="btn btn-outline btn-error mt-3" onClick={()=>{if(confirm('Confirmez-vous l’anonymisation de votre compte ?'))anon.mutate(undefined,{onSuccess:()=>go('/'),onError:()=>setNote('La demande n’a pas pu être traitée.')});}} data-testid="button-anonymize-account">Anonymiser mon compte</button></div></form>}
 {section==='adresses'&&<><form onSubmit={submitAddress} className="mb-5 grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><h2 className="font-display text-lg font-semibold sm:col-span-2">{editing?'Modifier une adresse':'Ajouter une adresse'}</h2><label className="form-label">Nom de l’adresse<input required value={addressForm.label} onChange={e=>setAddressForm({...addressForm,label:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-address-label"/></label><label className="form-label">Destinataire<input required value={addressForm.recipient} onChange={e=>setAddressForm({...addressForm,recipient:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-address-recipient"/></label><label className="form-label">Téléphone<input required type="tel" placeholder="01 53 76 66 12 ou +229 01 53 76 66 12" value={addressForm.phone} onChange={e=>setAddressForm({...addressForm,phone:e.target.value.replace(/[^\d+]/g,'')})} className="input input-bordered mt-1 w-full" data-testid="input-address-phone"/><span className="mt-1 block text-xs text-slate-600">Le format national ou international est accepté.</span></label><label className="form-label">Département<select required value={addressForm.departmentId} onChange={e=>setAddressForm({...addressForm,departmentId:e.target.value,communeId:''})} className="select select-bordered mt-1 w-full" data-testid="select-department"><option value="">Choisir</option>{departments.data?.data?.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="form-label">Commune<select required value={addressForm.communeId} onChange={e=>setAddressForm({...addressForm,communeId:e.target.value})} className="select select-bordered mt-1 w-full" data-testid="select-commune"><option value="">Choisir</option>{communes.data?.data?.filter(c=>!addressForm.departmentId||c.departmentId===addressForm.departmentId).map(c=><option key={c.id} value={c.id}>{c.name}{c.deliveryAvailable?'':' · non desservie'}</option>)}</select></label><label className="form-label">Quartier<input required value={addressForm.neighborhood} onChange={e=>setAddressForm({...addressForm,neighborhood:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-address-neighborhood"/></label><label className="form-label sm:col-span-2">Repère / indications<input required value={addressForm.landmark} onChange={e=>setAddressForm({...addressForm,landmark:e.target.value})} className="input input-bordered mt-1 w-full" data-testid="input-address-landmark"/></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={addressForm.isDefault} onChange={e=>setAddressForm({...addressForm,isDefault:e.target.checked})} className="checkbox checkbox-primary checkbox-sm" data-testid="checkbox-address-default"/>Adresse par défaut</label><div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary" disabled={createAddress.isPending||updateAddress.isPending} data-testid="button-save-address">Enregistrer l’adresse</button>{editing&&<button type="button" className="btn btn-ghost" onClick={()=>setEditing('')} data-testid="button-cancel-address">Annuler</button>}</div></form>{note&&<p role="status" className="mb-3 text-sm" data-testid="status-address">{note}</p>}{addresses.isLoading?<Loading/>:addresses.isError?<Retry onClick={()=>void addresses.refetch()}/>:!addresses.data?.data.length?<Empty title="Aucune adresse" text="Ajoutez une adresse pour simplifier vos prochaines commandes." href="/compte/adresses" action="Ajouter une adresse"/>:<div className="grid gap-3 sm:grid-cols-2">{addresses.data.data.map(a=><AddressCard key={a.id} address={a} onEdit={()=>{setEditing(a.id);setAddressForm({label:a.label,recipient:a.recipient,phone:a.phone,departmentId:a.departmentId,communeId:a.communeId,neighborhood:a.neighborhood,landmark:a.landmark,isDefault:a.isDefault});}} onDelete={()=>{if(confirm('Supprimer cette adresse ?'))deleteAddress.mutate({id:a.id});}}/>)}</div>}</>}
 {section==='commandes'&&(orders.isLoading?<Loading/>:orders.isError?<Retry onClick={()=>void orders.refetch()}/>:!orders.data?.data.length?<Empty title="Aucune commande" text="Vos commandes apparaîtront dans cet espace."/>:<div className="space-y-3">{orders.data.data.map(o=><OrderCard key={o.id} order={o}/>)}</div>)}
 {section==='notifications'&&(notifications.isLoading?<Loading/>:notifications.isError?<Retry onClick={()=>void notifications.refetch()}/>:!notifications.data?.data.length?<Empty title="Aucune notification" text="Vous n’avez pas encore de notification."/>:<div className="space-y-3">{notifications.data.data.map(n=><article key={n.id} className={`rounded-xl border bg-white p-4 ${n.isRead?'':'border-primary/40'}`} data-testid={`card-notification-${n.id}`}><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{n.title}</h2><p className="mt-1 text-sm text-slate-700">{n.message}</p><time className="mt-2 block text-xs text-slate-600">{localDate(n.createdAt)}</time></div>{!n.isRead&&<button className="btn btn-sm btn-outline" onClick={()=>mark.mutate({id:n.id})} data-testid={`button-mark-read-${n.id}`}>Marquer comme lu</button>}</div>{n.orderId&&<Link href={`/compte/commandes/${n.orderId}`} className="mt-3 inline-block text-sm font-semibold text-primary" data-testid={`link-notification-order-${n.id}`}>Voir la commande</Link>}</article>)}</div>)}
 </section></div>;
}
function AddressCard({address:a,onEdit,onDelete}:{address:Address;onEdit:()=>void;onDelete:()=>void}){return <article className="rounded-xl border bg-white p-4" data-testid={`card-address-${a.id}`}><div className="flex justify-between"><h2 className="font-semibold">{a.label}</h2>{a.isDefault&&<span className="badge badge-success">Par défaut</span>}</div><p className="mt-2 text-sm">{a.recipient} · {a.phone}</p><p className="text-sm text-slate-600">{a.neighborhood}, {a.communeName}</p><p className="text-sm text-slate-600">{a.landmark}</p><div className="mt-3 flex gap-3"><button className="text-sm font-semibold text-primary underline" onClick={onEdit} data-testid={`button-edit-address-${a.id}`}>Modifier</button><button className="text-sm font-semibold text-red-800 underline" onClick={onDelete} data-testid={`button-delete-address-${a.id}`}>Supprimer</button></div></article>}
function OrderCard({order:o}:{order:Order}){return <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4" data-testid={`card-order-${o.id}`}><div><p className="text-xs text-slate-600">{localDate(o.createdAt)}</p><h2 className="font-semibold">{o.reference}</h2><p className="mt-1 text-sm text-slate-600">{o.lines.length} article(s) · {money(o.totalFCFA)}</p></div><div className="flex items-center gap-3"><span className="badge badge-outline">{o.status.replaceAll('_',' ')}</span><Link href={`/compte/commandes/${o.id}`} className="btn btn-sm btn-outline" data-testid={`link-order-${o.id}`}>Détails</Link></div></article>}

function OrderDetailPage(){
 const {id=''}=useParams<{id:string}>();const q=useGetOrder(id);const cancel=useCancelPendingOrder();const request=useRequestOrderCancellation();const retryPay=useRetryOrderPayment();
 const [reason,setReason]=useState('');const [message,setMessage]=useState('');
 if(q.isLoading)return <Loading/>;if(q.isError)return <Retry onClick={()=>void q.refetch()}/>;
 const o=q.data?.data;if(!o)return <Empty title="Commande introuvable" text="Cette commande est introuvable." href="/compte/commandes" action="Mes commandes"/>;
 return <div className="mx-auto max-w-3xl" data-testid="page-order-detail"><Link href="/compte/commandes" className="text-sm font-semibold text-primary" data-testid="link-back-orders"><ArrowLeft className="inline" size={15}/> Mes commandes</Link><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Commande {o.reference}</p><h1 className="font-display text-3xl font-semibold">{o.status.replaceAll('_',' ')}</h1></div><Link href={`/compte/commandes/${id}/recu`} className="btn btn-outline btn-sm" data-testid="link-receipt">Voir le reçu</Link></div><p className="mt-2 text-sm text-slate-600">Passée le {localDate(o.createdAt)}</p><section className="mt-6 rounded-xl border bg-white p-5"><h2 className="font-display text-lg font-semibold">Articles</h2>{o.lines.map((l,i)=><div key={`${l.productId}-${i}`} className="flex justify-between gap-3 border-b py-3 text-sm" data-testid={`row-order-line-${i}`}><span>{l.name} × {l.quantity}</span><strong>{money(l.lineTotalFCFA)}</strong></div>)}<div className="ml-auto mt-4 max-w-xs space-y-2 text-sm"><p className="flex justify-between"><span>Sous-total</span><span>{money(o.subtotalFCFA)}</span></p><p className="flex justify-between"><span>Réduction</span><span>− {money(o.discountFCFA)}</span></p><p className="flex justify-between"><span>Livraison</span><span>{money(o.deliveryFCFA)}</span></p><p className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{money(o.totalFCFA)}</span></p></div></section><section className="mt-5 rounded-xl border bg-white p-5"><h2 className="font-display text-lg font-semibold">Suivi</h2><ol className="mt-4 space-y-3">{o.statusHistory.map((s,i)=><li key={`${s.status}-${i}`} className="flex gap-3 text-sm" data-testid={`status-history-${i}`}><span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary"/><span><strong>{s.status.replaceAll('_',' ')}</strong><span className="ml-2 text-slate-600">{localDate(s.createdAt)}</span>{s.note&&<span className="block text-slate-600">{s.note}</span>}</span></li>)}</ol></section>{message&&<p role="status" className="mt-3 text-sm text-primary" data-testid="status-order-action">{message}</p>}<div className="mt-5 flex flex-wrap gap-3">{o.status==='pending_payment'&&<><button className="btn btn-primary btn-sm" disabled={retryPay.isPending} onClick={()=>retryPay.mutate({id:o.id},{onSuccess:()=>{setMessage('Paiement confirmé.');void q.refetch();},onError:()=>setMessage('Le paiement n’a pas pu être confirmé. Réessayez.')})} data-testid="button-retry-payment">{retryPay.isPending?'Confirmation…':'Payer maintenant'}</button><button className="btn btn-outline btn-sm" onClick={()=>cancel.mutate({id:o.id},{onSuccess:()=>{setMessage('Annulation enregistrée.');void q.refetch();}})} data-testid="button-cancel-order">Annuler la commande</button></>}{['confirmed','preparing'].includes(o.status)&&<form onSubmit={e=>{e.preventDefault();request.mutate({id:o.id,data:{reason}},{onSuccess:()=>setMessage('Demande d’annulation enregistrée.'),onError:()=>setMessage('La demande n’a pas pu être enregistrée.')});}} className="flex w-full flex-wrap gap-2"><label className="sr-only" htmlFor="cancel-reason">Motif de la demande</label><input id="cancel-reason" required minLength={5} value={reason} onChange={e=>setReason(e.target.value)} className="input input-bordered min-w-[200px] flex-1" placeholder="Motif de la demande" data-testid="input-cancel-reason"/><button className="btn btn-outline btn-sm" data-testid="button-request-cancellation">Demander l’annulation</button></form>}</div></div>;
}

function ReceiptPage(){const {id=''}=useParams<{id:string}>();const q=useGetOrderReceipt(id);if(q.isLoading)return <Loading/>;if(q.isError)return <Retry onClick={()=>void q.refetch()}/>;const r=q.data?.data;if(!r)return <Empty title="Reçu indisponible" text="Le reçu n’est pas disponible."/>;return <article className="receipt mx-auto max-w-2xl rounded-xl border bg-white p-6 sm:p-10" data-testid="page-receipt"><div className="flex justify-between"><div><p className="eyebrow">{r.storeName}</p><h1 className="font-display text-2xl font-semibold">Reçu de commande</h1></div><button className="btn btn-outline btn-sm print:hidden" onClick={()=>window.print()} data-testid="button-print-receipt">Imprimer</button></div><p className="mt-5 text-sm">Référence : <strong>{r.order.reference}</strong></p><p className="text-sm">Date : {localDate(r.order.createdAt)}</p><div className="my-5 divide-y border-y">{r.order.lines.map((l,i)=><div key={i} className="flex justify-between py-3 text-sm"><span>{l.name} × {l.quantity}</span><strong>{money(l.lineTotalFCFA)}</strong></div>)}</div><p className="flex justify-between font-bold"><span>Total</span><span>{money(r.order.totalFCFA)}</span></p><p className="mt-6 border-t pt-4 text-xs leading-5 text-slate-600">{r.legalNotice}</p></article>}

function LegalPage({slug}:{slug:string}) {
  const info: Record<string, [string, string[]]> = {
    cgv: ["Conditions générales de vente", [
      "Cette interface présente un catalogue et un paiement de démonstration. La confirmation simule un règlement et ne déclenche aucun débit bancaire.",
      "Les prix et disponibilités affichés constituent des données de démonstration à confirmer avant toute vente réelle.",
      "Les prix sont exprimés en FCFA.",
    ]],
    "mentions-legales": ["Mentions légales", [
      "Les coordonnées juridiques du responsable de la boutique et de la société d’hébergement doivent être complétées avant l’ouverture commerciale.",
    ]],
    confidentialite: ["Confidentialité", [
      "Les données de compte, adresses et commandes sont enregistrées pour le fonctionnement de la boutique.",
      "Le panier invité peut être conservé dans votre navigateur.",
    ]],
    retours: ["Retours et remboursements", [
      "Le paiement présenté sur cette interface est simulé et ne déclenche aucun débit bancaire.",
      "Les demandes de retour et de remboursement devront être précisées avant toute ouverture commerciale.",
    ]],
  };
  const [title, paragraphs] = info[slug] || info.cgv;
  return <article className="mx-auto max-w-3xl rounded-xl border bg-white p-6 sm:p-10" data-testid={`page-${slug}`}><p className="eyebrow">Boutik Bénin · informations</p><h1 className="font-display text-3xl font-semibold">{title}</h1><p className="mt-2 text-xs text-slate-600">Mis à jour le {localDate(new Date().toISOString())}</p><div className="mt-7 space-y-4 text-sm leading-7 text-slate-700">{paragraphs.map((p, i) => <p key={i} data-testid={`text-legal-${i}`}>{p}</p>)}</div></article>;
}
function ContactPage(){const [sent,setSent]=useState(false);return <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6 sm:p-9" data-testid="page-contact"><p className="eyebrow">Nous contacter</p><h1 className="font-display text-3xl font-semibold">Comment pouvons-nous vous aider ?</h1>{sent?<p role="status" className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700" data-testid="status-contact">Le formulaire de contact n’est pas encore connecté. Votre message n’a pas été envoyé.</p>:<form className="mt-6 space-y-4" onSubmit={e=>{e.preventDefault();setSent(true);}}><label className="form-label block">Votre nom<input required className="input input-bordered mt-1 w-full" data-testid="input-contact-name"/></label><label className="form-label block">Adresse e-mail<input required type="email" className="input input-bordered mt-1 w-full" data-testid="input-contact-email"/></label><label className="form-label block">Votre message<textarea required minLength={10} rows={5} className="textarea textarea-bordered mt-1 w-full" data-testid="input-contact-message"/></label><button className="btn btn-primary" data-testid="button-contact-submit">Envoyer le message</button></form>}</div>}
function NotFound(){return <div className="mx-auto max-w-xl py-16 text-center" data-testid="page-not-found"><p className="eyebrow">Erreur 404</p><h1 className="font-display text-4xl font-semibold">Cette page est introuvable.</h1><p className="mt-3 text-slate-600">Le lien est peut-être incorrect ou la page a été déplacée.</p><Link href="/" className="btn btn-primary mt-6" data-testid="link-not-found-home">Retour à l’accueil</Link></div>}

export default function Storefront(){
 const [location]=useLocation();const queryClient=useQueryClient();const current=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});const cartKey=getGetCartQueryKey();const {toast}=useToast();
 const mergeGuestCart=useMergeCart({mutation:{scope:{id:'customer-cart'}}});const guestMergeInFlight=useRef(false);
 const [guest,setGuestState]=useState<GuestCart>(readGuest);const setGuest=(x:GuestCart)=>{saveGuest(x);setGuestState(x);};
 const syncCart=(response:CartResponse)=>queryClient.setQueryData(cartKey,response);
 const refreshCart=()=>{void queryClient.invalidateQueries({queryKey:cartKey});};
 const setItem=useSetCartItem({mutation:{scope:{id:'customer-cart'},onSuccess:syncCart,onError:refreshCart}});
 useEffect(()=>{
  if(!current.data?.data||guestMergeInFlight.current)return;
  const guestItems=Object.values(readGuest()).map(({productId,quantity,lastSeenPriceFCFA})=>({productId,quantity,lastSeenPriceFCFA}));
  if(!guestItems.length)return;
  guestMergeInFlight.current=true;
  mergeGuestCart.mutate({data:{items:guestItems}} as never,{
   onSuccess:(response)=>{queryClient.setQueryData(cartKey,response);saveGuest({});setGuestState({});},
   onError:()=>toast({title:'Panier conservé',description:'Le panier invité est gardé sur cet appareil. Rechargez la page pour réessayer.',variant:'destructive'}),
   onSettled:()=>{guestMergeInFlight.current=false;},
  });
 },[current.data?.data?.id]);
 const add=(p:Product,requestedQuantity=1)=>{const maxQuantity=Math.min(10,p.stock);if(!p.available||maxQuantity<1)return;const increment=Math.max(1,Math.floor(requestedQuantity));if(current.data?.data){const cached=queryClient.getQueryData<CartResponse>(cartKey);const existing=cached?.data.items.find(item=>item.productId===p.id)?.quantity||0;const quantity=Math.min(maxQuantity,existing+increment);queryClient.setQueryData(cartKey,optimisticallySetCartLine(cached,p,quantity));setItem.mutate({productId:p.id,data:{quantity,lastSeenPriceFCFA:p.priceFCFA}} as never,{onError:()=>toast({title:'Ajout impossible',description:'L’article n’a pas pu être ajouté. Réessayez.',variant:'destructive'})});toast({title:'Article ajouté au panier',description:`${p.name} · quantité ${quantity}.`});}else{const guestCart=readGuest();const quantity=Math.min(maxQuantity,(guestCart[p.slug]?.quantity||0)+increment);guestCart[p.slug]={productId:p.id,quantity,lastSeenPriceFCFA:p.priceFCFA};setGuest(guestCart);toast({title:'Article ajouté au panier',description:`${p.name} · quantité ${quantity}.`});}};
 if(location.startsWith('/admin'))return <AdminPage isAdmin={current.data?.data?.role==='admin'} isCheckingAccess={current.isLoading} user={current.data?.data?{firstName:current.data.data.firstName,lastName:current.data.data.lastName,email:current.data.data.email}:undefined}/>;
 return <StoreShell><Switch>
  <Route path="/"><HomePage add={add}/></Route>
  <Route path="/produits"><ProductsPage add={add}/></Route>
  <Route path="/categories/:slug">{params=><ProductsPage add={add} categorySlug={params.slug}/>}</Route>
  <Route path="/produits/:slug"><ProductPage add={add}/></Route>
  <Route path="/inscription"><AuthPage mode="register"/></Route><Route path="/connexion"><AuthPage mode="login"/></Route>
  <Route path="/mot-de-passe-oublie"><AuthPage mode="forgot"/></Route><Route path="/reinitialisation/:jeton"><AuthPage mode="reset"/></Route>
  <Route path="/panier"><CartPage isGuest={!current.data?.data} setGuest={setGuest}/></Route><Route path="/commande"><CheckoutPage/></Route><Route path="/commande/:id/verification"><PaymentReturnPage/></Route>
  <Route path="/compte"><AccountPage section=""/></Route><Route path="/compte/profil"><AccountPage section="profil"/></Route><Route path="/compte/adresses"><AccountPage section="adresses"/></Route><Route path="/compte/commandes"><AccountPage section="commandes"/></Route><Route path="/compte/commandes/:id"><OrderDetailPage/></Route><Route path="/compte/commandes/:id/recu"><ReceiptPage/></Route><Route path="/compte/notifications"><AccountPage section="notifications"/></Route>
  <Route path="/cgv"><LegalPage slug="cgv"/></Route><Route path="/mentions-legales"><LegalPage slug="mentions-legales"/></Route><Route path="/confidentialite"><LegalPage slug="confidentialite"/></Route><Route path="/retours"><LegalPage slug="retours"/></Route><Route path="/contact"><ContactPage/></Route>
  <Route component={NotFound}/>
 </Switch></StoreShell>;
}
