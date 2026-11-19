'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ONBOARDED_KEY } from '@/lib/onboarding';
import { useSession } from '@/lib/session';

/** Écran 1 — Lancement : photo de plat sur fond sombre, logo officiel (version claire), « Commencer » et connexion. */
export default function SplashPage() {
  const { me } = useSession();
  const router = useRouter();
  // Première visite : présentation en 3 étapes (écran 2) ; ensuite, directement la connexion.
  const start = () => {
    let seen = false;
    try { seen = localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { /* navigation privée */ }
    router.push(me ? '/accueil' : seen ? '/connexion' : '/bienvenue');
  };
  return (
    <main className="client-brand relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#141110] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/demo/plat-detail.jpg" alt="" aria-hidden fetchPriority="high"
        className="absolute inset-0 -z-20 size-full object-cover object-[50%_70%]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(20,17,16,.92)_0%,rgba(20,17,16,.78)_38%,rgba(20,17,16,.25)_62%,rgba(20,17,16,.35)_80%,rgba(20,17,16,.9)_100%)]" aria-hidden />
      <div className="absolute left-1/2 top-[22%] -z-10 size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(247,121,15,.38)_0%,rgba(247,121,15,.12)_45%,transparent_70%)]" aria-hidden />

      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miamigo-logo-light.png" alt="Miamigo — Découvrez, commandez, recevez" width={900} height={716}
          className="h-auto w-[min(84vw,340px)] select-none drop-shadow-[0_6px_24px_rgba(0,0,0,.45)]" draggable={false} />

        <div className="flex-1" />

        <button type="button" onClick={start}
          className="bg-cta flex h-14 w-full items-center justify-center rounded-2xl text-[15px] font-bold text-white shadow-[var(--shadow-raised)] transition-transform active:scale-[.98]">
          {me ? 'Commander' : 'Commencer'}
        </button>
        {!me && (
          <p className="mt-4 text-sm text-white/85">
            Déjà un compte ? <Link href="/connexion" className="font-bold text-white hover:underline">Se connecter</Link>
          </p>
        )}
      </div>
    </main>
  );
}
