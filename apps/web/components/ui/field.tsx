'use client';
import { forwardRef, InputHTMLAttributes, ReactNode, useId, useState } from 'react';
import { cn } from './cn';
import { IconEye, IconEyeOff } from './icons';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  leading?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, leading, className, id, type, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">{label}</label>
      <div
        className={cn(
          'flex h-12 items-center gap-2 rounded-[var(--radius-md)] border bg-surface px-3.5 transition-colors',
          'focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-50',
          error ? 'border-danger' : 'border-line',
        )}
      >
        {leading && <span className="text-ink-muted">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className="h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-muted/70"
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="rounded p-1 text-ink-muted hover:text-ink"
            aria-label={reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {reveal ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
});
