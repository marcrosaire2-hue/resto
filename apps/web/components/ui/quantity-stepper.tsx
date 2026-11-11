'use client';
import { IconMinus, IconPlus } from './icons';

export function QuantityStepper({ value, onChange, min = 1, max = 99, label = 'Quantité' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      <button type="button" className="grid size-8 place-items-center rounded-full text-ink hover:bg-black/5 disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuer">
        <IconMinus className="size-4" />
      </button>
      <span className="w-7 text-center text-sm font-bold tabular-nums" aria-live="polite">{String(value).padStart(2, '0')}</span>
      <button type="button" className="grid size-8 place-items-center rounded-full bg-brand text-white hover:bg-brand-600 disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Augmenter">
        <IconPlus className="size-4" />
      </button>
    </div>
  );
}
