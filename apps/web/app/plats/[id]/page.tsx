'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { computeUnitPrice, type PublicProduct, type PublicRestaurantCard } from '@plateforme/contracts';
import { DemoBadge } from '@/components/client/demo-badge';
import { CustomerNavigation } from '@/components/client/customer-navigation';
import { ErrorBlock, LoadingBlock } from '@/components/client/states';
import { MobileScreen } from '@/components/mobile';
import { AppIcon, IconCart, IconClock, QuantityStepper } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { fcfa, useApi } from '@/lib/use-api';

/** Fiche plat — maquette 1, écran 3 (+ allergènes de la maquette 2), avec variantes et suppléments. */
export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ product: PublicProduct; restaurant: PublicRestaurantCard }>(`/catalog/products/${encodeURIComponent(id)}`);
  const cart = useCart();
  const [qty, setQty] = useState(1);
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

  if (loading) return <MobileScreen wide className="client-brand bg-white"><LoadingBlock /></MobileScreen>;
  if (error || !data) return <MobileScreen wide className="client-brand bg-white">{error && <ErrorBlock error={error} onRetry={reload} />}</MobileScreen>;
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
    <MobileScreen wide className="client-brand bg-white">
      <div className="relative">
        {p.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrls[0]} alt={p.name} className="h-[290px] w-full object-cover md:h-[380px]" />
        ) : <div className="grid h-[290px] w-full place-items-center bg-brand-50 text-6xl md:h-[380px]" aria-hidden>🍽️</div>}
        <span className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" aria-hidden />
        <button type="button" onClick={() => router.back()} aria-label="Retour"
          className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/95 shadow-md">
          <AppIcon name="arrow-left" className="size-5" />
        </button>
        {r.isDemo && <DemoBadge className="absolute right-4 top-[max(1.25rem,env(safe-area-inset-top))]" />}
      </div>

      <div className="relative -mt-6 flex-1 space-y-4 rounded-t-[28px] bg-white px-5 pb-6 pt-5 md:mx-auto md:w-full md:max-w-[820px] md:px-8">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">{p.name}</h1>
            <span className="shrink-0 text-[20px] font-extrabold text-brand">{fcfa(p.basePrice)}</span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
            <Link href={`/restaurants/${r.slug}`} className="font-semibold text-ink">{r.name}</Link>
            <span>·</span>
            <AppIcon name="star" className="size-4 fill-star text-star" />
            <b className="text-ink">{r.rating !== null && r.ratingCount > 0 ? r.rating.toFixed(1) : 'Nouveau'}</b>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><IconClock className="size-4" /> {p.prepMinutes ?? r.avgPrepMinutes} min</span>
          </p>
        </div>
        {p.promotion && (
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand">🏷️ <b>{p.promotion.name}</b> : {fcfa(p.promotion.discountedBasePrice)} au lieu de {fcfa(p.basePrice)}{p.promotion.minItemsSubtotal ? ` (dès ${fcfa(p.promotion.minItemsSubtotal)} de commande)` : ''}. Le montant exact est confirmé au panier.</p>
        )}
        {p.description && (
          <p className="text-sm leading-relaxed text-ink-muted">
            {expanded || p.description.length < 110 ? p.description : `${p.description.slice(0, 110)}… `}
            {!expanded && p.description.length >= 110 && <button type="button" onClick={() => setExpanded(true)} className="font-bold text-brand">Lire plus</button>}
          </p>
        )}

        {p.variantGroups.map((g) => (
          <fieldset key={g.id} className="rounded-2xl bg-[#F6F6F8] p-4">
            <legend className="sr-only">{g.name}</legend>
            <p className="mb-2 text-sm font-bold">{g.name} <span className="font-normal text-ink-muted">(obligatoire)</span></p>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const on = selection.variants[g.id] === o.id;
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setVariants({ ...variants, [g.id]: o.id })}
                    className={`rounded-xl border-2 bg-white p-3 text-left text-sm ${on ? 'border-brand bg-brand-50' : 'border-transparent'}`}>
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
            <fieldset key={g.id} className="rounded-2xl bg-[#F6F6F8] p-4">
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
          <div className="rounded-2xl bg-brand-50 p-4">
            <p className="text-sm font-bold text-brand">Allergènes</p>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {p.allergens.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm"><span className="grid size-7 place-items-center rounded-full border-2 border-brand text-xs font-bold text-brand" aria-hidden>!</span>{a}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center justify-between rounded-2xl bg-[#F6F6F8] p-3">
          <span className="text-sm font-bold">Quantité</span>
          <QuantityStepper value={qty} onChange={setQty} />
        </div>
        {!r.isOpen && <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">Ce restaurant est fermé pour le moment.</p>}
        {!p.available && <p className="rounded-xl bg-black/5 p-3 text-sm text-ink-muted">Ce plat est temporairement indisponible.</p>}
        {(error2 || (price && !price.ok)) && <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">{error2 ?? (price && !price.ok ? price.error : '')}</p>}
        {conflict && (
          <div className="space-y-3 rounded-2xl border border-brand bg-white p-4 text-sm">
            <p>Votre panier contient des plats de <b>{cart.restaurantName}</b>. Une commande ne concerne qu’un seul restaurant.</p>
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded-xl border border-line py-2.5 font-semibold" onClick={() => setConflict(false)}>Garder mon panier</button>
              <button type="button" className="flex-1 rounded-xl bg-brand py-2.5 font-semibold text-white" onClick={() => void add(true)}>Vider et ajouter</button>
            </div>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-line bg-white px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 md:mx-auto md:w-full md:max-w-[820px] md:rounded-t-2xl md:px-8 md:pb-5">
        <div>
          <p className="text-xs text-ink-muted">Prix total</p>
          <p className="text-xl font-extrabold tabular-nums">{price?.ok ? fcfa(price.unitPrice * qty) : '—'}</p>
        </div>
        <button type="button" onClick={() => void add()} disabled={!canAdd}
          className="bg-cta inline-flex h-14 items-center gap-2 rounded-2xl px-6 font-bold text-white shadow-[var(--shadow-raised)] active:scale-[0.98] disabled:opacity-50">
          <IconCart className="size-5" /> {!r.isOpen ? 'Fermé' : !p.available ? 'Indisponible' : 'Ajouter au panier'}
        </button>
      </div>
      <CustomerNavigation />
    </MobileScreen>
  );
}
