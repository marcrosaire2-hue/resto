import { ReactNode } from 'react';
import { cn } from './cn';
import { IconAlert, IconCheck, IconInfo } from './icons';

type Tone = 'info' | 'success' | 'warning' | 'danger';
const tones: Record<Tone, string> = {
  info: 'bg-brand-50 text-ink border-brand-100',
  success: 'bg-success-50 text-success border-success/20',
  warning: 'bg-warning-50 text-warning border-warning/20',
  danger: 'bg-danger-50 text-danger border-danger/20',
};

export function Alert({ tone = 'info', title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === 'success' ? IconCheck : tone === 'info' ? IconInfo : IconAlert;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-[var(--radius-md)] border p-3.5 text-sm', tones[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
