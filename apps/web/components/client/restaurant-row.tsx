import Link from 'next/link';
import type { PublicRestaurantCard } from '@plateforme/contracts';
import { AppIcon } from '@/components/ui';
import { DemoBadge } from './demo-badge';

/** Carte restaurant horizontale : photo, nom, cuisines, note et temps de préparation. */
export function RestaurantRow({ r }: { r: PublicRestaurantCard }) {
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
