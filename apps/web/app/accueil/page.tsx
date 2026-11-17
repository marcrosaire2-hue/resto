'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicCuisine, PublicProduct, PublicRestaurantCard } from '@plateforme/contracts';

interface HomeSection { type: string; title: string; banners?: { id: string; title: string; imageUrl: string | null; restaurantSlug: string }[]; dishes?: PublicProduct[] }
import { FilterSheet, SortKey } from '@/components/client/filter-sheet';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { RestaurantCard } from '@/components/client/restaurant-card';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon, IconCart, IconPin, IconSearch, Logo, Spinner } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/realtime';

/** Accueil client — maquette 1, écran 2, alimenté par le catalogue de l'API. */
export default function HomePage() {
  const { me, loading } = useSession();
  const router = useRouter();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filters, setFilters] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace(`/connexion?suite=${encodeURIComponent('/accueil')}`);
  }, [loading, me, router]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cuisines = useApi<PublicCuisine[]>(me ? '/catalog/cuisines' : null);
  const params = new URLSearchParams({ sort, ...(debounced ? { q: debounced } : {}), ...(cuisine ? { cuisine } : {}), ...(openOnly ? { open: '1' } : {}) });
  const restaurants = useApi<PublicRestaurantCard[]>(me ? `/catalog/restaurants?${params}` : null);
  // Contenus sponsorisés administrés (bannières, plats à la une) : affichés seulement s'ils existent réellement.
  const home = useApi<{ sections: HomeSection[] }>(me ? '/catalog/home' : null);
  const banners = home.data?.sections.find((x) => x.type === 'BANNERS');
  const dishes = home.data?.sections.find((x) => x.type === 'FEATURED_DISHES');
  const notifs = useApi<{ unread: number }>(me ? '/notifications' : null);
  useLive(me ? { type: 'user', id: me.id } : null, ['notification.new'], notifs.reload, 60_000);
  const unread = notifs.data?.unread ?? 0;
  if (loading || !me) {
    return <MobileScreen wide className="bg-canvas"><div className="grid flex-1 place-items-center text-brand"><Spinner /></div></MobileScreen>;
  }
  return (
    <MobileScreen wide className="bg-canvas">
      <div className="mx-auto w-full max-w-[1520px] space-y-5 px-4 pb-28 pt-5 md:space-y-8 md:px-10 md:pt-8">
        <div className="flex items-center gap-3">
          <Logo href="/accueil" className="shrink-0 md:!hidden" />
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="text-xl font-extrabold">{me ? `Bonjour ${me.fullName.split(' ')[0]} !` : 'Les bonnes tables de Cotonou'}</p>
            <p className="mt-0.5 text-sm text-ink-muted">Les saveurs locales, à portée de clic.</p>
          </div>
          <div className="min-w-0 flex-1 text-center md:flex-none md:text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted md:text-left">Livraison à</p>
            <Link href={me ? '/compte/adresses' : '/connexion?suite=/accueil'} className="inline-flex max-w-full items-center gap-1 text-[13px] font-bold">
              <IconPin className="size-4 shrink-0" />
              <span className="truncate">{me ? 'Ajouter une adresse' : 'Connectez-vous'}</span>
              <span aria-hidden>⌄</span>
            </Link>
          </div>
          <Link href={me ? '/notifications' : '/connexion?suite=/notifications'} aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
            className="relative grid size-11 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-card)]">
            <AppIcon name="bell" className="size-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </div>

        <section className="relative isolate min-h-[190px] overflow-hidden rounded-[26px] bg-[#19392d] p-5 text-white shadow-[0_16px_34px_rgb(38_52_42/0.18)] md:min-h-[340px] md:rounded-[36px] md:p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/plat-detail.jpg" alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-[55%] object-cover object-center opacity-80 md:w-[58%]" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#19392d] via-[#19392d]/90 to-[#19392d]/10" aria-hidden />
          <div className="absolute -right-9 -top-12 -z-10 size-40 rounded-full border border-white/15" aria-hidden />
          <div className="relative max-w-[72%] md:max-w-[480px]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#d8ef9b] md:text-xs">Les saveurs de Cotonou</p>
            <h1 className="mt-3 text-[25px] font-extrabold leading-[1.12] tracking-tight md:text-5xl">Une envie ?<br />On a l’adresse.</h1>
            <p className="mt-2 text-xs leading-relaxed text-white/75 md:mt-4 md:max-w-[380px] md:text-base">Parcourez les menus et trouvez votre prochain plat préféré.</p>
            <Link href="/recherche" className="mt-4 inline-flex h-10 items-center rounded-full bg-[#d8ef9b] px-4 text-xs font-extrabold text-[#26352c] transition-transform hover:scale-[1.03]">
              Explorer les menus <AppIcon name="arrow-up-right" className="ml-2 size-4" />
            </Link>
          </div>
          <span className="absolute bottom-4 right-4 grid size-11 place-items-center rounded-2xl border border-white/20 bg-white/15 text-2xl backdrop-blur-sm md:bottom-8 md:right-8 md:size-14" aria-hidden><AppIcon name="utensils" className="size-6 text-white" /></span>
        </section>

        <div className="flex gap-3">
          <label className="flex h-12 flex-1 items-center gap-2.5 rounded-2xl border border-line/70 bg-surface px-4 shadow-[var(--shadow-card)]">
            <IconSearch className="size-5" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un restaurant" aria-label="Rechercher un restaurant"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" />
          </label>
          <button type="button" onClick={() => setFilters(true)} aria-label="Filtres"
            className={`relative grid size-12 place-items-center rounded-2xl border border-line/70 shadow-[var(--shadow-card)] ${openOnly || sort !== 'popular' ? 'bg-brand text-white' : 'bg-surface'}`}>
            <AppIcon name="sliders-horizontal" className="size-5" />
          </button>
        </div>

        {!debounced && banners?.banners?.length ? (
          <section aria-label={banners.title} className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {banners.banners.map((b) => (
              <Link key={b.id} href={`/restaurants/${b.restaurantSlug}`} className="relative h-32 w-[85%] shrink-0 snap-start overflow-hidden rounded-[18px] bg-peach">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.imageUrl && <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-3 text-[15px] font-bold text-white">{b.title}</span>
                <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-semibold text-white">Sponsorisé</span>
              </Link>
            ))}
          </section>
        ) : null}

        {!debounced && dishes?.dishes?.length ? (
          <section className="rounded-[22px] border border-line/60 bg-surface p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-[15px] font-bold">{dishes.title}</h2>
            <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
              {dishes.dishes.map((d) => (
                <Link key={d.id} href={`/plats/${d.id}`} className="w-36 shrink-0">
                  <div className="relative h-24 overflow-hidden rounded-[12px] bg-peach">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {d.imageUrls[0] && <img src={d.imageUrls[0]} alt={d.name} className="h-full w-full object-cover" />}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[9px] font-semibold text-white">Sponsorisé</span>
                  </div>
                  <p className="mt-1 truncate text-[13px] font-semibold">{d.name}</p>
                  <p className="text-xs text-brand">{fcfa(d.basePrice)}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {(cuisines.data?.length ?? 0) > 0 && (
          <section className="rounded-[22px] bg-[#f1eadb] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Catégories populaires</h2>
              <Link href="/recherche" className="text-[13px] text-ink-muted">Voir tout</Link>
            </div>
            <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1">
              {cuisines.data!.map((c) => (
                <button key={c.id} type="button" onClick={() => setCuisine(cuisine === c.id ? null : c.id)} aria-pressed={cuisine === c.id}
                  className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className={`size-14 rounded-full object-cover ${cuisine === c.id ? 'ring-2 ring-brand' : ''}`} />
                  ) : (
                    <span className={`grid size-14 place-items-center rounded-full bg-surface text-2xl ${cuisine === c.id ? 'ring-2 ring-brand' : ''}`} aria-hidden>{c.emoji ?? '🍽️'}</span>
                  )}
                  <span className={`line-clamp-1 text-center text-[12px] ${cuisine === c.id ? 'font-bold text-brand' : 'font-medium'}`}>{c.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="relative overflow-hidden rounded-[22px]">
          <div className="relative p-0">
            <div className="flex items-end justify-between pb-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">À découvrir</p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight">Restaurants</h2>
              </div>
              <Link href="/recherche" className="rounded-full bg-surface px-3 py-2 text-xs font-bold text-brand shadow-[var(--shadow-card)]">Voir tout <span aria-hidden>→</span></Link>
            </div>
            {restaurants.loading ? <div className="rounded-[14px] bg-surface"><LoadingBlock /></div>
              : restaurants.error ? <ErrorBlock error={restaurants.error} onRetry={restaurants.reload} />
              : !restaurants.data ? <div className="rounded-[14px] bg-surface"><LoadingBlock /></div>
              : restaurants.data!.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-line bg-surface px-5 py-7 text-center shadow-[var(--shadow-card)]">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-2xl" aria-hidden>{debounced || cuisine || openOnly ? '🔎' : '🍽️'}</span>
                  <p className="mt-3 font-bold">{debounced || cuisine || openOnly ? 'Aucun résultat pour le moment' : 'De nouvelles adresses arrivent'}</p>
                  <p className="mx-auto mt-1 max-w-[250px] text-xs leading-relaxed text-ink-muted">
                    {debounced || cuisine || openOnly ? 'Essayez un autre mot-clé ou modifiez vos filtres.' : 'Explorez la recherche pour découvrir les restaurants et leurs menus.'}
                  </p>
                  <Link href="/recherche" className="mt-4 inline-flex h-10 items-center rounded-full bg-brand px-4 text-xs font-bold text-white">Découvrir les menus</Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">{restaurants.data!.map((r) => <RestaurantCard key={r.id} r={r} />)}</div>
              )}
          </div>
        </section>
      </div>

      <FilterSheet open={filters} onClose={() => setFilters(false)} openOnly={openOnly} setOpenOnly={setOpenOnly} sort={sort} setSort={setSort} />

      {cart.count > 0 && (
        <Link href="/panier" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex h-12 w-[calc(min(100%,430px)-2rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-[#19392d] px-5 text-sm font-bold text-white shadow-[0_10px_28px_rgb(38_52_42/0.24)] md:bottom-8 md:left-auto md:right-8 md:w-auto md:translate-x-0">
          <span className="inline-flex items-center gap-2"><IconCart className="size-5" /> Voir le panier ({cart.count})</span>
          <span>{fcfa(cart.subtotal)}</span>
        </Link>
      )}
      <CustomerNavigation />
    </MobileScreen>
  );
}
