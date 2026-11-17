import { ReactNode } from 'react';
import { CircleButton, MobileScreen } from './mobile';
import { AppIcon, IconArrowLeft, Logo } from './ui';

/** Écrans d'authentification client, adaptés aux petits et grands écrans. */
export function AuthShell({ title, subtitle, children, footer, backHref = '/', imageSrc = '/demo/plat-detail.jpg' }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; backHref?: string; imageSrc?: string;
}) {
  return (
    <MobileScreen wide className="!max-w-none min-h-dvh overflow-visible bg-canvas md:!pt-0">
      <header className="auth-page-header absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 md:left-0 md:right-auto md:px-10 md:pt-8 xl:px-14">
        <Logo href="/" light />
        <div className="flex items-center gap-3">
          <p className="hidden text-sm font-medium text-white/90 sm:block md:hidden">Les bonnes adresses de Cotonou</p>
          <CircleButton href={backHref} label="Retour à l’accueil"><IconArrowLeft className="size-5" /></CircleButton>
        </div>
      </header>

      <main className="auth-page-layout relative z-10 grid min-h-dvh flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(480px,.92fr)] lg:grid-cols-[minmax(0,1.04fr)_minmax(520px,.96fr)]">
        <section className="auth-visual relative isolate flex min-h-[300px] flex-col justify-end overflow-hidden px-6 pb-12 pt-24 text-white sm:min-h-[340px] sm:px-10 md:min-h-dvh md:px-10 md:pb-14 md:pt-32 xl:px-16 xl:pb-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" className="absolute inset-0 -z-20 size-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(17,52,37,.28)_0%,rgba(17,52,37,.02)_35%,rgba(13,47,33,.82)_100%)] md:bg-[linear-gradient(180deg,rgba(17,52,37,.12)_0%,rgba(17,52,37,.02)_28%,rgba(13,47,33,.82)_100%)]" aria-hidden />
          <div className="absolute right-6 top-24 hidden items-center gap-2 rounded-full border border-white/60 bg-white/90 px-4 py-2.5 text-xs font-extrabold text-[#17684A] shadow-[0_12px_30px_rgb(0_0_0/0.12)] backdrop-blur-md sm:flex md:right-10 md:top-28 xl:right-14">
            <AppIcon name="star" className="size-4 fill-current" /> Le goût de Cotonou
          </div>
          <div className="auth-visual-copy relative mx-auto w-full max-w-[620px] md:mx-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#def0ae] sm:text-xs">Les bonnes adresses de Cotonou</p>
            <h2 className="mt-3 max-w-xl text-3xl font-extrabold leading-[1.08] tracking-tight drop-shadow-lg sm:text-4xl md:text-4xl lg:text-5xl xl:text-6xl">
              Le bonheur<br className="hidden md:block" /> a le goût d’ici.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base md:mt-4 md:text-lg">
              {title === 'Créer votre compte'
                ? 'Rejoignez Miamigo et faites-vous livrer vos plats préférés, simplement.'
                : 'Un plat qui vous plaît, une adresse de confiance, et le plaisir arrive chez vous.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 sm:mt-7 sm:gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-bold backdrop-blur-md sm:px-4 sm:text-xs">
                <AppIcon name="map-pin" className="size-4 text-[#def0ae]" /> Cotonou
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-bold backdrop-blur-md sm:px-4 sm:text-xs">
                <AppIcon name="motorcycle" className="size-4 text-[#def0ae]" /> Livraison locale
              </span>
            </div>
          </div>
        </section>

        <section className="auth-form-side relative z-10 -mt-6 flex min-w-0 items-center justify-center rounded-t-[28px] bg-canvas px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-8 md:mt-0 md:min-h-dvh md:rounded-none md:px-8 md:py-12 lg:px-12 xl:px-16">
          <div className="auth-reveal w-full min-w-0 max-w-[500px]">
            <div className="mb-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-brand sm:text-xs">Votre espace Miamigo</p>
              <h1 className="mt-2 text-[25px] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl lg:text-[34px]">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-muted sm:text-base">{subtitle}</p>}
            </div>
            <div className="rounded-[22px] border border-line/80 bg-white p-4 shadow-[0_16px_44px_rgb(23_48_36/0.08)] sm:rounded-[26px] sm:p-6 md:border-white md:p-7 lg:p-8">
              {children}
              {footer && <div className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-muted">{footer}</div>}
            </div>
            <p className="mt-4 text-center text-[11px] text-ink-muted md:text-xs">Des saveurs locales, préparées avec soin.</p>
          </div>
        </section>
      </main>
    </MobileScreen>
  );
}
