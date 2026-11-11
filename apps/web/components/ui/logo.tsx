import Link from 'next/link';
import { cn } from './cn';

/** Logo provisoire : le nom commercial définitif est à fournir (décision D5). */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', light ? 'text-white' : 'text-ink', className)} aria-label="Accueil">
      <span className={cn('grid size-9 place-items-center rounded-[10px] text-lg', light ? 'bg-white text-brand' : 'bg-brand text-white')}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M4 11a8 8 0 0 1 16 0H4Zm-1 2h18v1.5A2.5 2.5 0 0 1 18.5 17h-13A2.5 2.5 0 0 1 3 14.5V13Zm4 5h10l-.6 1.5a1 1 0 0 1-.9.5H8.5a1 1 0 0 1-.9-.5L7 18Z" /></svg>
      </span>
      <span className="text-lg">Marketplace<span className="text-brand">.</span></span>
    </Link>
  );
}
