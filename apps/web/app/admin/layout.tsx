'use client';
import { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { useSession } from '@/lib/session';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const can = (p: string) => !!me?.platformPermissions.includes(p);
  if (me && me.platformRoles.length === 0) {
    return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><p className="font-bold">Accès réservé aux salariés de la plateforme</p><a href="/accueil" className="text-sm text-brand">Retour</a></div></div>;
  }
  return (
    <ConsoleShell title="Administration" subtitle="Plateforme" nav={[
      { href: '/admin', label: 'Vue d’ensemble' },
      { href: '/admin/restaurants', label: 'Restaurants', show: can('admin.restaurants.view') },
      { href: '/admin/livreurs', label: 'Livreurs', show: can('admin.couriers.review') },
      { href: '/admin/zones', label: 'Zones et frais', show: can('admin.zones.manage') },
      { href: '/admin/cuisines', label: 'Catégories', show: can('admin.content.manage') },
      { href: '/admin/parametres', label: 'Paramètres', show: can('admin.settings.view') },
    ]}>
      {children}
    </ConsoleShell>
  );
}
