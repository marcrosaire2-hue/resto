'use client';
import Link from 'next/link';
import { MiamigoLogo } from '@/components/brand/miamigo-logo';
import { useSession } from '@/lib/session';

/** Écran 1 — Lancement : fond sombre, logo, promesse, photo de plat, « Commencer » et lien de connexion. */
export default function SplashPage() {
  const { me } = useSession();
  return (
    <main className="client-brand relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#141110] text-white">
      {/* Photo de plat en bas, fondue dans le noir vers le haut */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/demo/plat-detail.jpg" alt="" aria-hidden fetchPriority="high"
        className="absolute inset-x-0 bottom-0 -z-20 h-[62%] w-full object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#141110_0%,#141110_36%,rgba(20,17,16,.55)_58%,rgba(20,17,16,.15)_72%,rgba(20,17,16,.85)_100%)]" aria-hidden />

      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,env(safe-area-inset-top))] text-center">
        <MiamigoLogo tone="light" layout="stack" />
        <p className="mt-3 text-[15px] font-medium text-white/85">Bons plats, livraison rapide</p>

        <div className="flex-1" />

        <Link href={me ? '/accueil' : '/connexion'}
          className="bg-cta flex h-14 w-full items-center justify-center rounded-2xl text-[15px] font-bold text-white shadow-[var(--shadow-raised)] transition-transform active:scale-[.98]">
          {me ? 'Commander' : 'Commencer'}
        </Link>
        {!me && (
          <p className="mt-4 text-sm text-white/80">
            Déjà un compte ? <Link href="/connexion" className="font-bold text-white hover:underline">Se connecter</Link>
          </p>
        )}
      </div>
    </main>
  );
}
