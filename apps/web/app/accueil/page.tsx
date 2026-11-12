'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicCuisine, PublicProduct, PublicRestaurantCard } from '@plateforme/contracts';

interface HomeSection { type: string; title: string; banners?: { id: string; title: string; imageUrl: string | null; restaurantSlug: string }[]; dishes?: PublicProduct[] }
import { FilterSheet, SortKey } from '@/components/client/filter-sheet';
import { RestaurantCard } from '@/components/client/restaurant-card';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { IconCart, IconPin, IconSearch, IconUser } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/realtime';

/** Accueil client — maquette 1, écran 2, alimenté par le catalogue de l'API. */
export default function HomePage() {
  const { me } = useSession();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filters, setFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cuisines = useApi<PublicCuisine[]>('/catalog/cuisines');
  const params = new URLSearchParams({ sort, ...(debounced ? { q: debounced } : {}), ...(cuisine ? { cuisine } : {}), ...(openOnly ? { open: '1' } : {}) });
  const restaurants = useApi<PublicRestaurantCard[]>(`/catalog/restaurants?${params}`);
  // Contenus sponsorisés administrés (bannières, plats à la une) : affichés seulement s'ils existent réellement.
  const home = useApi<{ sections: HomeSection[] }>('/catalog/home');
  const banners = home.data?.sections.find((x) => x.type === 'BANNERS');
  const dishes = home.data?.sections.find((x) => x.type === 'FEATURED_DISHES');
  const notifs = useApi<{ unread: number }>(me ? '/notifications' : null);
  useLive(me ? { type: 'user', id: me.id } : null, ['notification.new'], notifs.reload, 60_000);
  const unread = notifs.data?.unread ?? 0;
  const initials = me?.fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <MobileScreen className="bg-header-peach">
      <div className="space-y-4 px-4 pb-24 pt-5">
        <div className="flex items-center gap-3">
          <Link href={me ? '/compte' : '/connexion?suite=/accueil'} aria-label="Mon compte"
            className="grid size-12 place-items-center overflow-hidden rounded-[14px] bg-surface font-bold text-brand shadow-[0_2px_10px_rgb(32_33_36/0.08)]">
            {initials ?? <IconUser />}
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-xs text-ink-muted">Adresse de livraison</p>
            <Link href={me ? '/compte' : '/connexion?suite=/accueil'} className="inline-flex max-w-full items-center gap-1 text-[14px] font-semibold">
              <IconPin className="size-4 shrink-0" />
              <span className="truncate">{me ? 'Ajouter une adresse' : 'Connectez-vous'}</span>
              <span aria-hidden>⌄</span>
            </Link>
          </div>
          <Link href={me ? '/notifications' : '/connexion?suite=/notifications'} aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
            className="relative grid size-12 place-items-center rounded-[14px] bg-surface shadow-[0_2px_10px_rgb(32_33_36/0.08)]">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" /></svg>
            {unread > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </div>

        <div className="flex gap-3">
          <label className="flex h-12 flex-1 items-center gap-2.5 rounded-[14px] bg-surface px-4">
            <IconSearch className="size-5" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un restaurant" aria-label="Rechercher un restaurant"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" />
          </label>
          <button type="button" onClick={() => setFilters(true)} aria-label="Filtres"
            className={`relative grid size-12 place-items-center rounded-[14px] ${openOnly || sort !== 'popular' ? 'bg-brand text-white' : 'bg-surface'}`}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
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
          <section className="rounded-[18px] bg-surface p-4">
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
          <section className="rounded-[18px] bg-peach-card p-4">
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

        <section className="relative overflow-hidden rounded-[18px] bg-surface">
          <div className="absolute inset-x-0 top-0 h-[140px] bg-section-orange" aria-hidden />
          <div className="relative p-3">
            <div className="flex items-center justify-between px-1 pb-3 pt-1 text-white">
              <h2 className="text-[15px] font-bold">Restaurants</h2>
              <Link href="/recherche" className="text-[13px] text-white/90">Voir tout</Link>
            </div>
            {restaurants.loading ? <div className="rounded-[14px] bg-surface"><LoadingBlock /></div>
              : restaurants.error ? <ErrorBlock error={restaurants.error} onRetry={restaurants.reload} />
              : restaurants.data!.length === 0 ? (
                <p className="rounded-[14px] bg-canvas p-6 text-center text-sm text-ink-muted">
                  {debounced || cuisine || openOnly ? 'Aucun restaurant ne correspond à votre recherche.' : 'Les restaurants partenaires arrivent bientôt.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">{restaurants.data!.map((r) => <RestaurantCard key={r.id} r={r} />)}</div>
              )}
          </div>
        </section>
      </div>

      <FilterSheet open={filters} onClose={() => setFilters(false)} openOnly={openOnly} setOpenOnly={setOpenOnly} sort={sort} setSort={setSort} />

      {cart.count > 0 && (
        <Link href="/panier" className="fixed bottom-4 left-1/2 z-20 flex h-14 w-[calc(min(100%,430px)-2rem)] -translate-x-1/2 items-center justify-between rounded-[14px] bg-cta px-5 font-semibold text-white shadow-[var(--shadow-raised)]">
          <span className="inline-flex items-center gap-2"><IconCart className="size-5" /> Voir le panier ({cart.count})</span>
          <span>{fcfa(cart.subtotal)}</span>
        </Link>
      )}
    </MobileScreen>
  );
}
