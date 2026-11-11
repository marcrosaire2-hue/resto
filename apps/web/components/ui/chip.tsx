'use client';
import { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/** Pastille sélectionnable (catégories, filtres). */
export function Chip({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
        selected ? 'border-brand bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink hover:border-brand-100',
        className,
      )}
      {...rest}
    />
  );
}
