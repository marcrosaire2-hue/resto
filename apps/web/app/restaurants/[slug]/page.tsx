'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PublicRestaurantDetail, PublicReview, WEEKDAYS_FR } from '@plateforme/contracts';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { DemoBadge } from '@/components/client/demo-badge';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon, IconCart } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';

type Tab = 'menu' | 'avis' | 'infos';
const TABS: { key: Tab; label: string }[] = [{ key: 'menu', label: 'Menu' }, { key: 'avis', label: 'Avis' }, { key: 'infos', label: 'Infos' }];

/** Page d'un restaurant — maquette « Food Menu » : photo, résumé, onglets Menu / Avis / Infos, plats avec bouton +. */
export default function RestaurantPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: r, loading, error, reload } = useApi<PublicRestaurantDetail>(`/catalog/restaurants/${encodeURIComponent(slug)}`);
  const cart = useCart();
  const [tab, setTab] = useState<Tab>('menu');
  const [active, setActive] = useState<string | null>(null);

  if (loading) return <MobileScreen wide className="client-brand bg-white"><LoadingBlock /></MobileScreen>;
  if (error || !r) return <MobileScreen wide className="client-brand bg-white">{error && <ErrorBlock error={error} onRetry={reload} />}</MobileScreen>;
  const current = active ?? r.menu[0]?.id;
  const kinds = r.cuisines.map((c) => c.name).join(' · ');
  const place = [r.neighborhood, r.commune].filter(Boolean).join(', ');

  return (
    <MobileScreen wide className="client-brand bg-white">
      <div className="relative">
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt="" className="h-[230px] w-full object-cover md:h-[300px]" />
        ) : <div className="grid h-[230px] w-full place-items-center bg-brand-50 text-6xl md:h-[300px]" aria-hidden>🍽️</div>}
        <span className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" aria-hidden />
        <button type="button" onClick={() => router.back()} aria-label="Retour"
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/95 shadow-md">
          <AppIcon name="arrow-left" className="size-5" />
        </button>
        {r.isDemo && <DemoBadge className="absolute right-4 top-[max(1.25rem,env(safe-area-inset-top))]" />}
      </div>

      <div className="relative -mt-6 flex-1 rounded-t-[28px] bg-white px-5 pb-32 pt-5 md:mx-auto md:w-full md:max-w-[900px] md:px-8">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">{r.name}</h1>
        {kinds && <p className="mt-0.5 text-[13px] text-ink-muted">{kinds}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <AppIcon name="star" className="size-4 fill-star text-star" />
          <b>{r.rating !== null && r.ratingCount > 0 ? r.rating.toFixed(1) : 'Nouveau'}</b>
          {r.ratingCount > 0 && <span className="text-ink-muted">({r.ratingCount})</span>}
          <span className="text-ink-muted">·</span>
          <span className="whitespace-nowrap text-ink-muted">~{r.avgPrepMinutes} min</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.isOpen ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger'}`}>{r.isOpen ? 'Ouvert' : 'Fermé'}</span>
        </p>

        {r.promotions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {r.promotions.map((p) => (
              <p key={p.name} className="rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand">🏷️ <b>{p.name}</b> : {p.type === 'PERCENT' ? `−${p.value} %` : `−${fcfa(p.value)}`}{p.allProducts ? ' sur toute la carte' : ' sur une sélection'}{p.minItemsSubtotal ? ` dès ${fcfa(p.minItemsSubtotal)}` : ''} · jusqu’au {new Date(p.endsAt).toLocaleDateString('fr-FR')}</p>
            ))}
          </div>
        )}
        {!r.isOpen && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-[13px] text-danger">Restaurant fermé : la carte reste consultable, l’ajout au panier est suspendu.</p>}

        <div role="tablist" className="mt-4 flex border-b border-line">
          {TABS.map((t) => (
            <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`-mb-px flex-1 border-b-[3px] py-3 text-[15px] font-bold transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-ink-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'menu' && (
          <>
            {r.menu.length > 1 && (
              <nav aria-label="Catégories du menu" className="sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto bg-white px-5 py-3 md:mx-0 md:px-0">
                {r.menu.map((c) => (
                  <a key={c.id} href={`#cat-${c.id}`} onClick={() => setActive(c.id)}
                    className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold leading-9 ${current === c.id ? 'bg-brand text-white' : 'border border-line text-ink'}`}>{c.name}</a>
                ))}
              </nav>
            )}
            {r.menu.length === 0 && <p className="py-12 text-center text-sm text-ink-muted">La carte de ce restaurant sera bientôt disponible.</p>}
            {r.menu.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16">
                <h2 className="pb-1 pt-4 text-[17px] font-extrabold">{c.name}</h2>
                <ul className="md:grid md:grid-cols-2 md:gap-x-6">
                  {c.products.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <Link href={`/plats/${p.id}`} className={`flex items-center gap-3 border-b border-line py-3 ${p.available ? '' : 'opacity-60'}`}>
                        {p.imageUrls[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrls[0]} alt="" loading="lazy" className="size-[76px] shrink-0 rounded-xl object-cover" />
                        ) : <span className="grid size-[76px] shrink-0 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>🍽️</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold">{p.name}</span>
                          {p.description && <span className="mt-0.5 line-clamp-1 block text-xs text-ink-muted">{p.description}</span>}
                          <span className="mt-1.5 block text-[14px] font-extrabold">
                            {p.promotion && !p.promotion.minItemsSubtotal
                              ? <><span className="text-brand">{fcfa(p.promotion.discountedBasePrice)}</span> <s className="text-xs font-normal text-ink-muted">{fcfa(p.basePrice)}</s></>
                              : fcfa(p.basePrice)}
                          </span>
                        </span>
                        {p.available
                          ? <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[var(--shadow-raised)]" aria-label="Voir le plat"><AppIcon name="plus" className="size-5" /></span>
                          : <span className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-[12px] text-ink-muted">Indisponible</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        {tab === 'avis' && <Reviews slug={slug} count={r.ratingCount} />}

        {tab === 'infos' && (
          <div className="space-y-4 pt-4 text-sm">
            {r.description && <p className="leading-relaxed">{r.description}</p>}
            <div className="flex items-start gap-3 rounded-2xl bg-[#F3F3F5] p-4">
              <AppIcon name="map-pin" className="mt-0.5 size-5 shrink-0 text-brand" />
              <p><b className="block">Adresse</b><span className="text-ink-muted">{[r.address, place].filter(Boolean).join(', ') || 'Non renseignée'}</span></p>
            </div>
            <div className="rounded-2xl bg-[#F3F3F5] p-4">
              <p className="mb-2 flex items-center gap-2 font-bold"><AppIcon name="clock-3" className="size-5 text-brand" /> Horaires</p>
              <ul className="space-y-1.5 text-[13px]">
                {WEEKDAYS_FR.map((d, i) => {
                  const slots = r.openingHours.filter((s) => s.weekday === i);
                  return <li key={d} className="flex justify-between"><span>{d}</span><span className="text-ink-muted">{slots.length ? slots.map((s) => `${s.opens}–${s.closes}`).join(', ') : 'Fermé'}</span></li>;
                })}
              </ul>
            </div>
          </div>
        )}
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

/** Avis vérifiés : laissés uniquement par des clients dont la commande a été livrée. */
function Reviews({ slug, count }: { slug: string; count: number }) {
  const list = useApi<PublicReview[]>(count > 0 ? `/catalog/restaurants/${encodeURIComponent(slug)}/reviews` : null);
  if (!count) return <p className="py-12 text-center text-sm text-ink-muted">Pas encore d’avis : soyez le premier après votre livraison.</p>;
  if (list.loading || !list.data) return <LoadingBlock />;
  return (
    <section className="pt-4">
      <p className="pb-2 text-xs text-ink-muted">Uniquement des clients ayant reçu leur commande.</p>
      {list.data.slice(0, 20).map((v) => (
        <div key={v.id} className="border-b border-line py-3 text-sm last:border-0">
          <p className="flex flex-wrap items-center gap-x-2"><span className="text-star">{'★'.repeat(v.rating)}{'☆'.repeat(5 - v.rating)}</span> <b>{v.authorName}</b> <span className="text-xs text-ink-muted">· {new Date(v.createdAt).toLocaleDateString('fr-FR')}</span></p>
          {v.comment && <p className="mt-1 text-ink-muted">{v.comment}</p>}
          {v.reply && <p className="mt-2 rounded-lg bg-brand-50 p-2 text-[13px]"><b>Réponse du restaurant :</b> {v.reply}</p>}
        </div>
      ))}
    </section>
  );
}
