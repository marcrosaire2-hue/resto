import Link from 'next/link';
import { cn } from './cn';

/**
 * Logo officiel Miamigo (lettrage « miamigo » avec lignes de vitesse et épingle orange).
 * `light` : version à lettres blanches pour les fonds sombres. La hauteur se règle via `className` (h-8 par défaut).
 */
export function Logo({ className, light, href = '/' }: { className?: string; light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex shrink-0 items-center', className)} aria-label="Miamigo, accueil">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light ? '/brand/miamigo-wordmark-light.png' : '/brand/miamigo-wordmark.png'} alt="Miamigo" width={720} height={144}
        className="h-8 w-auto select-none" draggable={false} />
    </Link>
  );
}

/** Logo complet (main, cloche, lettrage et slogan) pour les grands formats : lancement, animation d'accueil. */
export function LogoFull({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/miamigo-logo.png" alt="Miamigo — Découvrez, commandez, recevez" width={900} height={716}
      className={cn('h-auto select-none', className)} draggable={false} />
  );
}
