import Link from 'next/link';
import type { PublicRestaurantCard } from '@plateforme/contracts';
import { DemoBadge } from './demo-badge';
import { RatingOrNew } from './states';

/** Carte restaurant (maquette 1, écran 2). */
export function RestaurantCard({ r }: { r: PublicRestaurantCard }) {
  return (
    <Link href={`/restaurants/${r.slug}`} className="overflow-hidden rounded-[14px] bg-surface shadow-[0_4px_14px_rgb(32_33_36/0.10)] active:scale-[0.98]">
      <div className="relative aspect-square bg-peach">
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.coverUrl} alt={r.name} loading="lazy" className="h-full w-full rounded-[14px] object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-4xl" aria-hidden>🍽️</div>
        )}
        <RatingOrNew rating={r.rating} count={r.ratingCount} className="absolute right-[5%] top-[5%] w-[46%]" />
        {r.isDemo && <DemoBadge className="absolute left-2 top-2" />}
        {r.sponsored && <span className="absolute bottom-2 left-2 rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-semibold text-white">Sponsorisé</span>}
        {!r.isOpen && <span className="absolute inset-x-0 bottom-0 rounded-b-[14px] bg-ink/70 py-1 text-center text-xs font-semibold text-white">Fermé</span>}
      </div>
      <div className="px-2.5 pb-3 pt-2">
        <p className="truncate text-[14px] font-bold">{r.name}</p>
        <p className="truncate text-xs text-ink-muted">{r.description || r.cuisines.map((c) => c.name).join(' · ')}</p>
      </div>
    </Link>
  );
}
