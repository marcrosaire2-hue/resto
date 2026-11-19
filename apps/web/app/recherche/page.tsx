'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicCuisine, PublicProduct, PublicRestaurantCard } from '@plateforme/contracts';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { FilterSheet, SortKey } from '@/components/client/filter-sheet';
import { PlainHeader } from '@/components/client/plain-header';
import { RestaurantRow } from '@/components/client/restaurant-row';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon, IconSearch } from '@/components/ui';
import { fcfa, useApi } from '@/lib/use-api';

type SearchResult = { restaurants: PublicRestaurantCard[]; products: (PublicProduct & { restaurantName: string; restaurantSlug: string })[] };

/** Pastille de filtre : orange pleine quand elle est active, blanche sinon (maquette « Restaurants »). */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${on ? 'bg-brand text-white' : 'border border-line bg-white text-ink'}`}>
      {children}
    </button>
  );
}

/** Liste des restaurants (et recherche de plats) : filtres rapides, catégories, tri. */
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  // Terme transmis par la recherche de l'accueil (?q=…).
  useEffect(() => { const initial = new URLSearchParams(window.location.search).get('q'); if (initial) setQ(initial); }, []);
  const [tab, setTab] = useState<'restaurants' | 'plats'>('restaurants');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('popular');
  const [filters, setFilters] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cuisines = useApi<PublicCuisine[]>('/catalog/cuisines');
  const params = new URLSearchParams({ sort, ...(term ? { q: term } : {}), ...(cuisine ? { cuisine } : {}), ...(openOnly ? { open: '1' } : {}) });
  const restaurants = useApi<PublicRestaurantCard[]>(`/catalog/restaurants?${params}`);
  const global = useApi<SearchResult>(term.length >= 2 ? `/catalog/search?q=${encodeURIComponent(term)}` : null);
  const noFilter = !cuisine && !openOnly && sort === 'popular';
  const customized = openOnly || sort !== 'popular' && sort !== 'rating';

  return (
    <MobileScreen wide className="client-brand bg-white">
      <PlainHeader title="Restaurants" backHref="/accueil"
        right={(
          <button type="button" onClick={() => setFilters(true)} aria-label="Filtres et tri" className="relative grid size-11 place-items-center rounded-2xl border border-line bg-white">
            <AppIcon name="sliders-horizontal" className="size-5" />
            {customized && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-brand" aria-hidden />}
          </button>
        )} />
      <div className="desktop-search-tools mx-auto w-full max-w-[1100px] space-y-3 px-4 md:px-8">
        <label className="flex h-[50px] items-center gap-3 rounded-2xl bg-[#F3F3F5] px-4 ring-2 ring-transparent transition-shadow focus-within:bg-white focus-within:ring-brand/50">
          <IconSearch className="size-5 text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Restaurant, plat, quartier…" aria-label="Rechercher" enterKeyHint="search"
            className="bare-input h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Filtres rapides">
          <Pill on={noFilter} onClick={() => { setCuisine(null); setOpenOnly(false); setSort('popular'); }}>Tous</Pill>
          <Pill on={sort === 'rating'} onClick={() => setSort(sort === 'rating' ? 'popular' : 'rating')}>Mieux notés</Pill>
          <Pill on={openOnly} onClick={() => setOpenOnly(!openOnly)}>Ouverts</Pill>
          {cuisines.data?.map((c) => <Pill key={c.id} on={cuisine === c.id} onClick={() => setCuisine(cuisine === c.id ? null : c.id)}>{c.emoji} {c.name}</Pill>)}
        </div>
        <div role="tablist" className="grid grid-cols-2 rounded-xl bg-[#F3F3F5] p-1 text-sm font-semibold md:max-w-xs">
          {(['restaurants', 'plats'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={`h-9 rounded-[10px] capitalize transition-colors ${tab === k ? 'bg-white shadow-sm' : 'text-ink-muted'}`}>{k}</button>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-28 pt-4 md:px-8">
        {tab === 'restaurants' ? (
          restaurants.loading || !restaurants.data ? <LoadingBlock /> : restaurants.error ? <ErrorBlock error={restaurants.error} onRetry={restaurants.reload} />
            : restaurants.data.length === 0 ? <Empty /> : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {restaurants.data.map((r) => <li key={r.id} className="min-w-0"><RestaurantRow r={r} /></li>)}
              </ul>
            )
        ) : term.length < 2 ? (
          <p className="py-10 text-center text-sm text-ink-muted">Saisissez au moins 2 lettres pour chercher un plat.</p>
        ) : global.loading || !global.data ? <LoadingBlock /> : global.error ? <ErrorBlock error={global.error} onRetry={global.reload} />
          : global.data.products.length === 0 ? <Empty /> : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {global.data.products.map((p) => (
                <li key={p.id} className="min-w-0">
                  <Link href={`/plats/${p.id}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-2.5 shadow-[var(--shadow-card)] active:scale-[.99]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.imageUrls[0] ? <img src={p.imageUrls[0]} alt="" className="size-[72px] shrink-0 rounded-xl object-cover" /> : <span className="grid size-[72px] shrink-0 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>🍽️</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{p.name}</span>
                      <span className="block truncate text-xs text-ink-muted">{p.restaurantName}</span>
                      <span className="mt-1 block text-sm font-bold text-brand">{fcfa(p.basePrice)}</span>
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden><AppIcon name="plus" className="size-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </main>
      <FilterSheet open={filters} onClose={() => setFilters(false)} openOnly={openOnly} setOpenOnly={setOpenOnly} sort={sort} setSort={setSort} />
      <CustomerNavigation />
    </MobileScreen>
  );
}

function Empty() {
  return (
    <div className="py-12 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-3xl" aria-hidden>🔍</span>
      <p className="mt-3 font-bold">Aucun résultat</p>
      <p className="mt-1 text-sm text-ink-muted">Essayez un autre mot ou retirez des filtres.</p>
    </div>
  );
}
