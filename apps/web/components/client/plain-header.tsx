'use client';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { AppIcon } from '@/components/ui';
import { cn } from '@/components/ui/cn';

/** En-tête photo responsive des pages client secondaires. */
export function PlainHeader({ title, right, backHref, className }: { title: string; right?: ReactNode; backHref?: string; className?: string }) {
  const router = useRouter();
  return (
    <header className={cn('desktop-page-header flex items-center gap-3 px-4 pb-3 pt-5', className)}>
      <button type="button" aria-label="Retour" onClick={() => (backHref ? router.push(backHref) : router.back())} className="-ml-1 grid size-10 place-items-center rounded-xl text-ink transition-colors hover:bg-canvas">
        <AppIcon name="arrow-left" className="size-5" />
      </button>
      <h1 className="flex-1 text-[22px] font-bold">{title}</h1>
      {right}
    </header>
  );
}
