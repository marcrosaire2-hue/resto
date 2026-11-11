import Link from 'next/link';
import { MobileScreen } from '@/components/mobile';

/** Écran d'ouverture — maquette 1, écran 1. */
export default function SplashPage() {
  return (
    <MobileScreen className="bg-surface">
      <section className="relative h-[64dvh] min-h-[430px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <picture>
          <source srcSet="/brand/accueil-livreur.webp" type="image/webp" />
          <img src="/brand/accueil-livreur.jpg" alt="Livreur à vélo transportant un sac de livraison orange sur une route de montagne"
            fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[56%_center]" />
        </picture>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white" aria-hidden />
        <div className="absolute left-5 top-6 flex items-center gap-2 text-[17px] font-bold text-white drop-shadow">
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden><path d="M4 11a8 8 0 0 1 16 0H4Zm-1 2h18v1.5A2.5 2.5 0 0 1 18.5 17h-13A2.5 2.5 0 0 1 3 14.5V13Zm4 5h10l-.6 1.5a1 1 0 0 1-.9.5H8.5a1 1 0 0 1-.9-.5L7 18Z" /></svg>
          Marketplace
        </div>
        {/* Étiquette « ticket » de la maquette */}
        <div className="absolute bottom-10 left-6 -rotate-[10deg]">
          <div className="relative rounded-r-[10px] bg-peach py-2 pl-10 pr-6 shadow-md" style={{ clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 18px 100%, 0 50%)' }}>
            <span className="absolute left-4 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-surface ring-2 ring-brand" aria-hidden />
            <p className="font-[cursive] text-[17px] italic text-ink">Repas frais, vite livrés</p>
            <p className="text-sm text-ink">Partout à <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">Cotonou</span></p>
          </div>
        </div>
      </section>
      <section className="flex flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <h1 className="text-[25px] font-bold leading-snug">Des plats délicieux<br />vous attendent</h1>
        <p className="mx-auto mt-3 max-w-[280px] text-sm text-ink-muted">Des repas frais de vos restaurants préférés, livrés vite et prêts à déguster.</p>
        <div className="mt-auto pt-8">
          <Link href="/accueil" className="flex h-14 w-full items-center justify-center rounded-[14px] bg-cta text-[15px] font-semibold text-white shadow-[var(--shadow-raised)] active:scale-[0.98]">
            Commencer
          </Link>
        </div>
      </section>
    </MobileScreen>
  );
}
