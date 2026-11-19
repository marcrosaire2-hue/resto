import Link from 'next/link';
import { cn } from '@/components/ui/cn';

/** Pictogramme Miamigo : épingle de localisation orange, fourchette et couteau en blanc. */
export function MiamigoPin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={cn('shrink-0', className)} aria-hidden="true">
      <path d="M24 2C12.4 2 3 11.2 3 22.6 3 37.5 20.4 51.8 22.4 53.4a2.5 2.5 0 0 0 3.2 0C27.6 51.8 45 37.5 45 22.6 45 11.2 35.6 2 24 2Z" fill="#F7790F" />
      <path d="M24 2C12.4 2 3 11.2 3 22.6c0 3 .7 6 1.9 8.8C8.8 17.9 20 8.2 33.6 5.2A21.3 21.3 0 0 0 24 2Z" fill="#FF9B3D" opacity=".55" />
      {/* fourchette */}
      <path d="M17 12v8.2c0 1.7 1.1 3.1 2.6 3.6V38a1.4 1.4 0 0 0 2.8 0V23.8c1.5-.5 2.6-1.9 2.6-3.6V12h-1.8v7.4h-1.2V12h-1.8v7.4H19V12Z" fill="#fff" />
      {/* couteau */}
      <path d="M30.6 12c-2.6 1.6-4.1 5-4.1 9.2v4.3h2.7V38a1.4 1.4 0 0 0 2.8 0V12Z" fill="#fff" />
    </svg>
  );
}

/**
 * Logo Miamigo complet. `tone="light"` pour les fonds sombres (texte blanc).
 * `layout="stack"` : pictogramme au-dessus du nom (écran de lancement) ; `inline` : côte à côte (en-têtes).
 */
export function MiamigoLogo({ tone = 'dark', layout = 'inline', href, className }: {
  tone?: 'dark' | 'light'; layout?: 'inline' | 'stack'; href?: string; className?: string;
}) {
  const stack = layout === 'stack';
  const logo = (
    <span className={cn('inline-flex items-center font-extrabold tracking-tight', stack ? 'flex-col gap-3' : 'gap-2', className)}>
      <MiamigoPin className={stack ? 'h-20 w-[68px]' : 'h-9 w-[30px]'} />
      <span className={cn(stack ? 'text-[40px] leading-none' : 'text-[24px] leading-none', tone === 'light' ? 'text-white' : 'text-ink')}>
        Miami<span className={tone === 'light' ? undefined : 'text-brand'}>go</span>
      </span>
    </span>
  );
  return href ? <Link href={href} aria-label="Miamigo, accueil">{logo}</Link> : logo;
}
