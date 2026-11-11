'use client';
import { SelectHTMLAttributes, TextareaHTMLAttributes, useId } from 'react';
import { cn } from '../ui';

export function Select({ label, error, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <select id={id} className={cn('h-12 rounded-[12px] border bg-surface px-3 text-[15px]', error ? 'border-danger' : 'border-line')} {...rest}>{children}</select>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TextArea({ label, error, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <textarea id={id} rows={3} className={cn('rounded-[12px] border bg-surface p-3 text-[15px]', error ? 'border-danger' : 'border-line')} {...rest} />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PENDING_REVIEW: ['En attente de validation', 'bg-warning-50 text-warning'],
    ACTIVE: ['Validé', 'bg-success-50 text-success'],
    SUSPENDED: ['Suspendu', 'bg-danger-50 text-danger'],
    REJECTED: ['Refusé', 'bg-danger-50 text-danger'],
    DRAFT: ['Brouillon', 'bg-black/5 text-ink-muted'],
    PUBLISHED: ['Publié', 'bg-success-50 text-success'],
    ARCHIVED: ['Archivé', 'bg-black/5 text-ink-muted'],
  };
  const [label, cls] = map[status] ?? [status, 'bg-black/5'];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}
