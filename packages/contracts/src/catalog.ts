import { z } from 'zod';
import { phoneSchema } from './auth';

/* ===================== Horaires (heure du Bénin, UTC+1 sans heure d'été) ===================== */

export const BENIN_UTC_OFFSET_MIN = 60;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM attendu.');

export const openingSlotSchema = z.object({
  weekday: z.number().int().min(0).max(6), // 0 = dimanche
  opens: hhmm,
  closes: hhmm,
}).refine((s) => s.opens !== s.closes, { message: "L'heure de fermeture doit différer de l'ouverture." });
export type OpeningSlot = z.infer<typeof openingSlotSchema>;

export const closureSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  reason: z.string().trim().max(200).optional(),
}).refine((c) => c.to >= c.from, { message: 'La date de fin doit suivre la date de début.' });

export const hoursSchema = z.object({
  openingHours: z.array(openingSlotSchema).max(28),
  closures: z.array(closureSchema).max(50).default([]),
});

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Heure locale béninoise d'un instant : jour de semaine et minutes depuis minuit. */
export function beninLocal(date: Date) {
  const local = new Date(date.getTime() + BENIN_UTC_OFFSET_MIN * 60_000);
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/**
 * Le restaurant est-il ouvert à cet instant ? Gère les créneaux qui passent minuit
 * (ex. 18:00 → 02:00 le samedi couvre aussi dimanche 00:00–02:00) et les fermetures exceptionnelles.
 */
export function isOpenAt(hours: { openingHours: OpeningSlot[]; closures?: { from: Date | string; to: Date | string }[] }, date: Date): boolean {
  if ((hours.closures ?? []).some((c) => date >= new Date(c.from) && date <= new Date(c.to))) return false;
  const { weekday, minutes } = beninLocal(date);
  const prev = (weekday + 6) % 7;
  return hours.openingHours.some((s) => {
    const o = toMin(s.opens);
    const c = toMin(s.closes);
    if (c > o) return s.weekday === weekday && minutes >= o && minutes < c;
    // créneau de nuit
    return (s.weekday === weekday && minutes >= o) || (s.weekday === prev && minutes < c);
  });
}

export const WEEKDAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/* ===================== Restaurant ===================== */

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identifiant invalide.');
const publicId = z.string().max(300).regex(/^[\w\-/]+$/, 'Image invalide.');
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const restaurantApplicationSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  phone: phoneSchema,
  neighborhoodId: objectId,
  address: z.string().trim().min(3, 'Adresse ou repère requis.').max(300),
  cuisineIds: z.array(objectId).min(1, 'Choisissez au moins un type de cuisine.').max(3),
  description: optionalText(600),
});
export type RestaurantApplicationInput = z.input<typeof restaurantApplicationSchema>;

export const restaurantProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  description: z.string().trim().max(600).default(''),
  phone: phoneSchema,
  whatsapp: z.union([z.literal(''), phoneSchema]).optional().transform((v) => v || null),
  email: z.union([z.literal(''), z.email('Adresse e-mail invalide.')]).optional().transform((v) => (v ? v.toLowerCase() : null)),
  address: z.string().trim().min(3, 'Adresse ou repère requis.').max(300),
  neighborhoodId: objectId,
  cuisineIds: z.array(objectId).min(1, 'Choisissez au moins un type de cuisine.').max(3),
  avgPrepMinutes: z.number().int().min(5, 'Minimum 5 minutes.').max(180, 'Maximum 180 minutes.'),
  logoPublicId: publicId.nullable().optional(),
  coverPublicId: publicId.nullable().optional(),
});
export type RestaurantProfileInput = z.input<typeof restaurantProfileSchema>;

/* ===================== Menu ===================== */

export const menuCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(60),
  active: z.boolean().default(true),
});

const money = z.number().int('Montant entier en FCFA.').min(0).max(1_000_000);

export const variantGroupSchema = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(1).max(40),
  options: z.array(z.object({ id: objectId.optional(), name: z.string().trim().min(1).max(40), priceDelta: z.number().int().min(-1_000_000).max(1_000_000) })).min(2).max(10),
});
export const addonGroupSchema = z.object({
  id: objectId.optional(),
  name: z.string().trim().min(1).max(40),
  min: z.number().int().min(0).max(10),
  max: z.number().int().min(1).max(10),
  options: z.array(z.object({ id: objectId.optional(), name: z.string().trim().min(1).max(40), price: money, available: z.boolean().default(true) })).min(1).max(15),
}).refine((g) => g.max >= g.min && g.max <= g.options.length, { message: 'Bornes de sélection incohérentes.' });

export const ALLERGENS = ['Gluten', 'Crustacés', 'Œufs', 'Poisson', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'] as const;
export const PRODUCT_TAGS = ['Populaire', 'Végétarien', 'Végan', 'Épicé', 'Recommandé par le chef', 'Nouveau'] as const;

export const productSchema = z.object({
  menuCategoryId: objectId,
  name: z.string().trim().min(2, 'Nom requis.').max(80),
  description: z.string().trim().max(500).default(''),
  basePrice: money,
  allergens: z.array(z.enum(ALLERGENS)).max(14).default([]),
  tags: z.array(z.enum(PRODUCT_TAGS)).max(3).default([]),
  images: z.array(publicId).max(5).default([]),
  prepMinutes: z.number().int().min(1).max(180).nullable().optional(),
  variantGroups: z.array(variantGroupSchema).max(3).default([]),
  addonGroups: z.array(addonGroupSchema).max(5).default([]),
});
export type ProductInput = z.input<typeof productSchema>;

/* ===================== Calcul du prix unitaire (partagé : affichage client et serveur) ===================== */

export interface PricedProduct {
  basePrice: number;
  variantGroups: { id: string; name: string; options: { id: string; name: string; priceDelta: number }[] }[];
  addonGroups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; price: number; available: boolean }[] }[];
}
export interface ProductSelection {
  variants: Record<string, string>; // groupId -> optionId
  addons: string[]; // optionIds
}
export type PriceResult =
  | { ok: true; unitPrice: number; lines: { label: string; amount: number }[] }
  | { ok: false; error: string };

/** Prix unitaire d'un plat selon les choix. Le serveur refait toujours ce calcul : le navigateur n'est jamais cru. */
export function computeUnitPrice(p: PricedProduct, sel: ProductSelection): PriceResult {
  let price = p.basePrice;
  const lines: { label: string; amount: number }[] = [];
  for (const g of p.variantGroups) {
    const opt = g.options.find((o) => o.id === sel.variants[g.id]);
    if (!opt) return { ok: false, error: `Choisissez : ${g.name}.` };
    price += opt.priceDelta;
    if (opt.priceDelta) lines.push({ label: `${g.name} : ${opt.name}`, amount: opt.priceDelta });
  }
  const chosen = new Set(sel.addons);
  const known = new Set(p.addonGroups.flatMap((g) => g.options.map((o) => o.id)));
  if ([...chosen].some((id) => !known.has(id))) return { ok: false, error: 'Supplément inconnu.' };
  for (const g of p.addonGroups) {
    const picked = g.options.filter((o) => chosen.has(o.id));
    if (picked.some((o) => !o.available)) return { ok: false, error: `Un supplément de « ${g.name} » n’est plus disponible.` };
    if (picked.length < g.min) return { ok: false, error: `Choisissez au moins ${g.min} : ${g.name}.` };
    if (picked.length > g.max) return { ok: false, error: `Maximum ${g.max} : ${g.name}.` };
    for (const o of picked) {
      price += o.price;
      lines.push({ label: o.name, amount: o.price });
    }
  }
  if (price < 0) return { ok: false, error: 'Prix invalide.' };
  return { ok: true, unitPrice: price, lines };
}

/* ===================== Réponses publiques du catalogue ===================== */

export interface PublicRestaurantCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  cuisines: { id: string; name: string }[];
  rating: number | null;
  ratingCount: number;
  avgPrepMinutes: number;
  isOpen: boolean;
  acceptingOrders: boolean;
  neighborhood: string | null;
  commune: string | null;
  isDemo: boolean;
  /** Mise en avant payante : toujours affichée avec la mention « Sponsorisé ». */
  sponsored?: boolean;
}

export interface PublicProduct {
  id: string;
  restaurantId: string;
  menuCategoryId: string;
  name: string;
  description: string;
  basePrice: number;
  imageUrls: string[];
  available: boolean;
  allergens: string[];
  tags: string[];
  prepMinutes: number | null;
  variantGroups: PricedProduct['variantGroups'];
  addonGroups: PricedProduct['addonGroups'];
  /** Promotion en cours sur le prix de base (calculée par le serveur ; le prix final est confirmé au devis). */
  promotion: { name: string; discountedBasePrice: number; minItemsSubtotal: number; endsAt: string } | null;
}

export interface PublicRestaurantDetail extends PublicRestaurantCard {
  phone: string;
  whatsapp: string | null;
  address: string;
  openingHours: OpeningSlot[];
  menu: { id: string; name: string; products: PublicProduct[] }[];
  promotions: { name: string; type: 'PERCENT' | 'FIXED'; value: number; endsAt: string; minItemsSubtotal: number; allProducts: boolean }[];
}

export interface PublicCuisine { id: string; name: string; slug: string; imageUrl: string | null; emoji: string | null }
