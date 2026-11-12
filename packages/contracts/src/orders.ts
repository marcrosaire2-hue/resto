import { z } from 'zod';

/* ===================== Adresses ===================== */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identifiant invalide.');

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'Nom de l’adresse requis.').max(40),
  neighborhoodId: objectId,
  streetLandmark: z.string().trim().min(3, 'Rue ou repère requis.').max(200),
  instructions: z.string().trim().max(300).default(''),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;

/* ===================== Panier (serveur) ===================== */
export const cartItemSchema = z.object({
  productId: objectId,
  qty: z.number().int().min(1).max(99),
  variants: z.record(z.string(), z.string()).default({}),
  addons: z.array(z.string()).max(30).default([]),
  instructions: z.string().trim().max(200).default(''),
});
export type CartItemInput = z.input<typeof cartItemSchema>;

export const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY'] as const; // Mobile Money via FedaPay (MTN, Moov)
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = { CASH: 'Espèces à la livraison', MOBILE_MONEY: 'Mobile Money (MTN, Moov)' };
export const checkoutSchema = z.object({
  addressId: objectId,
  paymentMethod: z.enum(PAYMENT_METHODS),
  customerNote: z.string().trim().max(300).default(''),
  /** Total affiché au client : s'il diffère du recalcul serveur, la commande est refusée (409). */
  expectedTotal: z.number().int().min(0),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Clé d’idempotence invalide.'),
});

/* ===================== Machine à états ===================== */
export const ORDER_STATUSES = [
  'AWAITING_PAYMENT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED',
  'PICKED_UP', 'IN_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED', 'DELIVERY_FAILED', 'REFUND_PENDING', 'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type ActorKind = 'customer' | 'restaurant' | 'courier' | 'ops' | 'finance' | 'system';

export const STATUS_LABELS_FR: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'En attente du paiement', PENDING: 'Commande reçue', ACCEPTED: 'Acceptée par le restaurant', PREPARING: 'En préparation', READY: 'Prête',
  WAITING_FOR_COURIER: 'En attente d’un livreur', COURIER_ASSIGNED: 'Livreur affecté', PICKED_UP: 'Récupérée par le livreur',
  IN_DELIVERY: 'En cours de livraison', DELIVERED: 'Livrée', REJECTED: 'Refusée', CANCELLED: 'Annulée',
  DELIVERY_FAILED: 'Livraison échouée', REFUND_PENDING: 'Remboursement en cours', REFUNDED: 'Remboursée',
};

interface Rule { to: OrderStatus; actors: ActorKind[]; permission?: string; reasonRequired?: boolean }

/** Transitions autorisées (docs/04 §4.2). Toute autre transition est refusée côté serveur. */
export const TRANSITIONS: Record<OrderStatus, Rule[]> = {
  // Paiement en ligne : la commande n'est transmise au restaurant qu'après confirmation vérifiée du prestataire.
  AWAITING_PAYMENT: [
    { to: 'PENDING', actors: ['system'] },
    { to: 'CANCELLED', actors: ['customer', 'ops', 'system'], reasonRequired: true },
  ],
  PENDING: [
    { to: 'ACCEPTED', actors: ['restaurant'], permission: 'orders.accept' },
    { to: 'REJECTED', actors: ['restaurant'], permission: 'orders.reject', reasonRequired: true },
    { to: 'CANCELLED', actors: ['customer', 'ops', 'system'], reasonRequired: true },
  ],
  ACCEPTED: [
    { to: 'PREPARING', actors: ['restaurant'], permission: 'orders.prepare' },
    { to: 'CANCELLED', actors: ['ops'], reasonRequired: true },
  ],
  PREPARING: [
    { to: 'READY', actors: ['restaurant'], permission: 'orders.mark_ready' },
    { to: 'CANCELLED', actors: ['ops'], reasonRequired: true },
  ],
  READY: [
    { to: 'WAITING_FOR_COURIER', actors: ['restaurant', 'system'], permission: 'orders.request_courier' },
    { to: 'COURIER_ASSIGNED', actors: ['ops', 'courier'] },
    { to: 'CANCELLED', actors: ['ops'], reasonRequired: true },
  ],
  WAITING_FOR_COURIER: [
    { to: 'COURIER_ASSIGNED', actors: ['ops', 'courier'] },
    { to: 'CANCELLED', actors: ['ops'], reasonRequired: true },
  ],
  COURIER_ASSIGNED: [
    { to: 'WAITING_FOR_COURIER', actors: ['ops', 'courier'], reasonRequired: true },
    { to: 'PICKED_UP', actors: ['courier'] },
  ],
  PICKED_UP: [{ to: 'IN_DELIVERY', actors: ['courier'] }],
  IN_DELIVERY: [
    { to: 'DELIVERED', actors: ['courier'] },
    { to: 'DELIVERY_FAILED', actors: ['courier', 'ops'], reasonRequired: true },
  ],
  DELIVERY_FAILED: [
    { to: 'WAITING_FOR_COURIER', actors: ['ops'] },
    { to: 'CANCELLED', actors: ['ops'], reasonRequired: true },
    { to: 'REFUND_PENDING', actors: ['ops', 'system'] },
  ],
  REJECTED: [{ to: 'REFUND_PENDING', actors: ['system', 'ops'] }],
  CANCELLED: [{ to: 'REFUND_PENDING', actors: ['system', 'ops'] }],
  REFUND_PENDING: [{ to: 'REFUNDED', actors: ['finance'] }],
  DELIVERED: [],
  REFUNDED: [],
};

export type TransitionCheck = { ok: true; rule: Rule } | { ok: false; error: string };

export function checkTransition(from: OrderStatus, to: OrderStatus, actor: ActorKind, reason?: string | null): TransitionCheck {
  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) return { ok: false, error: `Transition interdite : ${STATUS_LABELS_FR[from]} → ${STATUS_LABELS_FR[to]}.` };
  if (!rule.actors.includes(actor)) return { ok: false, error: 'Vous ne pouvez pas effectuer ce changement de statut.' };
  if (rule.reasonRequired && !reason?.trim()) return { ok: false, error: 'Un motif est obligatoire.' };
  return { ok: true, rule };
}

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED', 'REFUNDED'];
export const ACTIVE_RESTAURANT_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'WAITING_FOR_COURIER', 'COURIER_ASSIGNED'];

/* ===================== Répartition financière (docs/05 §5.2) ===================== */

/** Arrondi au franc le plus proche, demi vers le haut (FCFA sans décimale). */
export const roundFcfa = (x: number) => Math.floor(x + 0.5);

export interface FinancialSplitInput {
  itemsSubtotal: number;
  restaurantDiscount: number;
  platformDiscount: number;
  deliveryFee: number;
  courierPay: number;
  serviceFee: number;
  commissionRateBps: number;
}
export interface FinancialSplit {
  baseRestaurant: number;
  commission: number;
  restaurantNet: number;
  total: number;
  deliveryMargin: number;
}

/** Une seule formule, testée, utilisée par le devis, la commande et le grand livre. */
export function computeSplit(i: FinancialSplitInput): FinancialSplit {
  for (const [k, v] of Object.entries(i)) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`Montant invalide : ${k}`);
  }
  if (i.commissionRateBps > 10_000) throw new Error('Taux de commission invalide');
  const baseRestaurant = i.itemsSubtotal - i.restaurantDiscount;
  if (baseRestaurant < 0) throw new Error('Réduction supérieure au sous-total');
  const commission = roundFcfa((baseRestaurant * i.commissionRateBps) / 10_000);
  const total = baseRestaurant - i.platformDiscount + i.deliveryFee + i.serviceFee;
  if (total < 0) throw new Error('Total négatif');
  return { baseRestaurant, commission, restaurantNet: baseRestaurant - commission, total, deliveryMargin: i.deliveryFee - i.courierPay };
}

/* ===================== Réponses ===================== */
export interface QuoteLine { key: string; productId: string; name: string; imageUrl: string | null; qty: number; unitPrice: number; lineTotal: number; unitDiscount: number; promotionName: string | null; optionLabels: string[]; instructions: string; problem: string | null }
export interface Quote {
  restaurant: { id: string; slug: string; name: string } | null;
  lines: QuoteLine[];
  itemsSubtotal: number;
  restaurantDiscount: number;
  platformDiscount: number;
  coupon: { code: string; applied: boolean; message: string | null } | null;
  deliveryFee: number | null;
  serviceFee: number | null;
  total: number | null;
  blocking: { code: string; message: string }[];
}

export interface OrderView {
  id: string; number: string; status: OrderStatus; statusLabel: string;
  restaurant: { id: string; name: string; slug: string; phone: string | null };
  customer?: { name: string; phone: string | null };
  address: { label: string; neighborhood: string; commune: string; streetLandmark: string; instructions: string };
  items: { name: string; qty: number; unitPrice: number; lineTotal: number; unitDiscount: number; promotionName: string | null; optionLabels: string[]; instructions: string; imageUrl: string | null }[];
  itemsSubtotal: number; restaurantDiscount: number; platformDiscount: number; deliveryFee: number; serviceFee: number; total: number;
  refundedTotal?: number; reviewed?: boolean;
  paymentMethod: string; paymentStatus: string; customerNote: string;
  rejectReason: string | null; cancelReason: string | null;
  deliveryCode?: string;
  history: { status: OrderStatus; label: string; at: string; reason: string | null }[];
  createdAt: string; acceptDeadlineAt: string | null; seq: number; delayMinutes: number;
}

export interface KitchenTicket {
  id: string; number: string; status: OrderStatus; createdAt: string; statusChangedAt: string; delayMinutes: number; customerNote: string;
  items: { name: string; qty: number; optionLabels: string[]; instructions: string }[];
}
