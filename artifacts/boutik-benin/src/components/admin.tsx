import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";

type AdminOverview = {
  ordersPendingPayment: number;
  ordersToPrepare: number;
  ordersShipped: number;
  products: number;
  lowStockProducts: number;
  customers: number;
  simulatedRevenueFCFA: number;
  paymentMode: "simulation";
};
type AdminOrder = {
  id: string;
  reference: string;
  status: string;
  totalFCFA: number;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  paymentStatus: string | null;
  paymentSimulation: boolean;
};
type AdminProduct = {
  id: string;
  reference: string;
  name: string;
  status: string;
  priceFCFA: number;
  stockPhysical: number;
  lowStockThreshold: number;
  categoryName: string;
};
type ApiResult<T> = { data: T };
type AdminView = "overview" | "orders" | "stock";
type AdminUser = { firstName: string; lastName: string; email: string };

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "La demande d’administration a échoué.");
  return body as T;
}

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(new Date(value));
const shortDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Porto-Novo" }).format(new Date(value));

const orderStatus: Record<string, { label: string; tone: string }> = {
  pending_payment: { label: "Paiement en attente", tone: "amber" },
  confirmed: { label: "Confirmée", tone: "blue" },
  preparing: { label: "En préparation", tone: "blue" },
  shipped: { label: "Expédiée", tone: "violet" },
  delivered: { label: "Livrée", tone: "green" },
  cancelled: { label: "Annulée", tone: "slate" },
  refund_requested: { label: "Remboursement demandé", tone: "red" },
  refunded: { label: "Remboursée", tone: "slate" },
};

function StatusBadge({ status }: { status: string }) {
  const config = orderStatus[status] ?? { label: status.replaceAll("_", " "), tone: "slate" };
  const tones: Record<string, string> = {
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    blue: "bg-sky-50 text-sky-800 ring-sky-200",
    violet: "bg-violet-50 text-violet-800 ring-violet-200",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    red: "bg-rose-50 text-rose-800 ring-rose-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[config.tone]}`}>{config.label}</span>;
}

function MetricCard({ label, value, detail, icon: Icon, tone, onClick }: {
  label: string; value: string | number; detail: string; icon: typeof ShoppingCart;
  tone: "green" | "amber" | "blue" | "violet"; onClick?: () => void;
}) {
  const iconTone = {
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-sky-50 text-sky-800",
    violet: "bg-violet-50 text-violet-800",
  }[tone];
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-950">{value}</p></div>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconTone}`}><Icon size={20}/></span>
    </div>
    <p className="mt-3 text-xs text-slate-500">{detail}</p>
  </>;
  const classes = "block rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.025] transition hover:border-slate-300";
  return onClick
    ? <button className={`${classes} w-full text-left hover:shadow-md`} onClick={onClick}>{content}</button>
    : <article className={classes}>{content}</article>;
}

function AdminTable({ children, minWidth = "760px" }: { children: React.ReactNode; minWidth?: string }) {
  return <div className="overflow-x-auto">
    <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
      {children}
    </table>
  </div>;
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</thead>;
}

function TableCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-middle ${className}`}>{children}</td>;
}

function Pagination({ page, pages, count, onPage }: { page: number; pages: number; count: number; onPage: (page: number) => void }) {
  if (count <= 10) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
    <span>{count} résultat{count > 1 ? "s" : ""} · page {page} sur {pages}</span>
    <div className="flex items-center gap-2">
      <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-medium disabled:cursor-not-allowed disabled:opacity-45" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente"><ChevronLeft size={16}/> Précédent</button>
      <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 font-medium disabled:cursor-not-allowed disabled:opacity-45" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">Suivant <ChevronRight size={16}/></button>
    </div>
  </div>;
}

function AdminHeader({ title, description, user, onRefresh, refreshing, onLogout, loggingOut }: { title: string; description: string; user: AdminUser; onRefresh?: () => void; refreshing?: boolean; onLogout: () => void; loggingOut: boolean }) {
  const [showMobileNav, setShowMobileNav] = useState(false);
  return <>
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 md:hidden" onClick={() => setShowMobileNav(!showMobileNav)} aria-label={showMobileNav ? "Fermer le menu" : "Ouvrir le menu"}>{showMobileNav ? <X size={20}/> : <Menu size={20}/>}</button>
        <div className="min-w-0"><p className="hidden text-xs font-medium text-slate-500 sm:block">Administration / <span className="text-slate-700">{title}</span></p><h1 className="truncate font-display text-lg font-semibold text-slate-950 sm:mt-0.5 sm:text-xl">{title}</h1></div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {onRefresh && <button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 sm:w-auto sm:px-3" onClick={onRefresh} disabled={refreshing} aria-label="Actualiser les données" title="Actualiser"><RefreshCw className={refreshing ? "animate-spin" : ""} size={17}/><span className="hidden pl-2 text-sm font-medium sm:inline">Actualiser</span></button>}
        <div className="hidden h-9 w-px bg-slate-200 sm:block"/>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</span>
          <span className="hidden max-w-36 truncate text-sm font-semibold text-slate-800 lg:block">{user.firstName} {user.lastName}</span>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50 md:hidden" onClick={onLogout} disabled={loggingOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={18}/></button>
      </div>
    </header>
    {showMobileNav && <button className="fixed inset-0 z-20 bg-slate-950/35 md:hidden" aria-label="Fermer la navigation" onClick={() => setShowMobileNav(false)}/>}
    {showMobileNav && <div className="fixed left-0 right-0 top-[72px] z-30 border-b border-slate-200 bg-white px-3 py-3 shadow-lg md:hidden"><AdminNavigation onNavigate={() => setShowMobileNav(false)}/></div>}
  </>;
}

function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const nav = [
    { href: "/admin", label: "Vue d’ensemble", icon: LayoutDashboard, match: location === "/admin" },
    { href: "/admin/commandes", label: "Commandes", icon: ShoppingCart, match: location.startsWith("/admin/commandes") },
    { href: "/admin/stock", label: "Stock", icon: Boxes, match: location.startsWith("/admin/stock") },
  ];
  return <nav aria-label="Administration" className="space-y-1">
    <p className="px-3 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Boutique</p>
    {nav.map(({ href, label, icon: Icon, match }) => <Link key={href} href={href} onClick={onNavigate} aria-current={match ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${match ? "bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><Icon size={18} strokeWidth={match ? 2.4 : 1.8}/>{label}{match && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-700"/>}</Link>)}
    <p className="px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Raccourcis</p>
    <Link href="/produits" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"><Store size={18} strokeWidth={1.8}/>Ouvrir la boutique<ExternalLink className="ml-auto" size={14}/></Link>
  </nav>;
}

function AdminLayout({ children, title, description, user, onRefresh, refreshing, onLogout, loggingOut }: {
  children: React.ReactNode; title: string; description: string; user: AdminUser;
  onRefresh?: () => void; refreshing?: boolean; onLogout: () => void; loggingOut: boolean;
}) {
  return <div className="min-h-screen bg-[#F5F7F8] text-slate-900" data-testid="admin-shell">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] flex-col border-r border-slate-200 bg-white md:flex">
      <Link href="/admin" className="flex h-[72px] items-center gap-3 border-b border-slate-200 px-6">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-800 text-amber-300"><Store size={20}/></span>
        <span className="leading-tight"><b className="font-display block text-base tracking-tight text-slate-950">boutik<span className="text-emerald-700">.</span></b><small className="block text-[10px] font-semibold uppercase tracking-[.15em] text-slate-500">Bénin · Admin</small></span>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 py-4"><AdminNavigation/></div>
      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 rounded-lg bg-slate-50 p-3"><p className="truncate text-sm font-semibold text-slate-800">{user.firstName} {user.lastName}</p><p className="truncate text-xs text-slate-500">{user.email}</p><span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">Administrateur</span></div>
        <button className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50" onClick={onLogout} disabled={loggingOut}><LogOut size={17}/>{loggingOut ? "Déconnexion…" : "Se déconnecter"}</button>
      </div>
    </aside>
    <div className="min-h-screen md:pl-[252px]">
      <AdminHeader title={title} description={description} user={user} onRefresh={onRefresh} refreshing={refreshing} onLogout={onLogout} loggingOut={loggingOut}/>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        <p className="sr-only">{description}</p>
        {children}
      </main>
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><p className="text-xs font-bold uppercase tracking-[.13em] text-emerald-800">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>
    {action}
  </div>;
}

function Panel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.025] ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-display text-base font-semibold text-slate-950">{title}</h2>{description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

export default function AdminPage({ isAdmin, isCheckingAccess = false, user }: { isAdmin: boolean; isCheckingAccess?: boolean; user?: AdminUser }) {
  const [, go] = useLocation();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminFetch<ApiResult<AdminOverview>>("/api/admin/overview").then((result) => result.data), enabled: isAdmin });
  const orders = useQuery({ queryKey: ["admin-orders"], queryFn: () => adminFetch<ApiResult<AdminOrder[]>>("/api/admin/orders").then((result) => result.data), enabled: isAdmin });
  const products = useQuery({ queryKey: ["admin-products"], queryFn: () => adminFetch<ApiResult<AdminProduct[]>>("/api/admin/products").then((result) => result.data), enabled: isAdmin });
  const logout = useMutation({ mutationFn: () => adminFetch("/api/auth/logout", { method: "POST" }), onSuccess: async () => { await queryClient.removeQueries(); go("/connexion"); } });
  const simulate = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "succeeded" | "failed" }) => adminFetch(`/api/admin/orders/${id}/simulate-payment`, { method: "POST", body: JSON.stringify({ outcome }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-overview"] }), queryClient.invalidateQueries({ queryKey: ["admin-orders"] })]); },
  });
  const advance = useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/orders/${id}/advance`, { method: "POST" }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-overview"] }), queryClient.invalidateQueries({ queryKey: ["admin-orders"] })]); },
  });
  const adjustStock = useMutation({
    mutationFn: ({ id, variation, reason }: { id: string; variation: number; reason: string }) => adminFetch(`/api/admin/products/${id}/stock-adjustments`, { method: "POST", body: JSON.stringify({ variation, reason }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-products"] }), queryClient.invalidateQueries({ queryKey: ["admin-overview"] })]); },
  });
  const [stockProduct, setStockProduct] = useState<AdminProduct | null>(null);
  const [stockVariation, setStockVariation] = useState("1");
  const [stockReason, setStockReason] = useState("");

  const view: AdminView = location.startsWith("/admin/commandes") ? "orders" : location.startsWith("/admin/stock") ? "stock" : "overview";
  const titles: Record<AdminView, { title: string; description: string }> = {
    overview: { title: "Vue d’ensemble", description: "Les indicateurs et actions à traiter sur votre boutique." },
    orders: { title: "Commandes", description: "Suivez les paiements simulés et faites avancer les commandes." },
    stock: { title: "Stock", description: "Surveillez les disponibilités et justifiez chaque mouvement." },
  };
  const page = titles[view];
  const refresh = () => { void Promise.all([overview.refetch(), orders.refetch(), products.refetch()]); };

  if (isCheckingAccess) return <div className="grid min-h-screen place-items-center bg-[#F5F7F8]"><div className="w-64 space-y-3" aria-label="Vérification des accès"><div className="skeleton h-8 w-2/3 rounded-lg"/><div className="skeleton h-24 rounded-xl"/></div></div>;
  if (!isAdmin || !user) return <div className="grid min-h-screen place-items-center bg-[#F5F7F8] px-5"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm" role="alert"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-800"><AlertTriangle/></span><h1 className="mt-4 font-display text-xl font-semibold">Accès administrateur requis</h1><p className="mt-2 text-sm leading-6 text-slate-600">Connectez-vous avec un compte administrateur pour ouvrir cet espace.</p><Link href="/connexion" className="mt-5 inline-flex h-10 items-center rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900">Se connecter</Link><Link href="/" className="ml-3 inline-flex h-10 items-center px-3 text-sm font-semibold text-slate-600 hover:text-slate-950">Retour à la boutique</Link></section></div>;

  const content = view === "orders"
    ? <OrdersView orders={orders.data ?? []} loading={orders.isLoading} error={orders.error as Error | null} simulate={simulate} advance={advance} onNavigate={go}/>
    : view === "stock"
      ? <StockView products={products.data ?? []} loading={products.isLoading} error={products.error as Error | null} pending={adjustStock.isPending} onAdjust={(product) => { setStockProduct(product); setStockVariation("1"); setStockReason(""); }} onNavigate={go}/>
      : <OverviewView overview={overview.data} loading={overview.isLoading} error={overview.error as Error | null} retryOverview={() => void overview.refetch()} orders={orders.data ?? []} ordersLoading={orders.isLoading} ordersError={orders.error as Error | null} retryOrders={() => void orders.refetch()} products={products.data ?? []} productsLoading={products.isLoading} productsError={products.error as Error | null} retryProducts={() => void products.refetch()} onNavigate={go}/>;

  return <AdminLayout title={page.title} description={page.description} user={user} onRefresh={refresh} refreshing={overview.isFetching || orders.isFetching || products.isFetching} onLogout={() => logout.mutate()} loggingOut={logout.isPending}>
    {logout.isError && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">La déconnexion a échoué. Réessayez.</p>}
    {content}
    {stockProduct && <StockAdjustmentDialog product={stockProduct} variation={stockVariation} reason={stockReason} pending={adjustStock.isPending} error={adjustStock.error as Error | null} onVariation={setStockVariation} onReason={setStockReason} onClose={() => { if (!adjustStock.isPending) setStockProduct(null); }} onSubmit={async (event) => {
      event.preventDefault();
      const variation = Number(stockVariation);
      if (!Number.isInteger(variation) || variation === 0 || stockReason.trim().length < 5) return;
      try { await adjustStock.mutateAsync({ id: stockProduct.id, variation, reason: stockReason.trim() }); setStockProduct(null); }
      catch { /* Keep the form open so the administrator can retry. */ }
    }}/ >}
  </AdminLayout>;
}

function OverviewView({ overview, loading, error, retryOverview, orders, ordersLoading, ordersError, retryOrders, products, productsLoading, productsError, retryProducts, onNavigate }: {
  overview?: AdminOverview; loading: boolean; error: Error | null; retryOverview: () => void; orders: AdminOrder[]; ordersLoading: boolean; ordersError: Error | null; retryOrders: () => void; products: AdminProduct[]; productsLoading: boolean; productsError: Error | null; retryProducts: () => void; onNavigate: (href: string) => void;
}) {
  const pending = orders.filter((order) => order.status === "pending_payment").slice(0, 5);
  const toPrepare = orders.filter((order) => ["confirmed", "preparing", "shipped"].includes(order.status)).slice(0, 5);
  const lowStock = products.filter((product) => product.status === "active" && product.stockPhysical <= product.lowStockThreshold).slice(0, 5);
  return <div data-testid="page-admin" className="space-y-7">
    <SectionHeading eyebrow="Pilotage de la boutique" title="Bonjour, voici votre activité" description="Un aperçu des opérations qui méritent votre attention aujourd’hui." action={<p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Africa/Porto-Novo" }).format(new Date())}</p>}/>
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-950"><CircleDollarSign className="mt-0.5 shrink-0" size={18}/><p><strong>Mode démonstration :</strong> les paiements sont simulés et aucun argent n’est encaissé. Les montants sont indicatifs.</p></div>
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-36 rounded-xl" aria-label="Chargement des indicateurs"/>)}</div> : error ? <ErrorPanel error={error} onRetry={retryOverview}/> : overview && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="À payer" value={overview.ordersPendingPayment} detail="Commandes en attente de paiement simulé" icon={Clock3} tone="amber" onClick={() => onNavigate("/admin/commandes")}/>
      <MetricCard label="À traiter" value={overview.ordersToPrepare} detail="Commandes confirmées ou en préparation" icon={PackageCheck} tone="blue" onClick={() => onNavigate("/admin/commandes")}/>
      <MetricCard label="Stock à surveiller" value={overview.lowStockProducts} detail="Produits actifs sous leur seuil" icon={AlertTriangle} tone="violet" onClick={() => onNavigate("/admin/stock?filtre=bas")}/>
      <MetricCard label="Ventes simulées" value={money(overview.simulatedRevenueFCFA)} detail={`${overview.customers} comptes clients · données de démonstration`} icon={CircleDollarSign} tone="green"/>
    </div>}
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Commandes à payer" description="Les dernières commandes en attente de simulation" action={<Link href="/admin/commandes" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Toutes les commandes <ArrowRight size={15}/></Link>}>
        {ordersLoading ? <PanelSkeleton/> : ordersError ? <ErrorPanel error={ordersError} onRetry={retryOrders}/> : pending.length ? <div className="divide-y divide-slate-100">{pending.map((order) => <button key={order.id} onClick={() => onNavigate("/admin/commandes")} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.reference}</p><p className="mt-0.5 truncate text-xs text-slate-500">{order.firstName} {order.lastName} · {shortDate(order.createdAt)}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-900">{money(order.totalFCFA)}</p><StatusBadge status={order.status}/></div></button>)}</div> : <EmptyPanel icon={CheckCircle2} text="Aucune commande en attente de paiement."/>}
      </Panel>
      <Panel title="Stock à surveiller" description="Produits actifs au niveau ou sous le seuil d’alerte" action={<Link href="/admin/stock?filtre=bas" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Voir le stock <ArrowRight size={15}/></Link>}>
        {productsLoading ? <PanelSkeleton/> : productsError ? <ErrorPanel error={productsError} onRetry={retryProducts}/> : lowStock.length ? <div className="divide-y divide-slate-100">{lowStock.map((product) => <button key={product.id} onClick={() => onNavigate("/admin/stock?filtre=bas")} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{product.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{product.reference} · {product.categoryName}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-amber-800">{product.stockPhysical} en stock</p><p className="text-xs text-slate-500">Seuil {product.lowStockThreshold}</p></div></button>)}</div> : <EmptyPanel icon={CheckCircle2} text="Tous les produits sont au-dessus du seuil de stock."/>}
      </Panel>
    </div>
    <Panel title="Commandes récentes" description="Dernières commandes enregistrées dans la boutique" action={<Link href="/admin/commandes" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Ouvrir le suivi <ArrowRight size={15}/></Link>}>
      {ordersLoading ? <PanelSkeleton/> : ordersError ? <ErrorPanel error={ordersError} onRetry={retryOrders}/> : orders.length ? <AdminTable minWidth="680px"><TableHead><tr><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Total</th></tr></TableHead><tbody className="divide-y divide-slate-100">{orders.slice(0, 6).map((order) => <tr key={order.id} className="hover:bg-slate-50"><TableCell className="font-semibold text-slate-900">{order.reference}</TableCell><TableCell><span className="font-medium">{order.firstName} {order.lastName}</span><span className="mt-0.5 block text-xs text-slate-500">{order.email}</span></TableCell><TableCell className="whitespace-nowrap text-slate-600">{date(order.createdAt)}</TableCell><TableCell><StatusBadge status={order.status}/></TableCell><TableCell className="whitespace-nowrap text-right font-semibold">{money(order.totalFCFA)}</TableCell></tr>)}</tbody></AdminTable> : <EmptyPanel icon={ShoppingCart} text="Aucune commande enregistrée pour le moment."/>}
    </Panel>
  </div>;
}

function OrdersView({ orders, loading, error, simulate, advance, onNavigate }: {
  orders: AdminOrder[]; loading: boolean; error: Error | null; simulate: ReturnType<typeof useMutation>; advance: ReturnType<typeof useMutation>; onNavigate: (href: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => orders.filter((order) => {
    const term = search.trim().toLocaleLowerCase("fr");
    const matchesSearch = !term || [order.reference, order.firstName, order.lastName, order.email].some((value) => value.toLocaleLowerCase("fr").includes(term));
    return matchesSearch && (status === "all" || order.status === status);
  }), [orders, search, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const updateStatus = (value: string) => { setStatus(value); setPage(1); };
  return <div data-testid="page-admin-orders">
    <SectionHeading eyebrow="Opérations" title="Commandes" description="Recherchez une commande, suivez son paiement simulé et mettez à jour sa préparation." action={<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Paiements en simulation</div>}/>
    {(simulate.isError || advance.isError) && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">{((simulate.error || advance.error) as Error).message}</p>}
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <button onClick={() => updateStatus("all")} className={`rounded-xl border px-4 py-3 text-left ${status === "all" ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className="text-xs font-semibold text-slate-600">Toutes les commandes</span><strong className="mt-1 block text-xl text-slate-950">{orders.length}</strong></button>
      <button onClick={() => updateStatus("pending_payment")} className={`rounded-xl border px-4 py-3 text-left ${status === "pending_payment" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className="text-xs font-semibold text-slate-600">Paiement à simuler</span><strong className="mt-1 block text-xl text-slate-950">{orders.filter((order) => order.status === "pending_payment").length}</strong></button>
      <button onClick={() => updateStatus("confirmed")} className={`rounded-xl border px-4 py-3 text-left ${status === "confirmed" ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className="text-xs font-semibold text-slate-600">À préparer</span><strong className="mt-1 block text-xl text-slate-950">{orders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length}</strong></button>
    </div>
    <Panel title="Liste des commandes" description="Affichage des commandes les plus récentes">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <label className="relative block w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Référence, nom ou e-mail…" aria-label="Rechercher une commande"/></label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><span className="whitespace-nowrap">Statut</span><select value={status} onChange={(event) => updateStatus(event.target.value)} className="h-10 min-w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"><option value="all">Tous les statuts</option>{Object.entries(orderStatus).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
      </div>
      {loading ? <PanelSkeleton/> : error ? <ErrorPanel error={error} onRetry={() => window.location.reload()}/> : visible.length ? <>
        <AdminTable minWidth="900px"><TableHead><tr><th className="px-4 py-3">Commande</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Créée le</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Paiement</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3">Action</th></tr></TableHead>
          <tbody className="divide-y divide-slate-100">{visible.map((order) => <tr key={order.id} className="hover:bg-slate-50/80"><TableCell><span className="font-semibold text-slate-900">{order.reference}</span></TableCell><TableCell><span className="font-medium text-slate-800">{order.firstName} {order.lastName}</span><span className="mt-0.5 block text-xs text-slate-500">{order.email}</span></TableCell><TableCell className="whitespace-nowrap text-slate-600">{date(order.createdAt)}</TableCell><TableCell><StatusBadge status={order.status}/></TableCell><TableCell>{order.status === "pending_payment" && (order.paymentStatus === "pending" || order.paymentStatus === "failed") ? <span className="text-xs font-medium text-amber-800">À simuler</span> : order.paymentSimulation ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><BadgeCheck size={14}/> Confirmé (simulation)</span> : <span className="text-xs text-slate-500">{order.paymentStatus ?? "—"}</span>}</TableCell><TableCell className="whitespace-nowrap text-right font-semibold text-slate-900">{money(order.totalFCFA)}</TableCell><TableCell><div className="flex min-w-[210px] flex-wrap gap-2">{order.status === "pending_payment" && (order.paymentStatus === "pending" || order.paymentStatus === "failed") ? <><button className="rounded-lg bg-emerald-800 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={simulate.isPending} onClick={() => { if (window.confirm(`Confirmer le paiement simulé de ${order.reference} ?`)) simulate.mutate({ id: order.id, outcome: "succeeded" }); }}>Simuler payé</button><button className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={simulate.isPending} onClick={() => { if (window.confirm(`Simuler le refus de paiement pour ${order.reference} ?`)) simulate.mutate({ id: order.id, outcome: "failed" }); }}>Simuler refus</button></> : ["confirmed", "preparing", "shipped"].includes(order.status) ? <button className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={advance.isPending} onClick={() => advance.mutate(order.id)}>{order.status === "confirmed" ? "Préparer" : order.status === "preparing" ? "Expédier" : "Marquer livrée"}</button> : <span className="text-xs text-slate-400">Aucune action</span>}</div></TableCell></tr>)}</tbody>
        </AdminTable><Pagination page={page} pages={pages} count={filtered.length} onPage={setPage}/>
      </> : <EmptyPanel icon={ShoppingCart} text={search || status !== "all" ? "Aucune commande ne correspond à ces critères." : "Aucune commande enregistrée pour le moment."}/>}
    </Panel>
  </div>;
}

function StockView({ products, loading, error, pending, onAdjust, onNavigate }: { products: AdminProduct[]; loading: boolean; error: Error | null; pending: boolean; onAdjust: (product: AdminProduct) => void; onNavigate: (href: string) => void }) {
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(() => new URLSearchParams(window.location.search).get("filtre") === "bas");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => products.filter((product) => {
    const term = search.trim().toLocaleLowerCase("fr");
    const matchesSearch = !term || [product.name, product.reference, product.categoryName].some((value) => value.toLocaleLowerCase("fr").includes(term));
    return matchesSearch && (!lowOnly || (product.status === "active" && product.stockPhysical <= product.lowStockThreshold));
  }), [products, search, lowOnly]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const changeLowOnly = (checked: boolean) => { setLowOnly(checked); setPage(1); onNavigate(checked ? "/admin/stock?filtre=bas" : "/admin/stock"); };
  return <div data-testid="page-admin-stock">
    <SectionHeading eyebrow="Catalogue" title="Stock et disponibilité" description="Le niveau actuel est comparé au seuil d’alerte défini pour chaque produit." action={<button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900" onClick={() => changeLowOnly(!lowOnly)}><AlertTriangle size={16}/>{lowOnly ? "Voir tout le stock" : "Voir les stocks faibles"}</button>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricCard label="Références actives" value={products.filter((product) => product.status === "active").length} detail="Produits disponibles dans le catalogue" icon={Package} tone="green"/><MetricCard label="Sous le seuil" value={products.filter((product) => product.status === "active" && product.stockPhysical <= product.lowStockThreshold).length} detail="Une action de réapprovisionnement est à prévoir" icon={AlertTriangle} tone="amber"/><MetricCard label="Stock total" value={products.reduce((total, product) => total + product.stockPhysical, 0)} detail="Unités physiques enregistrées" icon={Boxes} tone="blue"/></div>
    <Panel title="Inventaire des produits" description="Ajustements enregistrés avec motif et journal d’audit">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><label className="relative block w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nom, référence ou catégorie…" aria-label="Rechercher un produit"/></label><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={lowOnly} onChange={(event) => changeLowOnly(event.target.checked)} className="checkbox checkbox-sm checkbox-success"/>Stocks faibles uniquement</label></div>
      {loading ? <PanelSkeleton/> : error ? <ErrorPanel error={error} onRetry={() => window.location.reload()}/> : visible.length ? <><AdminTable minWidth="820px"><TableHead><tr><th className="px-4 py-3">Produit</th><th className="px-4 py-3">Catégorie</th><th className="px-4 py-3 text-right">Prix</th><th className="px-4 py-3">Disponibilité</th><th className="px-4 py-3 text-right">Stock / seuil</th><th className="px-4 py-3 text-right">Action</th></tr></TableHead><tbody className="divide-y divide-slate-100">{visible.map((product) => { const low = product.status === "active" && product.stockPhysical <= product.lowStockThreshold; return <tr key={product.id} className="hover:bg-slate-50/80"><TableCell><span className="font-semibold text-slate-900">{product.name}</span><span className="mt-0.5 block text-xs text-slate-500">{product.reference}</span></TableCell><TableCell className="text-slate-600">{product.categoryName}</TableCell><TableCell className="whitespace-nowrap text-right text-slate-700">{money(product.priceFCFA)}</TableCell><TableCell><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${product.status === "active" ? "text-emerald-800" : "text-slate-500"}`}><span className={`h-2 w-2 rounded-full ${product.status === "active" ? "bg-emerald-600" : "bg-slate-400"}`}/>{product.status === "active" ? "Actif" : product.status}</span></TableCell><TableCell className="whitespace-nowrap text-right"><span className={low ? "font-bold text-amber-800" : "font-semibold text-slate-900"}>{product.stockPhysical}</span><span className="text-slate-400"> / {product.lowStockThreshold}</span>{low && <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800"><ArrowDownRight size={13}/> Bas</span>}</TableCell><TableCell className="text-right"><button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-900 disabled:opacity-50" disabled={pending} onClick={() => onAdjust(product)}>Ajuster le stock</button></TableCell></tr>; })}</tbody></AdminTable><Pagination page={page} pages={pages} count={filtered.length} onPage={setPage}/></> : <EmptyPanel icon={Boxes} text={search || lowOnly ? "Aucun produit ne correspond à ces critères." : "Aucun produit n’est enregistré."}/>}
    </Panel>
  </div>;
}

function StockAdjustmentDialog({ product, variation, reason, pending, error, onVariation, onReason, onClose, onSubmit }: {
  product: AdminProduct; variation: string; reason: string; pending: boolean; error: Error | null;
  onVariation: (value: string) => void; onReason: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const amount = Number(variation);
  const nextStock = product.stockPhysical + (Number.isInteger(amount) ? amount : 0);
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title" className="my-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Mouvement de stock</p><h2 id="stock-dialog-title" className="mt-1 font-display text-xl font-semibold text-slate-950">Ajuster le stock</h2><p className="mt-1 text-sm text-slate-600">{product.name} · {product.reference}</p></div><button className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fermer" onClick={onClose}><X size={18}/></button></div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-xs text-slate-500">Stock actuel</p><p className="mt-1 text-lg font-semibold text-slate-900">{product.stockPhysical}</p></div><div><p className="text-xs text-slate-500">Après ajustement</p><p className={`mt-1 text-lg font-semibold ${nextStock < 0 ? "text-rose-800" : "text-emerald-800"}`}>{nextStock}</p></div></div>
        <label className="block text-sm font-semibold text-slate-800">Variation <span className="font-normal text-slate-500">(utilisez un nombre négatif pour retirer)</span><input autoFocus type="number" step="1" value={variation} onChange={(event) => onVariation(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" aria-label="Variation du stock" required/></label>
        <label className="block text-sm font-semibold text-slate-800">Motif de l’ajustement<textarea value={reason} onChange={(event) => onReason(event.target.value)} minLength={5} maxLength={300} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" placeholder="Ex. Réception de 12 unités fournisseur…" required/><span className="mt-1 block text-right text-xs font-normal text-slate-500">{reason.length}/300 · 5 caractères minimum</span></label>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error.message}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={pending}>Annuler</button><button type="submit" disabled={pending || !Number.isInteger(amount) || amount === 0 || nextStock < 0 || reason.trim().length < 5} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">{pending ? <RefreshCw size={15} className="animate-spin"/> : <CheckCircle2 size={16}/>}Enregistrer le mouvement</button></div>
      </form>
    </section>
  </div>;
}

function PanelSkeleton() { return <div className="space-y-3 p-5" aria-label="Chargement"><div className="skeleton h-4 w-1/3 rounded"/><div className="skeleton h-10 rounded-lg"/><div className="skeleton h-10 rounded-lg"/></div>; }
function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) { return <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert"><p className="font-semibold">Impossible de charger ces données.</p><p className="mt-1">{error.message}</p><button className="mt-3 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100" onClick={onRetry}>Réessayer</button></div>; }
function EmptyPanel({ icon: Icon, text }: { icon: typeof ShoppingCart; text: string }) { return <div className="grid min-h-36 place-items-center px-5 py-8 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500"><Icon size={19}/></span><p className="mt-3 text-sm font-medium text-slate-700">{text}</p></div></div>; }
