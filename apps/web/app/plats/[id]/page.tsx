'use client';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { computeUnitPrice, type PublicProduct, type PublicRestaurantCard } from '@plateforme/contracts';
import { DemoBadge } from '@/components/client/demo-badge';
import { ErrorBlock, LoadingBlock, RatingOrNew } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { IconCart, IconClock, QuantityStepper } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';

/** Fiche plat — maquette 1, écran 3 (+ allergènes de la maquette 2), avec variantes et suppléments. */
export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ product: PublicProduct; restaurant: PublicRestaurantCard }>(`/catalog/products/${encodeURIComponent(id)}`);
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [fav, setFav] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [addons, setAddons] = useState<string[]>([]);
  const [error2, setError2] = useState<string | null>(null);

  const selection = useMemo(() => {
    const p = data?.product;
    if (!p) return { variants: {}, addons: [] };
    // Première option par défaut pour chaque variante non choisie.
    const v = Object.fromEntries(p.variantGroups.map((g) => [g.id, variants[g.id] ?? g.options[0].id]));
    return { variants: v, addons };
  }, [data, variants, addons]);
  const price = data ? computeUnitPrice(data.product, selection) : null;

  if (loading) return <MobileScreen className="bg-detail"><LoadingBlock /></MobileScreen>;
  if (error || !data) return <MobileScreen className="bg-detail">{error && <ErrorBlock error={error} onRetry={reload} />}</MobileScreen>;
  const { product: p, restaurant: r } = data;
  const canAdd = r.isOpen && p.available && price?.ok;

  function toggleAddon(groupMax: number, groupIds: string[], optionId: string) {
    setAddons((cur) => {
      if (cur.includes(optionId)) return cur.filter((x) => x !== optionId);
      const inGroup = cur.filter((x) => groupIds.includes(x));
      if (inGroup.length >= groupMax) return groupMax === 1 ? [...cur.filter((x) => !groupIds.includes(x)), optionId] : cur;
      return [...cur, optionId];
    });
  }

  function lineFor() {
    const labels = [
      ...p.variantGroups.map((g) => g.options.find((o) => o.id === selection.variants[g.id])?.name).filter((x): x is string => !!x && p.variantGroups.length > 0),
      ...p.addonGroups.flatMap((g) => g.options.filter((o) => addons.includes(o.id)).map((o) => `+ ${o.name}`)),
    ];
    return { productId: p.id, name: p.name, imageUrl: p.imageUrls[0] ?? null, unitPrice: price!.ok ? price!.unitPrice : 0, qty, selection, optionLabels: labels };
  }

  async function add(replace = false) {
    if (!price?.ok) return setError2(price?.error ?? 'Sélection invalide.');
    try {
      if ((await cart.add({ slug: r.slug, name: r.name }, lineFor(), replace)).conflict) return setConflict(true);
      router.push('/panier');
    } catch (e) {
      setError2(e instanceof Error ? e.message : 'Ajout impossible.');
    }
  }

  return (
    <MobileScreen className="bg-detail">
      <div className="flex-1 space-y-5 px-5 pb-6 pt-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => router.back()} aria-label="Retour" className="grid size-12 place-items-center rounded-[14px] bg-surface text-xl">‹</button>
          {r.isDemo ? <DemoBadge /> : <span />}
          <button type="button" onClick={() => setFav((v) => !v)} aria-pressed={fav} aria-label="Ajouter aux favoris" className="grid size-12 place-items-center rounded-[14px] bg-surface">
            <svg viewBox="0 0 24 24" className="size-5" fill={fav ? '#F15A24' : 'none'} stroke={fav ? '#F15A24' : 'currentColor'} strokeWidth="1.8" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
          </button>
        </div>
        {p.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrls[0]} alt={p.name} className="aspect-[5/4] w-full rounded-[22px] object-cover shadow-lg" />
        ) : <div className="grid aspect-[5/4] w-full place-items-center rounded-[22px] bg-peach text-5xl" aria-hidden>🍽️</div>}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[22px] font-bold">{p.name}</h1>
            <RatingOrNew rating={r.rating} count={r.ratingCount} className="shrink-0 bg-surface !text-ink shadow-[0_2px_8px_rgb(32_33_36/0.08)]" />
          </div>
          <div className="mt-1 flex items-center gap-3 text-[13px] text-ink-muted">
            <span>{r.name}</span>
            <span className="inline-flex items-center gap-1"><IconClock className="size-4" /> {p.prepMinutes ?? r.avgPrepMinutes} min</span>
          </div>
        </div>
        {p.promotion && (
          <p className="rounded-[12px] bg-brand-50 p-3 text-sm text-brand">🏷️ <b>{p.promotion.name}</b> : {fcfa(p.promotion.discountedBasePrice)} au lieu de {fcfa(p.basePrice)}{p.promotion.minItemsSubtotal ? ` (dès ${fcfa(p.promotion.minItemsSubtotal)} de commande)` : ''}. Le montant exact est confirmé au panier.</p>
        )}
        {p.description && (
          <p className="text-sm leading-relaxed text-ink-muted">
            {expanded || p.description.length < 110 ? p.description : `${p.description.slice(0, 110)}… `}
            {!expanded && p.description.length >= 110 && <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-ink">Lire plus</button>}
          </p>
        )}

        {p.variantGroups.map((g) => (
          <fieldset key={g.id} className="rounded-[16px] bg-surface p-4">
            <legend className="sr-only">{g.name}</legend>
            <p className="mb-2 text-sm font-bold">{g.name} <span className="font-normal text-ink-muted">(obligatoire)</span></p>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const on = selection.variants[g.id] === o.id;
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setVariants({ ...variants, [g.id]: o.id })}
                    className={`rounded-[12px] border p-3 text-left text-sm ${on ? 'border-brand bg-brand-50' : 'border-line'}`}>
                    <span className="block font-semibold">{o.name}</span>
                    <span className="text-xs text-ink-muted">{o.priceDelta ? `${o.priceDelta > 0 ? '+' : ''}${fcfa(o.priceDelta)}` : 'Inclus'}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        {p.addonGroups.map((g) => {
          const ids = g.options.map((o) => o.id);
          return (
            <fieldset key={g.id} className="rounded-[16px] bg-surface p-4">
              <legend className="sr-only">{g.name}</legend>
              <p className="mb-2 text-sm font-bold">{g.name} <span className="font-normal text-ink-muted">({g.min > 0 ? `${g.min} à ${g.max}` : `jusqu’à ${g.max}`})</span></p>
              <ul className="divide-y divide-line">
                {g.options.map((o) => (
                  <li key={o.id}>
                    <label className={`flex items-center justify-between py-2.5 text-sm ${o.available ? '' : 'opacity-50'}`}>
                      <span className="flex items-center gap-3">
                        <input type="checkbox" className="size-5 accent-[var(--color-brand)]" disabled={!o.available} checked={addons.includes(o.id)} onChange={() => toggleAddon(g.max, ids, o.id)} />
                        {o.name}{!o.available && ' (indisponible)'}
                      </span>
                      <span className="text-ink-muted">+{fcfa(o.price)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}

        {p.allergens.length > 0 && (
          <div className="rounded-[16px] bg-brand-50 p-4">
            <p className="text-sm font-semibold text-brand">Allergènes</p>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {p.allergens.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm"><span className="grid size-7 place-items-center rounded-full border-2 border-brand text-xs font-bold text-brand" aria-hidden>!</span>{a}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center justify-between rounded-[16px] bg-surface p-3">
          <span className="text-sm font-semibold">Quantité</span>
          <QuantityStepper value={qty} onChange={setQty} />
        </div>
        {!r.isOpen && <p className="rounded-[12px] bg-danger-50 p-3 text-sm text-danger">Ce restaurant est fermé pour le moment.</p>}
        {!p.available && <p className="rounded-[12px] bg-black/5 p-3 text-sm text-ink-muted">Ce plat est temporairement indisponible.</p>}
        {(error2 || (price && !price.ok)) && <p className="rounded-[12px] bg-danger-50 p-3 text-sm text-danger">{error2 ?? (price && !price.ok ? price.error : '')}</p>}
        {conflict && (
          <div className="space-y-3 rounded-[16px] border border-brand bg-surface p-4 text-sm">
            <p>Votre panier contient des plats de <b>{cart.restaurantName}</b>. Une commande ne concerne qu’un seul restaurant.</p>
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded-[10px] border border-line py-2 font-semibold" onClick={() => setConflict(false)}>Garder mon panier</button>
              <button type="button" className="flex-1 rounded-[10px] bg-brand py-2 font-semibold text-white" onClick={() => void add(true)}>Vider et ajouter</button>
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-4 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div>
          <p className="text-xs text-ink-muted">Prix total</p>
          <p className="text-xl font-extrabold tabular-nums">{price?.ok ? fcfa(price.unitPrice * qty) : '—'}</p>
        </div>
        <button type="button" onClick={() => void add()} disabled={!canAdd}
          className="inline-flex h-14 items-center gap-2 rounded-[14px] bg-cta px-6 font-semibold text-white shadow-[var(--shadow-raised)] active:scale-[0.98] disabled:opacity-50">
          <IconCart className="size-5" /> {!r.isOpen ? 'Fermé' : !p.available ? 'Indisponible' : 'Ajouter au panier'}
        </button>
      </div>
    </MobileScreen>
  );
}
