import { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | 'dark';
const tones: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success',
  danger: 'bg-danger-50 text-danger',
  warning: 'bg-warning-50 text-warning',
  neutral: 'bg-black/5 text-ink-muted',
  dark: 'bg-ink/75 text-white backdrop-blur',
};

export function Badge({ tone = 'brand', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}
