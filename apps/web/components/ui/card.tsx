import { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-card)]', className)} {...rest} />;
}
