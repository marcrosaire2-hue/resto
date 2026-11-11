import { Permission, permissionsOfScope, PermissionScope } from './permissions';

export interface SystemRoleDefinition {
  code: string;
  scope: PermissionScope;
  label: string;
  permissions: readonly Permission[];
}

/** Rôles par défaut des restaurants (docs/02 §2.4). */
export const RESTAURANT_ROLES = [
  {
    code: 'owner',
    scope: 'restaurant',
    label: 'Propriétaire',
    permissions: permissionsOfScope('restaurant'),
  },
  {
    code: 'manager',
    scope: 'restaurant',
    label: 'Gérant',
    permissions: [
      'restaurant.profile.view', 'restaurant.profile.edit', 'restaurant.hours.edit', 'restaurant.zones.edit',
      'restaurant.open_toggle', 'menu.view', 'menu.edit', 'menu.publish', 'menu.availability.toggle',
      'promotions.manage', 'orders.view', 'orders.view_customer_contact', 'orders.accept', 'orders.reject',
      'orders.prepare', 'orders.mark_ready', 'orders.request_courier', 'orders.report_issue',
      'kitchen.view', 'kitchen.update', 'finance.restaurant.view', 'payouts.view', 'staff.view',
      'staff.audit.view', 'reviews.reply',
    ],
  },
  {
    code: 'order_manager',
    scope: 'restaurant',
    label: 'Responsable des commandes',
    permissions: [
      'restaurant.profile.view', 'menu.view', 'menu.availability.toggle', 'orders.view',
      'orders.view_customer_contact', 'orders.accept', 'orders.reject', 'orders.prepare',
      'orders.mark_ready', 'orders.request_courier', 'orders.report_issue', 'kitchen.view', 'kitchen.update',
    ],
  },
  {
    code: 'cook',
    scope: 'restaurant',
    label: 'Cuisinier',
    permissions: ['menu.view', 'menu.availability.toggle', 'orders.view', 'orders.prepare', 'orders.mark_ready', 'kitchen.view', 'kitchen.update'],
  },
  {
    code: 'cashier',
    scope: 'restaurant',
    label: 'Caissier',
    permissions: ['restaurant.profile.view', 'menu.view', 'orders.view', 'finance.restaurant.view', 'payouts.view'],
  },
] as const satisfies readonly SystemRoleDefinition[];

/** Rôles des salariés de la plateforme (docs/02 §2.5). */
export const PLATFORM_ROLES = [
  {
    code: 'super_admin',
    scope: 'platform',
    label: 'Super-administrateur',
    permissions: permissionsOfScope('platform'),
  },
  {
    code: 'operations_manager',
    scope: 'platform',
    label: 'Responsable des opérations',
    permissions: [
      'ops.orders.view_all', 'ops.dispatch.assign', 'ops.dispatch.reassign', 'ops.incidents.manage',
      'ops.incidents.view', 'ops.map.view', 'ops.orders.cancel', 'admin.couriers.review',
      'admin.zones.manage', 'admin.restaurants.view', 'support.tickets.manage', 'support.customers.view',
    ],
  },
  {
    code: 'finance_agent',
    scope: 'platform',
    label: 'Agent financier',
    permissions: [
      'ops.orders.view_all', 'finance.ledger.view', 'finance.refunds.approve', 'finance.payouts.execute',
      'finance.reports.export', 'finance.courier_cash.reconcile', 'commercial.commissions.view', 'admin.restaurants.view',
    ],
  },
  {
    code: 'commercial_manager',
    scope: 'platform',
    label: 'Responsable commercial',
    permissions: [
      'commercial.commissions.view', 'commercial.commissions.edit', 'commercial.plans.manage',
      'commercial.coupons.manage', 'commercial.ads.manage', 'admin.content.manage',
      'admin.restaurants.view', 'admin.restaurants.review',
    ],
  },
  {
    code: 'support_agent',
    scope: 'platform',
    label: 'Agent support',
    permissions: ['ops.orders.view_all', 'ops.incidents.view', 'support.tickets.manage', 'support.customers.view'],
  },
  {
    code: 'marketing_manager',
    scope: 'platform',
    label: 'Responsable marketing',
    permissions: ['commercial.coupons.manage', 'commercial.ads.manage', 'admin.content.manage'],
  },
] as const satisfies readonly SystemRoleDefinition[];

export type RestaurantRoleCode = (typeof RESTAURANT_ROLES)[number]['code'];
export type PlatformRoleCode = (typeof PLATFORM_ROLES)[number]['code'];
export const RESTAURANT_ROLE_CODES = RESTAURANT_ROLES.map((r) => r.code) as RestaurantRoleCode[];
export const PLATFORM_ROLE_CODES = PLATFORM_ROLES.map((r) => r.code) as PlatformRoleCode[];

export function restaurantRole(code: string): SystemRoleDefinition | undefined {
  return RESTAURANT_ROLES.find((r) => r.code === code);
}
export function platformRole(code: string): SystemRoleDefinition | undefined {
  return PLATFORM_ROLES.find((r) => r.code === code);
}
