/**
 * Catalogue unique des permissions. Le code vérifie toujours une permission,
 * jamais un nom de rôle. Voir docs/02-roles-et-permissions.md.
 */
export const PERMISSION_SCOPES = ['platform', 'restaurant'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const PERMISSIONS = {
  // --- Périmètre restaurant ---
  'restaurant.profile.view': { scope: 'restaurant', label: "Voir le profil de l'établissement" },
  'restaurant.profile.edit': { scope: 'restaurant', label: "Modifier le profil de l'établissement" },
  'restaurant.hours.edit': { scope: 'restaurant', label: 'Modifier les horaires' },
  'restaurant.zones.edit': { scope: 'restaurant', label: 'Modifier les zones desservies' },
  'restaurant.open_toggle': { scope: 'restaurant', label: 'Ouvrir / fermer les commandes' },
  'menu.view': { scope: 'restaurant', label: 'Voir le menu' },
  'menu.edit': { scope: 'restaurant', label: 'Modifier le menu' },
  'menu.publish': { scope: 'restaurant', label: 'Publier le menu' },
  'menu.availability.toggle': { scope: 'restaurant', label: "Changer la disponibilité d'un plat" },
  'promotions.manage': { scope: 'restaurant', label: 'Gérer les promotions' },
  'orders.view': { scope: 'restaurant', label: 'Voir les commandes' },
  'orders.view_customer_contact': { scope: 'restaurant', label: 'Voir le contact client' },
  'orders.accept': { scope: 'restaurant', label: 'Accepter une commande' },
  'orders.reject': { scope: 'restaurant', label: 'Refuser une commande' },
  'orders.prepare': { scope: 'restaurant', label: 'Démarrer la préparation' },
  'orders.mark_ready': { scope: 'restaurant', label: 'Marquer comme prête' },
  'orders.request_courier': { scope: 'restaurant', label: 'Demander un livreur' },
  'orders.report_issue': { scope: 'restaurant', label: 'Signaler un problème' },
  'kitchen.view': { scope: 'restaurant', label: "Voir l'écran cuisine" },
  'kitchen.update': { scope: 'restaurant', label: "Agir sur l'écran cuisine" },
  'finance.restaurant.view': { scope: 'restaurant', label: 'Voir les finances du restaurant' },
  'payouts.view': { scope: 'restaurant', label: 'Voir les versements' },
  'staff.view': { scope: 'restaurant', label: 'Voir le personnel' },
  'staff.manage': { scope: 'restaurant', label: 'Gérer le personnel' },
  'staff.audit.view': { scope: 'restaurant', label: "Voir l'historique des actions" },
  'reviews.reply': { scope: 'restaurant', label: 'Répondre aux avis' },

  // --- Périmètre plateforme ---
  'ops.orders.view_all': { scope: 'platform', label: 'Voir toutes les commandes' },
  'ops.dispatch.assign': { scope: 'platform', label: 'Affecter un livreur' },
  'ops.dispatch.reassign': { scope: 'platform', label: 'Réaffecter une course' },
  'ops.incidents.manage': { scope: 'platform', label: 'Gérer les incidents' },
  'ops.incidents.view': { scope: 'platform', label: 'Voir les incidents' },
  'ops.map.view': { scope: 'platform', label: 'Voir la carte opérationnelle' },
  'ops.orders.cancel': { scope: 'platform', label: 'Annuler une commande' },
  'finance.ledger.view': { scope: 'platform', label: 'Voir le grand livre' },
  'finance.refunds.approve': { scope: 'platform', label: 'Approuver les remboursements' },
  'finance.payouts.execute': { scope: 'platform', label: 'Exécuter les versements' },
  'finance.reports.export': { scope: 'platform', label: 'Exporter les rapports' },
  'finance.courier_cash.reconcile': { scope: 'platform', label: 'Rapprocher les espèces des livreurs' },
  'commercial.commissions.view': { scope: 'platform', label: 'Voir les commissions' },
  'commercial.commissions.edit': { scope: 'platform', label: 'Modifier les commissions' },
  'commercial.plans.manage': { scope: 'platform', label: 'Gérer les abonnements' },
  'commercial.coupons.manage': { scope: 'platform', label: 'Gérer les coupons' },
  'commercial.ads.manage': { scope: 'platform', label: 'Gérer les publicités' },
  'admin.restaurants.view': { scope: 'platform', label: 'Voir tous les restaurants' },
  'admin.restaurants.review': { scope: 'platform', label: 'Valider les restaurants' },
  'admin.restaurants.suspend': { scope: 'platform', label: 'Suspendre un restaurant' },
  'admin.couriers.review': { scope: 'platform', label: 'Valider les livreurs' },
  'admin.users.manage': { scope: 'platform', label: 'Gérer les utilisateurs' },
  'admin.staff.manage': { scope: 'platform', label: 'Gérer les salariés de la plateforme' },
  'admin.settings.view': { scope: 'platform', label: 'Voir les paramètres' },
  'admin.settings.edit': { scope: 'platform', label: 'Modifier les paramètres' },
  'admin.zones.manage': { scope: 'platform', label: 'Gérer les zones' },
  'admin.content.manage': { scope: 'platform', label: "Gérer le contenu de l'accueil" },
  'admin.audit.view': { scope: 'platform', label: "Voir le journal d'audit" },
  'admin.reviews.moderate': { scope: 'platform', label: 'Modérer les avis' },
  'support.tickets.manage': { scope: 'platform', label: 'Gérer les tickets' },
  'support.customers.view': { scope: 'platform', label: 'Voir les clients' },
} as const satisfies Record<string, { scope: PermissionScope; label: string }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function permissionsOfScope(scope: PermissionScope): Permission[] {
  return ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].scope === scope);
}

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
