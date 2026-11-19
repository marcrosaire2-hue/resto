'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import type { PublicCuisine, PublicProduct, PublicRestaurantCard } from '@plateforme/contracts';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { DemoBadge } from '@/components/client/demo-badge';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon, IconCart, IconPin, IconSearch, Spinner } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useLive } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { fcfa, useApi } from '@/lib/use-api';

interface HomeSection { type: string; title: string; banners?: { id: string; title: string; imageUrl: string | null; restaurantSlug: string }[]; dishes?: PublicProduct[] }
interface SavedAddress { id: string; label: string; neighborhood: string | null; commune: string | null; isDefault: boolean }

/** Accueil client — maquette « Home Screen » : adresse, recherche, bannière, catégories, restaurants populaires. Données réelles uniquement. */
export default function HomePage() {
  const { me, loading } = useSession();
  const router = useRouter();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace(`/connexion?suite=${encodeURIComponent('/accueil')}`);
  }, [loading, me, router]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cuisines = useApi<PublicCuisine[]>(me ? '/catalog/cuisines' : null);
  const params = new URLSearchParams({ sort: 'popular', ...(debounced ? { q: debounced } : {}), ...(cuisine ? { cuisine } : {}) });
  const restaurants = useApi<PublicRestaurantCard[]>(me ? `/catalog/restaurants?${params}` : null);
  // Contenus sponsorisés administrés (bannières, plats à la une) : affichés seulement s'ils existent réellement.
  const home = useApi<{ sections: HomeSection[] }>(me ? '/catalog/home' : null);
  const addresses = useApi<SavedAddress[]>(me ? '/me/addresses' : null);
  const banners = home.data?.sections.find((x) => x.type === 'BANNERS');
  const dishes = home.data?.sections.find((x) => x.type === 'FEATURED_DISHES');
  const notifs = useApi<{ unread: number }>(me ? '/notifications' : null);
  useLive(me ? { type: 'user', id: me.id } : null, ['notification.new'], notifs.reload, 60_000);
  const unread = notifs.data?.unread ?? 0;

  if (loading || !me) {
    return <MobileScreen wide className="client-brand bg-white"><div className="grid flex-1 place-items-center text-brand"><Spinner /></div></MobileScreen>;
  }

  const address = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
  const place = address ? [address.neighborhood, address.commune].filter(Boolean).join(', ') || address.label : null;
  const filtered = !!(debounced || cuisine);
  const onSearch = (e: FormEvent) => { e.preventDefault(); if (q.trim()) router.push(`/recherche?q=${encodeURIComponent(q.trim())}`); };

  return (
    <MobileScreen wide className="client-brand bg-white">
      <div className="mx-auto w-full min-w-0 max-w-[1100px] space-y-5 px-5 pb-32 pt-5 md:space-y-7 md:px-8 md:pb-16 md:pt-8">
        <header className="flex items-center justify-between gap-3">
          <Link href="/compte/adresses" className="flex min-w-0 items-center gap-2.5" aria-label="Changer l’adresse de livraison">
            <IconPin className="size-6 shrink-0 text-brand" />
            <span className="min-w-0 text-left leading-tight">
              <span className="block truncate text-[15px] font-extrabold">{place ?? 'Livraison'}</span>
              <span className="flex items-center gap-1 text-[11px] text-ink-muted">{place ? 'Changer d’adresse' : 'Ajouter une adresse'} <AppIcon name="chevron-down" className="size-3" /></span>
            </span>
          </Link>
          <Link href="/notifications" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
            className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-white">
            <AppIcon name="bell" className="size-5" />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </header>

        <form onSubmit={onSearch} role="search">
          <label className="flex h-[52px] items-center gap-3 rounded-2xl bg-[#F3F3F5] px-4">
            <IconSearch className="size-5 text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un restaurant ou un plat…" aria-label="Rechercher un restaurant ou un plat" enterKeyHint="search"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" />
          </label>
        </form>

        {!debounced && banners?.banners?.length ? (
          <section aria-label={banners.title} className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
            {banners.banners.map((b) => (
              <Link key={b.id} href={`/restaurants/${b.restaurantSlug}`}
                className="relative flex h-[132px] w-[88%] shrink-0 snap-start items-center overflow-hidden rounded-[22px] bg-[#26262a] p-5 text-white md:w-[460px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-y-0 right-0 h-full w-[52%] object-cover" />}
                <span className="absolute inset-0 bg-gradient-to-r from-[#26262a] via-[#26262a]/85 to-transparent" aria-hidden />
                <span className="relative max-w-[58%]">
                  <span className="block text-[20px] font-extrabold leading-tight">{b.title}</span>
                  <span className="mt-2 inline-block rounded-full bg-brand px-3 py-1 text-[11px] font-bold">Voir</span>
                </span>
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold">Sponsorisé</span>
              </Link>
            ))}
          </section>
        ) : null}

        {(cuisines.data?.length ?? 0) > 0 && (
          <section aria-label="Catégories" className="grid grid-cols-4 gap-x-3 gap-y-4 md:grid-cols-8">
            {cuisines.data!.slice(0, 8).map((c) => {
              const on = cuisine === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setCuisine(on ? null : c.id)} aria-pressed={on} className="flex flex-col items-center gap-1.5">
                  <span className={`grid size-[62px] place-items-center overflow-hidden rounded-2xl border bg-white text-[28px] shadow-[var(--shadow-card)] transition-colors ${on ? 'border-brand bg-brand-50' : 'border-line'}`}>
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" className="size-full object-cover" />
                    ) : <span aria-hidden>{c.emoji ?? '🍽️'}</span>}
                  </span>
                  <span className={`line-clamp-1 text-center text-[12px] ${on ? 'font-bold text-brand' : 'font-medium text-ink'}`}>{c.name}</span>
                </button>
              );
            })}
          </section>
        )}

        {!debounced && dishes?.dishes?.length ? (
          <section>
            <Heading title={dishes.title} href="/recherche" />
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
              {dishes.dishes.map((d) => (
                <Link key={d.id} href={`/plats/${d.id}`} className="w-[150px] shrink-0">
                  <span className="relative block h-[104px] overflow-hidden rounded-2xl bg-brand-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {d.imageUrls[0] && <img src={d.imageUrls[0]} alt={d.name} className="size-full object-cover" />}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">Sponsorisé</span>
                  </span>
                  <span className="mt-1.5 block truncate text-[13px] font-bold">{d.name}</span>
                  <span className="text-xs font-semibold text-brand">{fcfa(d.basePrice)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <Heading title={filtered ? 'Résultats' : 'Restaurants populaires'} href="/recherche" />
          {restaurants.loading || !restaurants.data ? <LoadingBlock />
            : restaurants.error ? <ErrorBlock error={restaurants.error} onRetry={restaurants.reload} />
            : restaurants.data.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-2xl" aria-hidden>{filtered ? '🔎' : '🍽️'}</span>
                <p className="mt-3 font-bold">{filtered ? 'Aucun résultat pour le moment' : 'De nouvelles adresses arrivent'}</p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-ink-muted">
                  {filtered ? 'Essayez un autre mot-clé ou une autre catégorie.' : 'Explorez la recherche pour découvrir les restaurants et leurs menus.'}
                </p>
                <Link href="/recherche" className="mt-4 inline-flex h-10 items-center rounded-full bg-brand px-5 text-xs font-bold text-white">Découvrir les menus</Link>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {restaurants.data.map((r) => <li key={r.id} className="min-w-0"><RestaurantRow r={r} /></li>)}
              </ul>
            )}
        </section>
      </div>

      {cart.count > 0 && (
        <Link href="/panier" className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex h-12 w-[calc(min(100%,430px)-2.5rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-brand px-5 text-sm font-bold text-white shadow-[var(--shadow-raised)] md:bottom-8 md:left-auto md:right-8 md:w-auto md:translate-x-0 md:gap-6">
          <span className="inline-flex items-center gap-2"><IconCart className="size-5" /> Voir le panier ({cart.count})</span>
          <span>{fcfa(cart.subtotal)}</span>
        </Link>
      )}
      <CustomerNavigation />
    </MobileScreen>
  );
}

function Heading({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[17px] font-extrabold tracking-tight">{title}</h2>
      <Link href={href} className="text-[13px] font-bold text-brand">Voir tout</Link>
    </div>
  );
}

/** Carte restaurant horizontale : photo, nom, cuisines, note et temps de préparation. */
function RestaurantRow({ r }: { r: PublicRestaurantCard }) {
  const kinds = r.cuisines.map((c) => c.name).join(' · ') || r.description;
  return (
    <Link href={`/restaurants/${r.slug}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-2.5 shadow-[var(--shadow-card)] active:scale-[.99]">
      <span className="relative block size-[72px] shrink-0 overflow-hidden rounded-xl bg-brand-50">
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt="" loading="lazy" className={`size-full object-cover ${r.isOpen ? '' : 'grayscale'}`} />
        ) : <span className="grid size-full place-items-center text-2xl" aria-hidden>🍽️</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-bold">{r.name}</span>
          {r.isDemo && <DemoBadge />}
        </span>
        <span className="block truncate text-xs text-ink-muted">{kinds}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
          <AppIcon name="star" className="size-3.5 fill-star text-star" />
          <span className="font-bold">{r.rating !== null && r.ratingCount > 0 ? r.rating.toFixed(1) : 'Nouveau'}</span>
          {r.ratingCount > 0 && <span className="text-ink-muted">({r.ratingCount})</span>}
          <span className="text-ink-muted">·</span>
          <span className="whitespace-nowrap text-ink-muted">~{r.avgPrepMinutes} min</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {r.sponsored && <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Sponsorisé</span>}
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${r.isOpen ? 'bg-brand-50 text-brand' : 'bg-[#f0f0f2] text-ink-muted'}`}>{r.isOpen ? 'Ouvert' : 'Fermé'}</span>
      </span>
    </Link>
  );
}
