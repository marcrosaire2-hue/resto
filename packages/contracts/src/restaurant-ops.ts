import { z } from 'zod';
import { roundFcfa } from './orders';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identifiant invalide.');

/* ===================== Promotions (calculées côté serveur) ===================== */
export const promotionSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(60),
  type: z.enum(['PERCENT', 'FIXED']),
  /** PERCENT : 1 à 90 (%) ; FIXED : montant FCFA retiré par article. */
  value: z.number().int().min(1),
  productIds: z.array(objectId).max(200).default([]), // vide = toute la carte
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  minItemsSubtotal: z.number().int().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
}).refine((p) => p.endsAt > p.startsAt, { path: ['endsAt'], message: 'La fin doit suivre le début.' })
  .refine((p) => p.type !== 'PERCENT' || p.value <= 90, { path: ['value'], message: 'Maximum 90 %.' });
export type PromotionInput = z.input<typeof promotionSchema>;

export interface PromotionLike { id: string; type: 'PERCENT' | 'FIXED'; value: number; productIds: string[]; startsAt: Date | string; endsAt: Date | string; minItemsSubtotal: number; active: boolean }

export function promotionApplies(p: PromotionLike, productId: string, at: Date) {
  return p.active && new Date(p.startsAt) <= at && at < new Date(p.endsAt) && (p.productIds.length === 0 || p.productIds.includes(productId));
}

/** Réduction unitaire d'une promotion sur un prix (jamais au-delà du prix). */
export function unitDiscount(p: Pick<PromotionLike, 'type' | 'value'>, unitPrice: number) {
  const d = p.type === 'PERCENT' ? roundFcfa((unitPrice * p.value) / 100) : p.value;
  return Math.max(0, Math.min(unitPrice, d));
}

/** Meilleure promotion applicable à un article (une seule par article, pas de cumul). */
export function bestPromotion<T extends PromotionLike>(promos: T[], productId: string, unitPrice: number, at: Date, itemsSubtotal?: number) {
  let best: { promo: T; discount: number } | null = null;
  for (const p of promos) {
    if (!promotionApplies(p, productId, at)) continue;
    if (itemsSubtotal !== undefined && itemsSubtotal < p.minItemsSubtotal) continue;
    const d = unitDiscount(p, unitPrice);
    if (d > 0 && (!best || d > best.discount)) best = { promo: p, discount: d };
  }
  return best;
}

/* ===================== Signalements ===================== */
export const ISSUE_TYPES = ['MISSING_ITEM', 'CUSTOMER_UNREACHABLE', 'PAYMENT', 'DAMAGED', 'OTHER'] as const;
export const ISSUE_LABELS: Record<(typeof ISSUE_TYPES)[number], string> = {
  MISSING_ITEM: 'Produit manquant', CUSTOMER_UNREACHABLE: 'Client injoignable', PAYMENT: 'Problème de paiement', DAMAGED: 'Commande endommagée', OTHER: 'Autre problème',
};
export const issueSchema = z.object({ type: z.enum(ISSUE_TYPES), description: z.string().trim().min(3, 'Décrivez le problème.').max(500) });
export const delaySchema = z.object({ minutes: z.number().int().min(5).max(120), reason: z.string().trim().max(200).default('') });

/* ===================== Comptes salariés ===================== */
export const inviteStaffSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom requis.').max(120),
  phone: z.string().min(8),
  roleCode: z.string().min(2),
});

/* ===================== Tableau de bord ===================== */
export interface RestaurantDashboard {
  period: { from: string; to: string; label: string };
  canSeeMoney: boolean;
  today: { orders: number; pending: number; preparing: number; ready: number; delivered: number; rejectedOrCancelled: number; grossSales: number | null; netEstimate: number | null };
  periodTotals: { orders: number; delivered: number; grossSales: number | null; netEstimate: number | null; averageBasket: number | null };
  series: { day: string; orders: number; grossSales: number | null }[];
  topProducts: { name: string; qty: number }[];
  latest: { id: string; number: string; status: string; statusLabel: string; total: number | null; createdAt: string }[];
}
