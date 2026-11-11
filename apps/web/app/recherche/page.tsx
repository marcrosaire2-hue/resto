'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PublicCuisine, PublicProduct, PublicRestaurantCard } from '@plateforme/contracts';
import { PlainHeader } from '@/components/client/plain-header';
import { FilterSheet, SORT_LABELS, SortKey } from '@/components/client/filter-sheet';
import { RestaurantCard } from '@/components/client/restaurant-card';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { Chip, IconSearch } from '@/components/ui';
import { fcfa, useApi } from '@/lib/use-api';

type SearchResult = { restaurants: PublicRestaurantCard[]; products: (PublicProduct & { restaurantName: string; restaurantSlug: string })[] };

/** Recherche : restaurants, plats, catégories — avec filtres, tri et état vide. */
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
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

  return (
    <MobileScreen className="bg-surface">
      <PlainHeader title="Rechercher" backHref="/accueil" />
      <div className="space-y-3 px-4">
        <div className="flex gap-3">
          <label className="flex h-12 flex-1 items-center gap-2.5 rounded-[14px] border border-line px-4">
            <IconSearch className="size-5" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Restaurant, plat, quartier…" aria-label="Rechercher"
              className="h-full w-full bg-transparent text-sm outline-none" />
          </label>
          <button type="button" onClick={() => setFilters(true)} className="h-12 rounded-[14px] border border-line px-3 text-sm font-semibold">Filtres</button>
        </div>
        <p className="text-xs text-ink-muted">Tri : {SORT_LABELS[sort]}{openOnly ? ' · ouverts maintenant' : ''}</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip selected={!cuisine} onClick={() => setCuisine(null)}>Toutes</Chip>
          {cuisines.data?.map((c) => <Chip key={c.id} selected={cuisine === c.id} onClick={() => setCuisine(c.id)}>{c.emoji} {c.name}</Chip>)}
        </div>
        <div role="tablist" className="grid grid-cols-2 rounded-[12px] bg-canvas p-1 text-sm font-semibold">
          {(['restaurants', 'plats'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={`h-10 rounded-[10px] capitalize ${tab === k ? 'bg-surface shadow' : 'text-ink-muted'}`}>{k}</button>
          ))}
        </div>
      </div>
      <main className="flex-1 px-4 py-4">
        {tab === 'restaurants' ? (
          restaurants.loading ? <LoadingBlock /> : restaurants.error ? <ErrorBlock error={restaurants.error} onRetry={restaurants.reload} />
            : restaurants.data!.length === 0 ? <Empty /> : <div className="grid grid-cols-2 gap-3">{restaurants.data!.map((r) => <RestaurantCard key={r.id} r={r} />)}</div>
        ) : term.length < 2 ? (
          <p className="py-10 text-center text-sm text-ink-muted">Saisissez au moins 2 lettres pour chercher un plat.</p>
        ) : global.loading ? <LoadingBlock /> : global.error ? <ErrorBlock error={global.error} onRetry={global.reload} />
          : global.data!.products.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-line">
              {global.data!.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/plats/${p.id}`} className="flex gap-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.imageUrls[0] ? <img src={p.imageUrls[0]} alt="" className="size-16 rounded-[10px] object-cover" /> : <span className="size-16 rounded-[10px] bg-peach" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-ink-muted">{p.restaurantName}</p>
                      <p className="text-sm font-semibold text-brand">{fcfa(p.basePrice)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </main>
      <FilterSheet open={filters} onClose={() => setFilters(false)} openOnly={openOnly} setOpenOnly={setOpenOnly} sort={sort} setSort={setSort} />
    </MobileScreen>
  );
}

function Empty() {
  return (
    <div className="py-12 text-center">
      <p className="text-4xl" aria-hidden>🔍</p>
      <p className="mt-2 font-semibold">Aucun résultat</p>
      <p className="text-sm text-ink-muted">Essayez un autre mot ou retirez des filtres.</p>
    </div>
  );
}
