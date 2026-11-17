import Link from 'next/link';
import { AppIcon } from './app-icon';
import { cn } from './cn';

export function Logo({ className, light, href = '/' }: { className?: string; light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', light ? 'text-white' : 'text-ink', className)} aria-label="Miamigo, accueil">
      <span className={cn('grid size-9 place-items-center rounded-xl', light ? 'bg-white text-brand' : 'bg-brand text-white')}>
        <AppIcon name="utensils" className="size-5" />
      </span>
      <span className="text-lg">Miamigo<span className="text-brand">.</span></span>
    </Link>
  );
}
