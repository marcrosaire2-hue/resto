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
      { href: '/admin', label: 'Vue d’ensemble', icon: 'layout-dashboard' },
      { href: '/admin/finances', label: 'Finances', icon: 'wallet', show: can('finance.ledger.view') },
      { href: '/admin/restaurants', label: 'Restaurants', icon: 'store', show: can('admin.restaurants.view') },
      { href: '/admin/livreurs', label: 'Livreurs', icon: 'truck', show: can('admin.couriers.review') },
      { href: '/admin/performance', label: 'Performance livreurs', icon: 'chart-no-axes-combined', show: can('admin.couriers.review') },
      { href: '/admin/clients', label: 'Clients', icon: 'users', show: can('support.customers.view') },
      { href: '/admin/assistance', label: 'Assistance', icon: 'headset', show: can('support.tickets.manage') },
      { href: '/admin/avis', label: 'Avis', icon: 'star', show: can('admin.reviews.moderate') },
      { href: '/admin/commercial', label: 'Commercial', icon: 'megaphone', show: can('commercial.coupons.manage') || can('commercial.plans.manage') || can('commercial.ads.manage') || can('admin.content.manage') },
      { href: '/admin/zones', label: 'Zones et frais', icon: 'map-pin', show: can('admin.zones.manage') },
      { href: '/admin/cuisines', label: 'Catégories', icon: 'chef-hat', show: can('admin.content.manage') },
      { href: '/admin/parametres', label: 'Paramètres', icon: 'settings', show: can('admin.settings.view') },
      { href: '/admin/personnel', label: 'Personnel', icon: 'users', show: can('admin.staff.manage') },
      { href: '/admin/journal', label: 'Journal d’audit', icon: 'scroll-text', show: can('admin.audit.view') },
    ]} variant="admin">
      {children}
    </ConsoleShell>
  );
}
