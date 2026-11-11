'use client';
import type { ReactNode } from 'react';

export type SortKey = 'popular' | 'rating' | 'new' | 'prep';
export const SORT_LABELS: Record<SortKey, string> = { popular: 'Popularité', rating: 'Note', new: 'Nouveautés', prep: 'Temps de préparation' };

/** Panneau de filtres (bouton filtre de la maquette). */
export function FilterSheet({ open, onClose, openOnly, setOpenOnly, sort, setSort, children }: {
  open: boolean; onClose: () => void; openOnly: boolean; setOpenOnly: (v: boolean) => void; sort: SortKey; setSort: (s: SortKey) => void; children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filtres">
      <div className="w-full max-w-[430px] rounded-t-[24px] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <p className="text-lg font-bold">Filtres</p>
        <label className="mt-4 flex items-center justify-between rounded-[14px] bg-canvas p-4">
          <span className="font-semibold">Ouverts maintenant</span>
          <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        </label>
        <p className="mt-5 text-sm font-semibold text-ink-muted">Trier par</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k}
              className={`h-11 rounded-[12px] border text-sm font-semibold ${sort === k ? 'border-brand bg-brand-50 text-brand' : 'border-line'}`}>{SORT_LABELS[k]}</button>
          ))}
        </div>
        {children}
        <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-[14px] bg-cta font-semibold text-white">Afficher les résultats</button>
      </div>
    </div>
  );
}
