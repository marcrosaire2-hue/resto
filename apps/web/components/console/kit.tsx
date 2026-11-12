'use client';
import { ReactNode, useState } from 'react';
import { ApiError } from '@/lib/api';
import { Card } from '../ui';

export type Msg = { tone: 'success' | 'danger' | 'info'; text: string } | null;

/** Exécute une action et produit un message lisible (succès ou erreur de l'API). */
export function useRunner(after?: () => void) {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setBusy(true);
    try { await fn(); setMsg({ tone: 'success', text: ok }); return true; }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Une erreur est survenue.' }); return false; }
    finally { setBusy(false); after?.(); }
  }
  return { msg, setMsg, busy, run };
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <Card className="p-4"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}</Card>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  if (empty) return <p className="py-6 text-center text-sm text-ink-muted">Aucun élément.</p>;
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[0.03] text-xs text-ink-muted"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} type="button" onClick={() => onChange(k)}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${value === k ? 'border-brand text-brand' : 'border-transparent text-ink-muted'}`}>{l}</button>
      ))}
    </div>
  );
}

export const date = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const toInputDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
export const inputCls = 'h-10 rounded-[10px] border border-line bg-surface px-3 text-sm';

/** Petite invite de saisie en ligne (motif, référence…) — jamais de window.prompt. */
export function InlinePrompt({ label, placeholder, min = 3, onSubmit, onCancel, confirm = 'Confirmer', danger }: { label: string; placeholder?: string; min?: number; onSubmit: (v: string) => void; onCancel: () => void; confirm?: string; danger?: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input autoFocus aria-label={label} placeholder={placeholder ?? label} value={v} onChange={(e) => setV(e.target.value)} className={`${inputCls} min-w-[200px] flex-1`} />
      <button type="button" disabled={v.trim().length < min} onClick={() => onSubmit(v.trim())} className={`h-10 rounded-[10px] px-3 text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-danger' : 'bg-brand'}`}>{confirm}</button>
      <button type="button" onClick={onCancel} className="h-10 px-2 text-sm text-ink-muted">Annuler</button>
    </div>
  );
}
