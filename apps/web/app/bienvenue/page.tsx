'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ONBOARDED_KEY } from '@/lib/onboarding';
import { useSession } from '@/lib/session';

const SLIDES = [
  { img: '/brand/accueil-livreur.webp', pos: '58% 38%', title: 'Livraison rapide et fiable', text: 'Vos plats préférés, livrés chauds et frais jusqu’à votre porte.' },
  { img: '/demo/plat-zuppa.jpg', pos: '50% 50%', title: 'Les bonnes tables de Cotonou', text: 'Découvrez les restaurants près de chez vous et parcourez leurs menus.' },
  { img: '/demo/commande.jpg', pos: '50% 50%', title: 'Commandez en toute simplicité', text: 'Payez par Mobile Money ou en espèces, et suivez votre commande étape par étape.' },
] as const;

/** Écran 2 — Présentation en 3 étapes : illustration, titre, texte, points, « Suivant » et « Passer ». */
export default function WelcomePage() {
  const router = useRouter();
  const { me } = useSession();
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  const finish = () => {
    try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* navigation privée : on continue */ }
    router.replace(me ? '/accueil' : '/connexion');
  };
  const go = (n: number) => setI(Math.min(SLIDES.length - 1, Math.max(0, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') setI((n) => Math.min(SLIDES.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1)); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="client-brand flex min-h-dvh flex-col bg-white"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
      }}>
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative w-full overflow-hidden rounded-[32px] bg-brand-50 shadow-[var(--shadow-card)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={s.img} src={s.img} alt="" className="auth-reveal aspect-[4/4.3] w-full object-cover" style={{ objectPosition: s.pos }} />
          </div>

          <h1 key={s.title} className="auth-reveal mt-9 text-center text-[26px] font-extrabold leading-tight tracking-tight text-ink">{s.title}</h1>
          <p key={s.text} className="auth-reveal mt-3 max-w-[330px] text-center text-[15px] leading-relaxed text-ink-muted" aria-live="polite">{s.text}</p>

          <div className="mt-6 flex items-center gap-2" role="tablist" aria-label="Étapes de la présentation">
            {SLIDES.map((x, n) => (
              <button key={x.title} type="button" role="tab" aria-selected={n === i} aria-label={`Étape ${n + 1} sur ${SLIDES.length}`} onClick={() => setI(n)}
                className={`h-2 rounded-full transition-all duration-300 ${n === i ? 'w-6 bg-brand' : 'w-2 bg-[#d9dce1]'}`} />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <button type="button" onClick={() => (last ? finish() : go(i + 1))}
            className="bg-cta flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-bold text-white shadow-[var(--shadow-raised)] transition-transform active:scale-[.98]">
            {last ? 'Commencer' : 'Suivant'}
          </button>
          <button type="button" onClick={finish} className={`mt-4 block w-full text-center text-[15px] font-medium text-ink-muted transition-opacity ${last ? 'pointer-events-none opacity-0' : ''}`} aria-hidden={last} tabIndex={last ? -1 : 0}>
            Passer
          </button>
        </div>
      </div>
    </main>
  );
}
