import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Eye,
  Heart,
  LayoutDashboard,
  Menu,
  Package,
  RotateCw,
  Search,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Truck,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Votre sélection a été enregistrée.');
  const [retryCount, setRetryCount] = useState(0);
  const [activeSection, setActiveSection] = useState('fondations');
  const [liked, setLiked] = useState<string[]>([]);
  const [rowStatus, setRowStatus] = useState(['À traiter', 'Expédiée', 'À traiter']);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 3400);
  };

  const goTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleLike = (id: string) => {
    setLiked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Saisissez une adresse e-mail valide.');
      return;
    }
    setEmailError('');
    showToast('Adresse enregistrée pour la démonstration.');
  };

  const navItems = [
    { id: 'fondations', label: 'Fondations', icon: Sparkles },
    { id: 'actions', label: 'Actions & états', icon: SlidersHorizontal },
    { id: 'produits', label: 'Fiches produit', icon: ShoppingBag },
    { id: 'formulaires', label: 'Formulaires', icon: ClipboardList },
    { id: 'interfaces', label: 'Interfaces', icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-[100dvh] overflow-x-clip">
      <div className="bg-[#0B6B4F] px-4 py-2 text-center text-xs font-semibold tracking-wide text-white sm:text-sm" data-testid="text-demo-banner">
        APERÇU DU SYSTÈME · Exemples d’interface uniquement, aucune commande réelle
      </div>
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-[#F8FAFC]/95 backdrop-blur-sm">
        <div className="showcase-shell flex min-h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <a href="#haut" className="flex shrink-0 items-center gap-2.5 rounded-lg" data-testid="link-brand-home">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0B6B4F] text-[#F2B705]">
              <ShoppingBag size={19} strokeWidth={2.4} />
            </span>
            <span className="leading-tight">
              <span className="font-display block text-[15px] font-bold tracking-[-.04em] text-[#0F172A]">boutik<span className="text-[#0B6B4F]">.</span></span>
              <span className="block text-[10px] font-semibold uppercase tracking-[.15em] text-[#475569]">Bénin · système de design</span>
            </span>
          </a>
          <div className="hidden items-center gap-5 text-sm font-medium text-[#475569] md:flex">
            <a href="#produits" className="transition-colors hover:text-[#0B6B4F]" data-testid="link-header-shop">Boutique</a>
            <a href="#interfaces" className="transition-colors hover:text-[#0B6B4F]" data-testid="link-header-account">Mon compte</a>
            <button onClick={() => showToast('Votre panier de démonstration est vide.')} className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#0B6B4F]" aria-label="Ouvrir le panier" data-testid="button-header-cart">
              <ShoppingCart size={18} />
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F2B705] px-1 text-[10px] font-bold text-[#0F172A]">2</span>
            </button>
          </div>
          <button onClick={() => goTo('interfaces')} className="grid h-10 w-10 place-items-center rounded-lg border border-[#E2E8F0] bg-white md:hidden" aria-label="Voir les interfaces" data-testid="button-mobile-menu"><Menu size={19} /></button>
        </div>
      </header>

      <div id="haut" className="showcase-shell grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#E2E8F0] lg:block">
          <div className="sticky top-[68px] px-5 py-8">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#64748B]">Dans cette page</p>
            <nav className="space-y-1" aria-label="Navigation du showcase">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => goTo(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${activeSection === id ? 'bg-[#E5F2EE] text-[#0B6B4F]' : 'text-[#475569] hover:bg-white hover:text-[#0F172A]'}`} data-testid={`nav-section-${id}`}>
                  <Icon size={16} strokeWidth={1.8} />{label}
                </button>
              ))}
            </nav>
            <div className="mt-9 rounded-xl border border-[#E2E8F0] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#475569]">Version</span>
                <span className="rounded bg-[#F2B705]/25 px-2 py-1 text-[10px] font-bold text-[#644D00]">V1.2</span>
              </div>
              <p className="text-xs leading-5 text-[#475569]">Les briques de base pour un commerce simple et fiable.</p>
              <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#2E7D32]">
                <span className="h-2 w-2 rounded-full bg-[#2E7D32]" /> Système prêt à examiner
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 pb-20 pt-7 sm:px-6 sm:pt-10 lg:px-10 lg:pt-12">
          <div className="mb-10 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#475569]" data-testid="text-breadcrumb">
            <span>Accueil</span><span className="text-[#94A3B8]">/</span><span className="text-[#0B6B4F]">Système de composants</span>
          </div>
          <section id="fondations" className="section-anchor reveal mb-12">
            <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D6E9E2] bg-[#EAF5F1] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[#0B6B4F]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0B6B4F]" /> Base de marque · 01
                </div>
                <h1 className="font-display max-w-3xl text-[clamp(2.2rem,5.5vw,4.3rem)] font-semibold leading-[1.08] tracking-[-.065em] text-[#0F172A]" data-testid="text-page-title">
                  Acheter au Bénin,<br className="hidden sm:block" /> en toute confiance.
                </h1>
                <p className="mt-5 max-w-[640px] text-[15px] leading-7 text-[#475569] sm:text-base">
                  Les premiers repères visuels de Boutik Bénin : utiles, accessibles et pensés pour vos usages, du téléphone à l’espace de gestion.
                </p>
              </div>
              <div className="flex flex-col gap-3 rounded-xl bg-[#0B6B4F] p-5 text-white sm:flex-row sm:items-center xl:flex-col xl:items-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#F2B705]"><Sparkles size={19} /></div>
                <div>
                  <p className="font-display text-sm font-semibold">Le cap de cette première étape</p>
                  <p className="mt-1 text-xs leading-5 text-white/80">Valider les composants et les interfaces avant la construction de la boutique.</p>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Couleur principale', value: '#0B6B4F', color: '#0B6B4F' },
                { label: 'Accent', value: '#F2B705', color: '#F2B705' },
                { label: 'Texte', value: '#0F172A', color: '#0F172A' },
                { label: 'Surface', value: '#F8FAFC', color: '#F8FAFC' },
              ].map((swatch) => (
                <div key={swatch.value} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
                  <span className="h-9 w-9 shrink-0 rounded-lg border border-black/10" style={{ backgroundColor: swatch.color }} />
                  <span className="min-w-0"><span className="block break-words text-[10px] leading-tight font-semibold text-[#475569]">{swatch.label}</span><span className="font-mono text-xs font-semibold text-[#0F172A]">{swatch.value}</span></span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-[#E2E8F0] pb-7 text-xs text-[#475569]">
              <span><strong className="text-[#0F172A]">Sora</strong> pour les titres</span>
              <span><strong className="text-[#0F172A]">Inter</strong> pour la lecture</span>
              <span><strong className="text-[#0F172A]">4 px</strong> grille d’espacement</span>
              <span><strong className="text-[#0F172A]">AA</strong> contraste visé</span>
            </div>
          </section>

          <section id="actions" className="section-anchor mb-12">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B6B4F]">01 / Interaction</p><h2 className="font-display text-2xl font-semibold tracking-[-.04em]">Actions & retours</h2></div>
              <span className="text-xs text-[#475569]">Chaque geste appelle une réponse claire.</span>
            </div>
            <div className="showcase-grid">
              <div className="showcase-panel span-7 p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Boutons</h3><span className="text-[11px] text-[#64748B]">Contrôles · 44 px minimum conseillé</span></div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => showToast('Action principale sélectionnée.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B6B4F] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#09583F]" data-testid="button-primary">Continuer <ArrowRight size={16} /></button>
                  <button onClick={() => showToast('Votre choix a été pris en compte.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] hover:border-[#0B6B4F]" data-testid="button-secondary">En savoir plus <ArrowUpRight size={15} /></button>
                  <button onClick={() => showToast('Préférence mise à jour.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#F2B705] px-4 text-sm font-semibold text-[#0F172A] hover:bg-[#DDA800]" data-testid="button-accent">Enregistrer <Check size={16} /></button>
                  <button onClick={() => showToast('Aucune modification effectuée.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]" data-testid="button-quiet">Annuler</button>
                  <button disabled className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg bg-[#E2E8F0] px-4 text-sm font-semibold text-[#64748B]" data-testid="button-disabled">Indisponible</button>
                </div>
              </div>
              <div className="showcase-panel span-5 p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Badges d’état</h3><Tag size={16} className="text-[#64748B]" /></div>
                <div className="flex flex-wrap gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EAF5F1] px-2.5 py-1.5 text-xs font-semibold text-[#0B6B4F]"><CheckCircle2 size={14} /> Disponible</span>
                  <span className="inline-flex items-center rounded-md bg-[#FFF5CC] px-2.5 py-1.5 text-xs font-semibold text-[#604900]">Offre du moment</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FCE9E9] px-2.5 py-1.5 text-xs font-semibold text-[#A31F1F]"><XCircle size={14} /> Épuisé</span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#EAF1FC] px-2.5 py-1.5 text-xs font-semibold text-[#124F99]"><Truck size={14} /> En livraison</span>
                  <span className="inline-flex items-center rounded-md border border-[#E2E8F0] px-2.5 py-1.5 text-xs font-semibold text-[#475569]">Brouillon</span>
                </div>
              </div>
              <div className="showcase-panel span-6 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Notifications</h3><Bell size={16} className="text-[#64748B]" /></div>
                <div className="flex items-start gap-3 rounded-lg border border-[#B6DDCC] bg-[#F0F8F4] p-4" role="status" data-testid="status-success">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#2E7D32]" size={18} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#185C2C]">C’est bien noté.</p><p className="mt-1 text-xs leading-5 text-[#355E43]">Votre demande a été enregistrée pour la démonstration.</p></div>
                  <button onClick={() => showToast('Notification fermée.')} aria-label="Fermer la notification" className="rounded p-1 text-[#475569] hover:bg-[#DDEDE4]" data-testid="button-dismiss-notice"><X size={15} /></button>
                </div>
                <button onClick={() => showToast('Votre sélection a été enregistrée.')} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#0B6B4F] hover:underline" data-testid="button-show-toast">Afficher une notification <ArrowRight size={14} /></button>
              </div>
              <div className="showcase-panel span-6 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Chargement de contenu</h3><span className="text-[11px] text-[#64748B]">Squelettes</span></div>
                <div className="flex gap-4">
                  <div className="skeleton h-[86px] w-[90px] shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col justify-center gap-2.5"><div className="skeleton h-3 w-2/3 rounded" /><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-1/3 rounded" /></div>
                </div>
                <div className="mt-4 flex items-center gap-2"><div className="skeleton h-7 w-7 rounded-full" /><div className="skeleton h-3 w-24 rounded" /></div>
              </div>
              <div className="showcase-panel span-6 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-sm font-semibold">Erreur avec reprise</h3><CircleHelp size={16} className="text-[#64748B]" /></div>
                <div className="rounded-lg border border-[#F0C7C7] bg-[#FFF8F7] p-4" role="alert" data-testid="status-error">
                  <div className="flex gap-3"><XCircle size={18} className="mt-0.5 shrink-0 text-[#C62828]" /><div><p className="text-sm font-semibold text-[#8F1D1D]">Impossible de charger les éléments.</p><p className="mt-1 text-xs leading-5 text-[#475569]">Vérifiez votre connexion, puis réessayez.</p></div></div>
                  <button onClick={() => setRetryCount((count) => count + 1)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-[#C62828]/30 bg-white px-3 text-xs font-semibold text-[#A31F1F] hover:bg-[#FCE9E9]" data-testid="button-retry"><RotateCw size={14} /> Réessayer{retryCount > 0 ? ` · ${retryCount}` : ''}</button>
                </div>
              </div>
              <div className="showcase-panel span-6 flex flex-col justify-center p-5 sm:p-6">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#EAF5F1] text-[#0B6B4F]"><Package size={21} /></span>
                  <div><h3 className="font-display text-sm font-semibold">Votre liste est vide</h3><p className="mt-1 text-xs leading-5 text-[#475569]">Les articles que vous enregistrerez apparaîtront ici.</p></div>
                </div>
                <button onClick={() => goTo('produits')} className="mt-4 inline-flex items-center gap-2 self-start text-xs font-semibold text-[#0B6B4F] hover:underline" data-testid="button-empty-action">Découvrir les exemples <ArrowRight size={14} /></button>
              </div>
            </div>
          </section>

          <section id="produits" className="section-anchor mb-12">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B6B4F]">02 / Commerce</p><h2 className="font-display text-2xl font-semibold tracking-[-.04em]">Fiches produit</h2></div>
              <span className="rounded-full bg-[#FFF5CC] px-3 py-1.5 text-[11px] font-semibold text-[#604900]">Données de démonstration</span>
            </div>
            <div className="showcase-grid">
              {[
                { id: 'sac', name: 'Sac tissé Ébène', category: 'Accessoires · Atelier local', price: '18 500', oldPrice: '22 000', image: '/products/tote.jpg', badge: '−16 %', stock: true },
                { id: 'lampe', name: 'Lampe Sèmè', category: 'Maison · Édition courte', price: '34 000', oldPrice: '', image: '/products/lamp.jpg', badge: 'Nouveau', stock: true },
                { id: 'enceinte', name: 'Enceinte Kora Mini', category: 'Électronique · Audio', price: '27 900', oldPrice: '', image: '/products/speaker.jpg', badge: 'Épuisé', stock: false },
              ].map((product) => (
                <article key={product.id} className="showcase-panel span-4 group overflow-hidden" data-testid={`card-product-${product.id}`}>
                  <div className="product-art relative">
                    <img src={product.image} alt={product.name} loading="lazy" data-testid={`img-product-${product.id}`} />
                    <span className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-[11px] font-bold ${product.stock ? (product.oldPrice ? 'bg-[#F2B705] text-[#0F172A]' : 'bg-white text-[#0F172A]') : 'bg-[#C62828] text-white'}`}>{product.badge}</span>
                    <button onClick={() => toggleLike(product.id)} aria-label={liked.includes(product.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 transition-colors ${liked.includes(product.id) ? 'text-[#C62828]' : 'text-[#475569] hover:text-[#C62828]'}`} data-testid={`button-favorite-${product.id}`}><Heart size={17} fill={liked.includes(product.id) ? 'currentColor' : 'none'} /></button>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#64748B]">{product.category}</p>
                    <h3 className="font-display mt-1.5 text-base font-semibold tracking-[-.03em] text-[#0F172A]">{product.name}</h3>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-display text-lg font-bold text-[#0B6B4F]" data-testid={`text-price-${product.id}`}>{product.price} FCFA</span>{product.oldPrice && <del className="text-xs text-[#64748B]">{product.oldPrice} FCFA</del>}</div>
                    <button onClick={() => product.stock ? showToast(`${product.name} ajouté à votre panier de démonstration.`) : showToast('Cet article est momentanément indisponible.')} disabled={!product.stock} className={`mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${product.stock ? 'bg-[#0B6B4F] text-white hover:bg-[#09583F]' : 'cursor-not-allowed bg-[#E2E8F0] text-[#64748B]'}`} data-testid={`button-add-${product.id}`}>
                      {product.stock ? <><ShoppingCart size={15} /> Ajouter au panier</> : <>Indisponible <ArrowDown size={14} /></>}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="formulaires" className="section-anchor mb-12">
            <div className="mb-5"><p className="mb-1 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B6B4F]">03 / Saisie</p><h2 className="font-display text-2xl font-semibold tracking-[-.04em]">Champs & formulaires</h2></div>
            <div className="showcase-grid">
              <div className="showcase-panel span-7 p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-display text-sm font-semibold">Coordonnées de livraison</h3><p className="mt-1 text-xs text-[#475569]">Exemple de formulaire, sans envoi réel.</p></div><span className="rounded bg-[#F1F5F9] px-2 py-1 text-[10px] font-semibold text-[#475569]">Étape 1 sur 2</span></div>
                <form onSubmit={submitEmail} noValidate className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#0F172A]">Nom complet <span className="text-[#C62828]">*</span></span><input required type="text" placeholder="Ex. : Aïcha Houndjo" className="min-h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0B6B4F] focus:outline-none" data-testid="input-full-name" /><span className="mt-1 block text-[10px] text-[#64748B]">Comme indiqué sur votre pièce d’identité.</span></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#0F172A]">Téléphone <span className="text-[#C62828]">*</span></span><span className="flex min-h-11 items-center rounded-lg border border-[#CBD5E1] bg-white focus-within:border-[#0B6B4F]"><span className="border-r border-[#E2E8F0] px-3 text-xs font-semibold text-[#475569]">+229</span><input required type="tel" inputMode="tel" placeholder="01 90 00 00 00" className="w-full min-w-0 bg-transparent px-3 text-sm outline-none placeholder:text-[#94A3B8]" data-testid="input-phone" /></span></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#0F172A]">Adresse e-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="vous@exemple.bj" aria-invalid={!!emailError} className={`min-h-11 w-full rounded-lg border bg-white px-3 text-sm placeholder:text-[#94A3B8] focus:outline-none ${emailError ? 'border-[#C62828] focus:border-[#C62828]' : 'border-[#CBD5E1] focus:border-[#0B6B4F]'}`} data-testid="input-email" />{emailError && <span className="mt-1 block text-xs font-medium text-[#A31F1F]" data-testid="text-email-error">{emailError}</span>}</label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#0F172A]">Ville</span><span className="relative block"><select defaultValue="" className="min-h-11 w-full appearance-none rounded-lg border border-[#CBD5E1] bg-white px-3 pr-9 text-sm text-[#0F172A] focus:border-[#0B6B4F] focus:outline-none" data-testid="select-city"><option value="" disabled>Choisir une ville</option><option>Cotonou</option><option>Porto-Novo</option><option>Parakou</option><option>Abomey-Calavi</option></select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]" /></span></label>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B6B4F] px-4 text-sm font-semibold text-white hover:bg-[#09583F]" data-testid="button-submit-form">Valider l’adresse <ArrowRight size={15} /></button><button type="button" onClick={() => { setEmail(''); setEmailError(''); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]" data-testid="button-reset-form">Effacer</button></div>
                </form>
              </div>
              <div className="showcase-panel span-5 flex flex-col justify-between bg-[#F0F8F4] p-5 sm:p-6">
                <div><span className="mb-5 grid h-11 w-11 place-items-center rounded-lg bg-white text-[#0B6B4F]"><Truck size={20} /></span><h3 className="font-display text-lg font-semibold tracking-[-.03em]">Votre commande, sans surprise.</h3><p className="mt-2 text-sm leading-6 text-[#475569]">Les informations utiles restent visibles au bon moment, avec des libellés simples et un retour immédiat en cas d’erreur.</p></div>
                <div className="mt-8 border-t border-[#CEE2D8] pt-4"><div className="flex items-center justify-between text-xs"><span className="text-[#475569]">Frais de livraison</span><span className="font-semibold text-[#0F172A]">Calculés avant paiement</span></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-[#475569]">Paiement</span><span className="inline-flex items-center gap-1.5 font-semibold text-[#0F172A]"><CreditCard size={14} /> Sécurisé</span></div></div>
              </div>
            </div>
          </section>

          <section id="interfaces" className="section-anchor mb-12">
            <div className="mb-5"><p className="mb-1 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B6B4F]">04 / Systèmes d’écran</p><h2 className="font-display text-2xl font-semibold tracking-[-.04em]">Trois espaces, une même marque</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#475569]">Des structures distinctes selon le besoin : découvrir, suivre, piloter.</p></div>
            <div className="showcase-grid">
              <article className="showcase-panel span-4 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3"><div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]"><ShoppingBag size={15} className="text-[#0B6B4F]" /> Boutik Bénin</div><div className="flex gap-3 text-[10px] font-medium text-[#475569]"><span>Accueil</span><span>Rayons</span></div></div>
                <div className="bg-[#F3F6F4] p-4"><div className="rounded-lg bg-[#0B6B4F] p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#F2B705]">Espace public</p><h3 className="font-display mt-2 text-lg font-semibold leading-tight">Le bon choix,<br />tout près de vous.</h3><button onClick={() => goTo('produits')} className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-white" data-testid="button-public-shop">Voir les sélections <ArrowRight size={13} /></button></div><div className="mt-3 flex items-center gap-3 rounded-lg bg-white p-3"><div className="h-10 w-10 rounded-md bg-[#F2EDE3]" /><div><p className="text-xs font-semibold">Trouver un article</p><p className="mt-1 text-[10px] text-[#64748B]">Rechercher dans la boutique</p></div><Search size={15} className="ml-auto text-[#64748B]" /></div></div>
                <div className="px-4 py-3 text-[10px] font-medium text-[#64748B]">Navigation visible · Découverte directe</div>
              </article>
              <article className="showcase-panel span-4 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3"><div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]"><UserRound size={15} className="text-[#0B6B4F]" /> Mon espace</div><span className="text-[10px] text-[#64748B]">Bonjour, Aïcha</span></div>
                <div className="bg-[#F3F6F4] p-4"><p className="font-display text-sm font-semibold">Ravi de vous revoir.</p><div className="mt-3 space-y-2"><div className="flex items-center gap-3 rounded-lg bg-white p-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-[#EAF5F1] text-[#0B6B4F]"><Package size={15} /></span><span className="flex-1"><span className="block text-[11px] font-semibold">Commande BB-2048</span><span className="text-[10px] text-[#64748B]">En préparation</span></span><ArrowRight size={14} className="text-[#64748B]" /></div><div className="flex items-center gap-3 rounded-lg bg-white p-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-[#FFF5CC] text-[#765A00]"><Heart size={15} /></span><span className="flex-1 text-[11px] font-semibold">Mes favoris</span><span className="text-[10px] text-[#64748B]">3</span></div></div></div>
                <div className="px-4 py-3 text-[10px] font-medium text-[#64748B]">Suivi · Préférences · Historique</div>
              </article>
              <article className="showcase-panel span-4 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3"><div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]"><LayoutDashboard size={15} className="text-[#0B6B4F]" /> Gestion Boutik</div><Settings2 size={15} className="text-[#64748B]" /></div>
                <div className="flex min-h-[190px] bg-[#F3F6F4]">
                  <div className="w-[76px] shrink-0 space-y-3 border-r border-[#E2E8F0] bg-white p-3"><span className="block h-5 rounded bg-[#EAF5F1]" /><span className="block h-2 rounded bg-[#E2E8F0]" /><span className="block h-2 rounded bg-[#E2E8F0]" /><span className="block h-2 rounded bg-[#E2E8F0]" /></div>
                  <div className="min-w-0 flex-1 p-3"><div className="flex items-center justify-between"><span className="font-display text-[11px] font-semibold">Vue d’ensemble</span><span className="rounded bg-[#FFF5CC] px-1.5 py-1 text-[8px] font-bold text-[#604900]">GESTION</span></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-md bg-white p-2"><span className="text-[8px] text-[#64748B]">Commandes</span><strong className="mt-1 block text-sm">08</strong></div><div className="rounded-md bg-white p-2"><span className="text-[8px] text-[#64748B]">À traiter</span><strong className="mt-1 block text-sm text-[#0B6B4F]">03</strong></div></div><div className="mt-2 h-10 rounded-md bg-white p-2"><span className="block h-1.5 w-1/2 rounded bg-[#E2E8F0]" /><span className="mt-2 block h-1.5 w-4/5 rounded bg-[#E2E8F0]" /></div></div>
                </div>
                <div className="px-4 py-3 text-[10px] font-medium text-[#64748B]">Navigation latérale · Densité maîtrisée</div>
              </article>
            </div>
          </section>

          <section className="mb-12">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B6B4F]">05 / Gestion</p><h2 className="font-display text-2xl font-semibold tracking-[-.04em]">Tableau de commandes</h2></div><button onClick={() => showToast('Export préparé pour la démonstration.')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:border-[#0B6B4F]" data-testid="button-export"><ArrowDown size={14} /> Exporter</button></div>
            <div className="showcase-panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-4 sm:px-5"><div><h3 className="font-display text-sm font-semibold">Commandes récentes</h3><p className="mt-1 text-xs text-[#64748B]">Exemples de lignes et de statuts.</p></div><button onClick={() => showToast('Filtres de démonstration ouverts.')} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]" data-testid="button-filter"><SlidersHorizontal size={14} /> Filtrer</button></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] border-collapse text-left text-xs">
                  <thead><tr className="bg-[#F8FAFC] text-[10px] uppercase tracking-[.08em] text-[#64748B]"><th className="px-5 py-3 font-semibold">Référence</th><th className="px-4 py-3 font-semibold">Client</th><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Montant</th><th className="px-4 py-3 font-semibold">Statut</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead>
                  <tbody>
                    {[
                      { ref: 'BB-2048', customer: 'Aïcha Houndjo', date: '12 mai 2025', price: '42 500 FCFA' },
                      { ref: 'BB-2047', customer: 'Pauline Dossou', date: '11 mai 2025', price: '18 500 FCFA' },
                      { ref: 'BB-2046', customer: 'Yannick Soglo', date: '10 mai 2025', price: '34 000 FCFA' },
                    ].map((order, index) => (
                      <tr key={order.ref} className="border-t border-[#E2E8F0]">
                        <td className="px-5 py-4 font-semibold text-[#0F172A]" data-testid={`text-order-${order.ref}`}>{order.ref}</td><td className="px-4 py-4 text-[#475569]">{order.customer}</td><td className="px-4 py-4 text-[#475569]">{order.date}</td><td className="px-4 py-4 font-semibold text-[#0F172A]">{order.price}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${rowStatus[index] === 'Expédiée' ? 'bg-[#EAF1FC] text-[#124F99]' : 'bg-[#FFF5CC] text-[#604900]'}`}>{rowStatus[index]}</span></td>
                        <td className="px-4 py-4 text-right"><button onClick={() => setRowStatus((statuses) => statuses.map((status, row) => row === index ? (status === 'Expédiée' ? 'À traiter' : 'Expédiée') : status))} aria-label={`Modifier le statut de ${order.ref}`} className="rounded p-1.5 text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0B6B4F]" data-testid={`button-order-action-${index}`}><Eye size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] px-5 py-3 text-[11px] text-[#64748B]"><span>3 résultats de démonstration</span><button onClick={() => showToast('Toutes les commandes de démonstration sont affichées.')} className="inline-flex items-center gap-1 font-semibold text-[#0B6B4F]" data-testid="button-view-all">Voir tout <ArrowRight size={13} /></button></div>
            </div>
          </section>

          <section className="mb-12">
            <div className="showcase-panel flex flex-col gap-5 bg-[#F2B705] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div><span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#604900]">La suite, ensemble</span><h2 className="font-display mt-2 text-xl font-semibold tracking-[-.04em] text-[#0F172A]">Un premier regard, avant le premier achat.</h2><p className="mt-1 max-w-lg text-sm leading-6 text-[#3F3513]">Cette étape sert à valider les repères visuels. La boutique complète viendra ensuite.</p></div>
              <button onClick={() => goTo('fondations')} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white hover:bg-[#253247]" data-testid="button-back-to-top">Revoir les fondations <ArrowUpRight size={16} /></button>
            </div>
          </section>

          <footer className="flex flex-col justify-between gap-3 border-t border-[#E2E8F0] py-6 text-xs text-[#64748B] sm:flex-row sm:items-center">
            <span className="font-display font-semibold text-[#0F172A]">boutik<span className="text-[#0B6B4F]">.</span> <span className="font-sans font-normal text-[#64748B]">Bénin · Phase 1</span></span>
            <span>Un système de design pour une expérience de commerce plus simple.</span>
          </footer>
        </main>
      </div>
      {toastVisible && <div className="toast-enter fixed bottom-5 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-[#B6DDCC] bg-white p-4 text-sm text-[#0F172A] sm:right-6" role="status" data-testid="toast-notification"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EAF5F1] text-[#2E7D32]"><Check size={16} /></span><span className="max-w-[260px] font-medium">{toastMessage}</span><button onClick={() => setToastVisible(false)} className="ml-1 rounded p-1 text-[#64748B] hover:bg-[#F1F5F9]" aria-label="Fermer" data-testid="button-dismiss-toast"><X size={15} /></button></div>}
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
