import Link from 'next/link';
import { MobileScreen } from '@/components/mobile';
import { AppIcon } from '@/components/ui';

export default function SplashPage() {
  return (
    <MobileScreen wide className="!max-w-none bg-surface md:!pt-0">
      <div className="md:hidden">
        <section className="auth-hero relative h-[54svh] min-h-[330px] max-h-[560px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/accueil-livreur.webp"
            alt="Un livreur à vélo transportant une commande sur la route"
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[50%_43%]"
          />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-white/45 to-white" aria-hidden />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/35 to-transparent" aria-hidden />
          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-3 py-2 text-[17px] font-bold text-white shadow-sm backdrop-blur-md">
            <AppIcon name="utensils" className="size-5" />
            Miamigo
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-[720px] flex-col items-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 text-center sm:px-8">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
            Vos envies, notre livraison.
          </h1>
          <p className="mx-auto mt-2 max-w-[440px] text-sm leading-relaxed text-ink-muted sm:text-base">
            Le meilleur de Cotonou, à portée de main.
          </p>
          <div className="mx-auto mt-6 w-full max-w-[440px] sm:mt-7">
            <Link href="/connexion" className="flex h-14 w-full items-center justify-center gap-2 rounded-[16px] bg-cta text-[15px] font-bold text-white shadow-[var(--shadow-raised)] transition-transform hover:-translate-y-0.5 active:scale-[.98]">
              Découvrir
              <AppIcon name="arrow-right" className="size-5" />
            </Link>
          </div>
        </section>
      </div>

      <main className="relative hidden min-h-dvh grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] md:grid">
        <section className="auth-hero relative isolate min-h-dvh min-w-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/accueil-livreur.webp"
            alt="Un livreur à vélo transportant une commande sur la route"
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[50%_48%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,38,28,.32)_0%,transparent_32%,rgba(8,38,28,.62)_100%)]" aria-hidden />
          <div className="absolute left-12 top-10 flex items-center gap-2 rounded-full border border-white/25 bg-black/15 px-4 py-2.5 text-lg font-bold text-white shadow-sm backdrop-blur-md xl:left-16 xl:top-12">
            <AppIcon name="utensils" className="size-5" />
            Miamigo
          </div>
          <div className="absolute bottom-14 left-12 max-w-2xl text-white xl:bottom-20 xl:left-16">
            <p className="text-sm font-bold uppercase tracking-[.22em] text-white/85">Les bonnes adresses de Cotonou</p>
            <p className="mt-4 text-4xl font-extrabold leading-tight tracking-tight drop-shadow-lg xl:text-6xl">
              Le goût d’ici,<br />livré avec le sourire.
            </p>
          </div>
          <div className="absolute right-8 top-1/2 size-72 -translate-y-1/2 rounded-full border border-white/15 bg-white/5 blur-[1px] xl:right-16 xl:size-96" aria-hidden />
        </section>
        <section className="relative flex min-h-dvh min-w-0 items-center justify-center overflow-hidden bg-canvas px-8 py-12 xl:px-16">
          <div className="pointer-events-none absolute -right-36 -top-32 size-[520px] rounded-full bg-brand-50 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-40 -left-28 size-[480px] rounded-full bg-peach/60 blur-3xl" aria-hidden />
          <div className="auth-reveal relative w-full min-w-0 max-w-[560px]">
            <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-brand/10 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-brand shadow-sm xl:mb-8">
              <AppIcon name="sparkles" className="size-4" />
              Bienvenue chez Miamigo
            </div>
            <h1 className="max-w-xl break-words text-4xl font-extrabold leading-[1.08] tracking-tight text-ink lg:text-5xl xl:text-6xl">
              Vos envies,<br /><span className="text-brand">notre livraison.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-muted lg:mt-6 lg:text-lg">
              Les saveurs de Cotonou, à portée de main.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3 text-sm font-semibold text-ink-muted lg:mt-10 lg:gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 shadow-sm">
                <AppIcon name="map-pin" className="size-4 text-brand" /> Cotonou
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 shadow-sm">
                <AppIcon name="motorcycle" className="size-4 text-brand" /> Livraison locale
              </span>
            </div>
            <Link href="/connexion" className="mt-7 flex h-14 w-full max-w-[420px] items-center justify-center gap-3 rounded-2xl bg-cta text-base font-bold text-white shadow-[var(--shadow-raised)] transition duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[.99] lg:mt-10 lg:h-16">
              Découvrir
              <AppIcon name="arrow-right" className="size-5" />
            </Link>
            <p className="mt-5 text-sm text-ink-muted">Les bons plats et les bonnes adresses, réunis au même endroit.</p>
          </div>
        </section>
      </main>
    </MobileScreen>
  );
}
