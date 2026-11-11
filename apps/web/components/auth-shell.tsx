import { ReactNode } from 'react';
import { CircleButton, MobileScreen } from './mobile';
import { IconArrowLeft } from './ui';

/** Écrans d'authentification client : en-tête dégradé orange (maquette 1, écran 3) et carte blanche. */
export function AuthShell({ title, subtitle, children, footer, backHref = '/accueil' }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; backHref?: string;
}) {
  return (
    <MobileScreen>
      <div className="bg-header-orange rounded-b-[28px] px-5 pb-14 pt-6">
        <CircleButton href={backHref} label="Retour"><IconArrowLeft className="size-5" /></CircleButton>
        <h1 className="mt-6 text-[26px] font-extrabold leading-tight text-white drop-shadow-sm">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] font-medium text-white/90">{subtitle}</p>}
      </div>
      <div className="-mt-9 flex-1 px-5 pb-8">
        <div className="rounded-[24px] bg-surface p-5 shadow-[var(--shadow-card)]">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </MobileScreen>
  );
}
