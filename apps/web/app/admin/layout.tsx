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
      { href: '/admin/finances', label: 'Finances', show: can('finance.ledger.view') },
      { href: '/admin/restaurants', label: 'Restaurants', show: can('admin.restaurants.view') },
      { href: '/admin/livreurs', label: 'Livreurs', show: can('admin.couriers.review') },
      { href: '/admin/performance', label: 'Performance livreurs', show: can('admin.couriers.review') },
      { href: '/admin/clients', label: 'Clients', show: can('support.customers.view') },
      { href: '/admin/assistance', label: 'Assistance', show: can('support.tickets.manage') },
      { href: '/admin/avis', label: 'Avis', show: can('admin.reviews.moderate') },
      { href: '/admin/commercial', label: 'Commercial', show: can('commercial.coupons.manage') || can('commercial.plans.manage') || can('commercial.ads.manage') || can('admin.content.manage') },
      { href: '/admin/zones', label: 'Zones et frais', show: can('admin.zones.manage') },
      { href: '/admin/cuisines', label: 'Catégories', show: can('admin.content.manage') },
      { href: '/admin/parametres', label: 'Paramètres', show: can('admin.settings.view') },
      { href: '/admin/personnel', label: 'Personnel', show: can('admin.staff.manage') },
      { href: '/admin/journal', label: 'Journal d’audit', show: can('admin.audit.view') },
    ]}>
      {children}
    </ConsoleShell>
  );
}
