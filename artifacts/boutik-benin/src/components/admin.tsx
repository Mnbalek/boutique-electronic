import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { AlertTriangle, BadgeCheck, CreditCard, Package, ShoppingBag, Users } from "lucide-react";

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

export default function AdminPage({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminFetch<ApiResult<AdminOverview>>("/api/admin/overview").then((result) => result.data), enabled: isAdmin });
  const orders = useQuery({ queryKey: ["admin-orders"], queryFn: () => adminFetch<ApiResult<AdminOrder[]>>("/api/admin/orders").then((result) => result.data), enabled: isAdmin });
  const products = useQuery({ queryKey: ["admin-products"], queryFn: () => adminFetch<ApiResult<AdminProduct[]>>("/api/admin/products").then((result) => result.data), enabled: isAdmin });
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

  if (!isAdmin) return <div className="rounded-xl border border-red-200 bg-white p-6" role="alert"><h1 className="font-display text-2xl font-semibold">Accès administrateur requis</h1><p className="mt-2 text-sm text-slate-600">Connectez-vous avec le compte administrateur pour ouvrir cet espace.</p></div>;

  const cards = overview.data ? [
    [ShoppingBag, "Commandes à payer", overview.data.ordersPendingPayment],
    [Package, "À préparer", overview.data.ordersToPrepare],
    [AlertTriangle, "Produits en stock faible", overview.data.lowStockProducts],
    [Users, "Comptes clients", overview.data.customers],
  ] as const : [];

  return <div className="space-y-7" data-testid="page-admin">
    <div><p className="eyebrow">Espace protégé</p><h1 className="font-display text-3xl font-semibold">Administration</h1><p className="mt-2 text-sm text-slate-600">Les paiements de cet environnement sont simulés. Aucun argent n’est encaissé.</p></div>
    {overview.isLoading ? <div className="skeleton h-24 w-full rounded-xl" aria-label="Chargement du tableau de bord"/> : overview.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900" role="alert">{(overview.error as Error).message}</p> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs de la boutique">{cards.map(([Icon, label, value]) => <article key={label} className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><Icon size={17}/>{label}</div><p className="mt-3 font-display text-2xl font-semibold">{value}</p></article>)}</section>
      <section className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Suivi commercial</h2><p className="mt-1 text-sm text-slate-600">Revenu des commandes confirmées, en préparation, expédiées ou livrées.</p></div><p className="text-lg font-semibold" data-testid="text-admin-revenue">{money(overview.data?.simulatedRevenueFCFA ?? 0)}</p></div><p className="mt-3 text-xs text-amber-900">Montant de démonstration : les commandes confirmées par simulation ne sont pas des paiements réels.</p></section>
    </>}
    <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Commandes récentes</h2><p className="mt-1 text-sm text-slate-600">Simule les issues de paiement à des fins de démonstration.</p></div><button className="btn btn-ghost btn-sm" onClick={() => void orders.refetch()} disabled={orders.isFetching}>Actualiser</button></div>
      {simulate.isError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{(simulate.error as Error).message}</p>}
      {advance.isError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{(advance.error as Error).message}</p>}
      {orders.isLoading ? <div className="skeleton mt-4 h-28 w-full rounded-lg" aria-label="Chargement des commandes"/> : orders.isError ? <p className="mt-4 text-sm text-red-800" role="alert">{(orders.error as Error).message}</p> : orders.data?.length ? <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Statut</th><th>Total</th><th>Paiement simulé</th><th>Traitement</th></tr></thead><tbody>{orders.data.map((order) => <tr key={order.id} data-testid={`admin-order-${order.id}`}><td className="font-semibold">{order.reference}</td><td>{order.firstName} {order.lastName}<span className="block text-xs text-slate-500">{order.email}</span></td><td>{date(order.createdAt)}</td><td>{order.status.replaceAll("_", " ")}</td><td>{money(order.totalFCFA)}</td><td>{order.status === "pending_payment" && (order.paymentStatus === "pending" || order.paymentStatus === "failed") ? <div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-xs" disabled={simulate.isPending} onClick={() => simulate.mutate({ id: order.id, outcome: "succeeded" })} data-testid={`button-simulate-paid-${order.id}`}><BadgeCheck size={14}/> Simuler payé</button><button className="btn btn-outline btn-xs" disabled={simulate.isPending} onClick={() => simulate.mutate({ id: order.id, outcome: "failed" })} data-testid={`button-simulate-failed-${order.id}`}><CreditCard size={14}/> Simuler refus</button></div> : order.paymentSimulation ? <span className="badge badge-success">simulation confirmée</span> : <span className="text-xs text-slate-500">{order.paymentStatus ?? "—"}</span>}</td><td>{order.status === "confirmed" || order.status === "preparing" || order.status === "shipped" ? <button className="btn btn-outline btn-xs" disabled={advance.isPending} onClick={() => advance.mutate(order.id)} data-testid={`button-advance-order-${order.id}`}>{order.status === "confirmed" ? "Préparer" : order.status === "preparing" ? "Expédier" : "Marquer livrée"}</button> : "—"}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Aucune commande pour le moment. Crée une commande depuis la boutique pour tester la simulation.</p>}
    </section>
    <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Stock des produits</h2><p className="mt-1 text-sm text-slate-600">Chaque ajustement doit avoir un motif et crée une entrée d’historique.</p></div><button className="btn btn-ghost btn-sm" onClick={() => void products.refetch()} disabled={products.isFetching}>Actualiser</button></div>
      {adjustStock.isError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{(adjustStock.error as Error).message}</p>}
      {products.isLoading ? <div className="skeleton mt-4 h-28 w-full rounded-lg" aria-label="Chargement des produits"/> : products.isError ? <p className="mt-4 text-sm text-red-800" role="alert">{(products.error as Error).message}</p> : <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Statut</th><th>Stock / seuil</th><th>Ajustement</th></tr></thead><tbody>{products.data?.map((product) => <ProductStockRow key={product.id} product={product} pending={adjustStock.isPending} onAdjust={async (variation, reason) => { await adjustStock.mutateAsync({ id: product.id, variation, reason }); }}/>)}</tbody></table></div>}
    </section>
    <p className="flex items-center gap-2 text-xs text-slate-500"><CreditCard size={14}/>Le bouton de simulation modifie l’état de démonstration de la commande, réserve/consomme le stock selon le résultat et inscrit l’action au journal d’audit.</p>
  </div>;
}

function ProductStockRow({ product, pending, onAdjust }: { product: AdminProduct; pending: boolean; onAdjust: (variation: number, reason: string) => Promise<void> }) {
  const [variation, setVariation] = useState("1");
  const [reason, setReason] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(variation);
    if (Number.isInteger(amount) && amount !== 0 && reason.trim().length >= 5) {
      try { await onAdjust(amount, reason.trim()); setReason(""); }
      catch { /* Keep the entered reason so the administrator can correct and retry. */ }
    }
  };
  return <tr data-testid={`admin-product-${product.id}`}><td><strong>{product.name}</strong><span className="block text-xs text-slate-500">{product.reference}</span></td><td>{product.categoryName}</td><td>{money(product.priceFCFA)}</td><td>{product.status}</td><td className={product.stockPhysical <= product.lowStockThreshold ? "font-semibold text-amber-800" : ""}>{product.stockPhysical} / {product.lowStockThreshold}</td><td><form onSubmit={submit} className="flex min-w-[260px] flex-wrap gap-2"><label className="sr-only" htmlFor={`stock-variation-${product.id}`}>Variation de stock</label><input id={`stock-variation-${product.id}`} aria-label={`Variation de stock ${product.name}`} type="number" step="1" value={variation} onChange={(event) => setVariation(event.target.value)} className="input input-bordered input-xs w-20"/><label className="sr-only" htmlFor={`stock-reason-${product.id}`}>Motif de l’ajustement</label><input id={`stock-reason-${product.id}`} aria-label={`Motif pour ${product.name}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} required placeholder="Motif (5 caractères min.)" className="input input-bordered input-xs min-w-36 flex-1"/><button disabled={pending || Number(variation) === 0} className="btn btn-outline btn-xs">Ajuster</button></form></td></tr>;
}
