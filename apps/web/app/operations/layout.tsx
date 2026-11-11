'use client';
import { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { useSession } from '@/lib/session';

export default function OpsLayout({ children }: { children: ReactNode }) {
  const { me } = useSession();
  if (me && !me.platformPermissions.includes('ops.orders.view_all')) {
    return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-bold">Accès réservé à l’équipe des opérations</p><a href="/accueil" className="text-sm text-brand">Retour</a></div></div>;
  }
  return (
    <ConsoleShell title="Opérations" subtitle="Dispatch et suivi" nav={[
      { href: '/operations', label: 'Dispatch' },
      { href: '/operations/commandes', label: 'Commandes' },
      { href: '/operations/carte', label: 'Carte' },
      { href: '/operations/incidents', label: 'Incidents' },
    ]}>{children}</ConsoleShell>
  );
}
