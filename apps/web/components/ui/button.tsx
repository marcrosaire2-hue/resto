import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-cta text-white hover:brightness-105 shadow-[var(--shadow-raised)] disabled:shadow-none',
  secondary: 'bg-brand-50 text-brand-600 hover:bg-brand-100',
  outline: 'border border-brand text-brand-600 bg-surface hover:bg-brand-50',
  ghost: 'text-ink hover:bg-black/5',
  danger: 'bg-danger text-white hover:brightness-95',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-[var(--radius-sm)]',
  md: 'h-12 px-5 text-[15px] rounded-[14px]',
  lg: 'h-14 px-6 text-base rounded-[14px]',
};

/** Classes d'un bouton, réutilisables sur un lien (<Link className={buttonStyles()}>) sans imbriquer de <button>. */
export function buttonStyles({ variant = 'primary', size = 'md', block }: { variant?: Variant; size?: Size; block?: boolean } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
    variants[variant], sizes[size], block && 'w-full',
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

/** Bouton : désactivé pendant le chargement pour empêcher les doubles soumissions. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});
