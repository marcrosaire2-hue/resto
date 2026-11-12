'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PublicRestaurantDetail, PublicReview, WEEKDAYS_FR } from '@plateforme/contracts';
import { DemoBadge } from '@/components/client/demo-badge';
import { ErrorBlock, LoadingBlock, RatingOrNew } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { IconArrowLeft } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';

/** Vitrine / carte d'un restaurant — maquette 2, alimentée par l'API (/restaurants/[slug]). */
export default function RestaurantPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: r, loading, error, reload } = useApi<PublicRestaurantDetail>(`/catalog/restaurants/${encodeURIComponent(slug)}`);
  const cart = useCart();
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [active, setActive] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  if (loading) return <MobileScreen className="bg-surface"><LoadingBlock /></MobileScreen>;
  if (error || !r) return <MobileScreen className="bg-surface">{error && <ErrorBlock error={error} onRetry={reload} />}</MobileScreen>;
  const current = active ?? r.menu[0]?.id;

  return (
    <MobileScreen className="bg-surface">
      {r.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.coverUrl} alt="" className="h-36 w-full object-cover" />
      )}
      <header className="px-5 pb-3 pt-4">
        <Link href="/accueil" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted"><IconArrowLeft className="size-4" /> Restaurants</Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight">{r.name}</h1>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              Propulsé par <span className="font-semibold text-brand">Marketplace</span> {r.isDemo && <DemoBadge />}
            </p>
          </div>
          <div role="radiogroup" aria-label="Langue" className="inline-flex shrink-0 rounded-full bg-brand-50">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                className={`size-11 rounded-full text-[15px] font-semibold uppercase ${lang === l ? 'bg-brand text-white' : 'text-brand'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <RatingOrNew rating={r.rating} count={r.ratingCount} />
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.isOpen ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger'}`}>{r.isOpen ? 'Ouvert' : 'Fermé'}</span>
          <span className="text-xs text-ink-muted">~{r.avgPrepMinutes} min · {r.neighborhood}</span>
          <button type="button" onClick={() => setShowInfo((v) => !v)} className="text-xs font-semibold text-brand">{showInfo ? 'Masquer les infos' : 'Infos et horaires'}</button>
        </div>
        {lang === 'en' && <p className="mt-2 text-xs text-ink-muted">La carte n’est pas encore traduite en anglais par ce restaurant.</p>}
        {showInfo && (
          <div className="mt-3 space-y-2 rounded-[14px] bg-canvas p-4 text-sm">
            {r.description && <p>{r.description}</p>}
            <p className="text-ink-muted">{r.address}{r.commune ? `, ${r.commune}` : ''}</p>
            <ul className="grid grid-cols-2 gap-x-4 text-xs">
              {WEEKDAYS_FR.map((d, i) => {
                const slots = r.openingHours.filter((s) => s.weekday === i);
                return <li key={d} className="flex justify-between"><span>{d}</span><span className="text-ink-muted">{slots.length ? slots.map((s) => `${s.opens}–${s.closes}`).join(', ') : 'Fermé'}</span></li>;
              })}
            </ul>
          </div>
        )}
        {r.promotions.length > 0 && (
          <div className="mt-3 space-y-1">
            {r.promotions.map((p) => (
              <p key={p.name} className="rounded-[10px] bg-brand-50 px-3 py-2 text-sm text-brand">🏷️ <b>{p.name}</b> : {p.type === 'PERCENT' ? `−${p.value} %` : `−${fcfa(p.value)}`}{p.allProducts ? ' sur toute la carte' : ' sur une sélection'}{p.minItemsSubtotal ? ` dès ${fcfa(p.minItemsSubtotal)}` : ''} · jusqu’au {new Date(p.endsAt).toLocaleDateString('fr-FR')}</p>
            ))}
          </div>
        )}
        {!r.isOpen && <p className="mt-3 rounded-[10px] bg-danger-50 p-3 text-sm text-danger">Restaurant fermé : la carte reste consultable, l’ajout au panier est suspendu.</p>}
      </header>

      {r.menu.length > 0 && (
        <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-y border-line bg-surface px-5 py-3">
          {r.menu.map((c) => (
            <a key={c.id} href={`#cat-${c.id}`} onClick={() => setActive(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[15px] ${current === c.id ? 'bg-brand-50 font-semibold text-brand' : 'text-brand/80'}`}>{c.name}</a>
          ))}
        </nav>
      )}

      <main className="flex-1 px-5 pb-28">
        {r.menu.length === 0 && <p className="py-12 text-center text-sm text-ink-muted">La carte de ce restaurant sera bientôt disponible.</p>}
        {r.menu.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16">
            <h2 className="pb-1 pt-6 text-xl font-semibold text-brand">{c.name}</h2>
            {c.products.map((p) => (
              <Link key={p.id} href={`/plats/${p.id}`} className={`flex gap-3 border-b border-line py-4 last:border-0 ${p.available ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold">{p.name}</p>
                  <p className="mt-1 line-clamp-2 text-[14px] text-ink-muted">{p.description}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {p.promotion && !p.promotion.minItemsSubtotal
                      ? <span className="whitespace-nowrap text-[14px]"><span className="text-brand">{fcfa(p.promotion.discountedBasePrice)}</span> <s className="text-xs text-ink-muted">{fcfa(p.basePrice)}</s></span>
                      : <span className="whitespace-nowrap text-[14px] text-brand">{fcfa(p.basePrice)}</span>}
                    {!p.available ? <span className="rounded-full bg-black/5 px-3 py-1 text-[13px] text-ink-muted">Indisponible</span>
                      : p.tags[0] && <span className="truncate rounded-full bg-brand-50 px-3 py-1 text-[13px] text-brand">{p.tags[0]}</span>}
                  </div>
                </div>
                {p.imageUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrls[0]} alt={p.name} loading="lazy" className="h-[100px] w-[150px] shrink-0 rounded-[12px] object-cover" />
                ) : <div className="h-[100px] w-[150px] shrink-0 rounded-[12px] bg-peach" />}
              </Link>
            ))}
          </section>
        ))}
        <Reviews slug={slug} count={r.ratingCount} />
      </main>

      <div className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 items-center justify-between border-t border-line bg-surface px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <Link href="/panier" className="relative grid size-11 place-items-center rounded-[10px] bg-canvas" aria-label={`Panier (${cart.count})`}>
          🧾{cart.count > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{cart.count}</span>}
        </Link>
        <Link href="/panier" className="grid h-11 w-24 place-items-center rounded-full bg-[#e9e9e9] text-2xl text-ink" aria-label="Voir le panier">+</Link>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Revenir en haut"
          className="grid size-11 place-items-center rounded-full bg-[#e9e9e9] text-ink">⌃</button>
      </div>
    </MobileScreen>
  );
}

/** Avis vérifiés : laissés uniquement par des clients dont la commande a été livrée. */
function Reviews({ slug, count }: { slug: string; count: number }) {
  const list = useApi<PublicReview[]>(count > 0 ? `/catalog/restaurants/${encodeURIComponent(slug)}/reviews` : null);
  if (!count || !list.data?.length) return null;
  return (
    <section className="pt-8">
      <h2 className="pb-2 text-xl font-semibold text-brand">Avis des clients</h2>
      <p className="pb-2 text-xs text-ink-muted">Uniquement des clients ayant reçu leur commande.</p>
      {list.data.slice(0, 10).map((v) => (
        <div key={v.id} className="border-b border-line py-3 text-sm last:border-0">
          <p><span className="text-warning">{'★'.repeat(v.rating)}{'☆'.repeat(5 - v.rating)}</span> <b>{v.authorName}</b> <span className="text-xs text-ink-muted">· {new Date(v.createdAt).toLocaleDateString('fr-FR')}</span></p>
          {v.comment && <p className="mt-1 text-ink-muted">{v.comment}</p>}
          {v.reply && <p className="mt-2 rounded-[8px] bg-brand-50 p-2 text-[13px]"><b>Réponse du restaurant :</b> {v.reply}</p>}
        </div>
      ))}
    </section>
  );
}
