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

/* ===================== Coupons (financés par la plateforme) ===================== */
export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Code : 3 à 20 lettres, chiffres ou tirets.'),
  description: z.string().trim().max(120).default(''),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  maxDiscount: z.number().int().min(1).nullable().optional(),
  minItemsSubtotal: z.number().int().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  maxUses: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  restaurantIds: z.array(objectId).max(200).default([]),
  active: z.boolean().default(true),
}).refine((c) => c.endsAt > c.startsAt, { path: ['endsAt'], message: 'La fin doit suivre le début.' })
  .refine((c) => c.type !== 'PERCENT' || c.value <= 100, { path: ['value'], message: 'Maximum 100 %.' });

/** Réduction d'un coupon sur la base (sous-total après promotions du restaurant). */
export function couponDiscount(c: { type: 'PERCENT' | 'FIXED'; value: number; maxDiscount?: number | null }, base: number) {
  let d = c.type === 'PERCENT' ? roundFcfa((base * c.value) / 100) : c.value;
  if (c.maxDiscount) d = Math.min(d, c.maxDiscount);
  return Math.max(0, Math.min(base, d));
}

/* ===================== Avis ===================== */
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default('') });
export const reviewReplySchema = z.object({ reply: z.string().trim().min(2, 'Réponse trop courte.').max(1000) });
export interface PublicReview { id: string; rating: number; comment: string; authorName: string; createdAt: string; reply: string | null; repliedAt: string | null }

/* ===================== Accueil administrable ===================== */
export const HOME_SECTION_TYPES = ['BANNERS', 'CUISINES', 'PROMOTIONS', 'POPULAR_RESTAURANTS', 'NEW_RESTAURANTS', 'RECOMMENDED_RESTAURANTS', 'FEATURED_DISHES'] as const;
export const HOME_SECTION_LABELS: Record<(typeof HOME_SECTION_TYPES)[number], string> = {
  BANNERS: 'Bannières sponsorisées', CUISINES: 'Catégories populaires', PROMOTIONS: 'Promotions en cours', POPULAR_RESTAURANTS: 'Restaurants populaires',
  NEW_RESTAURANTS: 'Nouveaux restaurants', RECOMMENDED_RESTAURANTS: 'Restaurants recommandés', FEATURED_DISHES: 'Plats à la une',
};
export const homeSectionSchema = z.object({
  type: z.enum(HOME_SECTION_TYPES),
  title: z.string().trim().min(2).max(60),
  sort: z.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
  restaurantIds: z.array(objectId).max(30).default([]), // pour « recommandés »
});

/* ===================== Publicités ===================== */
export const AD_PLACEMENTS = ['TOP_LIST', 'FEATURED_PRODUCT', 'BANNER'] as const;
export const AD_LABELS: Record<(typeof AD_PLACEMENTS)[number], string> = { TOP_LIST: 'Tête de liste', FEATURED_PRODUCT: 'Plat mis en avant', BANNER: 'Bannière' };
export const adCampaignSchema = z.object({
  restaurantId: objectId,
  placement: z.enum(AD_PLACEMENTS),
  productId: objectId.nullable().optional(),
  title: z.string().trim().max(80).default(''),
  imagePublicId: z.string().max(300).regex(/^[\w\-/]+$/).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  price: z.number().int().min(0),
  paid: z.boolean().default(false),
  active: z.boolean().default(true),
}).refine((a) => a.endsAt > a.startsAt, { path: ['endsAt'], message: 'La fin doit suivre le début.' })
  .refine((a) => a.placement !== 'FEATURED_PRODUCT' || !!a.productId, { path: ['productId'], message: 'Choisissez le plat mis en avant.' });

/* ===================== Abonnements ===================== */
export const planSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(2).max(40),
  monthlyPrice: z.number().int().min(0),
  maxProducts: z.number().int().min(1).nullable().optional(),
  features: z.array(z.string().trim().max(80)).max(10).default([]),
  active: z.boolean().default(true),
});

/* ===================== Support ===================== */
export const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'Objet requis.').max(120),
  message: z.string().trim().min(3, 'Décrivez votre demande.').max(2000),
  orderId: objectId.optional(),
});
export const ticketMessageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const TICKET_STATUS_LABELS = { OPEN: 'Ouvert', PENDING_CUSTOMER: 'En attente de votre réponse', RESOLVED: 'Résolu', CLOSED: 'Clôturé' } as const;
