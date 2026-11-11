import { z } from 'zod';
import { phoneSchema } from './auth';

const publicId = z.string().max(300).regex(/^[\w\-/]+$/, 'Fichier invalide.');

/* ===================== Livreurs ===================== */
export const VEHICLE_TYPES = ['MOTO', 'BIKE', 'CAR', 'FOOT'] as const;
export const VEHICLE_LABELS: Record<(typeof VEHICLE_TYPES)[number], string> = { MOTO: 'Moto', BIKE: 'Vélo', CAR: 'Voiture', FOOT: 'À pied' };
export const COURIER_DOC_TYPES = ['ID_CARD', 'DRIVING_LICENSE', 'VEHICLE_PAPERS'] as const;
export const COURIER_DOC_LABELS: Record<(typeof COURIER_DOC_TYPES)[number], string> = { ID_CARD: 'Pièce d’identité', DRIVING_LICENSE: 'Permis de conduire', VEHICLE_PAPERS: 'Papiers du véhicule' };
export const PAYOUT_PROVIDERS = ['MTN_MOMO', 'MOOV_MONEY'] as const;

export const courierApplicationSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
  plate: z.string().trim().max(20).optional().transform((v) => v || null),
  photoPublicId: publicId.nullable().optional(),
  payout: z.object({ provider: z.enum(PAYOUT_PROVIDERS), number: phoneSchema }),
  documents: z.array(z.object({ type: z.enum(COURIER_DOC_TYPES), publicId })).min(1, 'Ajoutez au moins votre pièce d’identité.').max(6),
}).refine((a) => a.documents.some((d) => d.type === 'ID_CARD'), { path: ['documents'], message: 'La pièce d’identité est obligatoire.' })
  .refine((a) => a.vehicleType !== 'MOTO' && a.vehicleType !== 'CAR' || a.documents.some((d) => d.type === 'DRIVING_LICENSE'), { path: ['documents'], message: 'Le permis est obligatoire pour une moto ou une voiture.' });
export type CourierApplicationInput = z.input<typeof courierApplicationSchema>;

export const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10_000).optional(),
});

export const otpSchema = z.object({ code: z.string().regex(/^\d{4}$/, 'Code à 4 chiffres.') });

/* ===================== Livraisons ===================== */
export const DELIVERY_STATUSES = ['SEARCHING', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROPOFF', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  SEARCHING: 'Recherche de livreur', ASSIGNED: 'En route vers le restaurant', AT_PICKUP: 'Au restaurant', PICKED_UP: 'En route vers le client',
  AT_DROPOFF: 'Chez le client', DELIVERED: 'Livrée', FAILED: 'Échec', CANCELLED: 'Annulée',
};

export interface CourierOffer {
  deliveryId: string; orderNumber: string; restaurantName: string; pickupArea: string; dropoffArea: string;
  courierPay: number; distanceKm: number | null; estimatedMinutes: number | null; expiresAt: string;
}

export interface CourierDeliveryView {
  id: string; orderId: string; orderNumber: string; status: DeliveryStatus; statusLabel: string;
  restaurant: { name: string; phone: string | null; address: string | null; area: string };
  customer: { name: string; phone: string | null; address: string; area: string; instructions: string } | null;
  items: { name: string; qty: number }[];
  cashToCollect: number; courierPay: number; customerNote: string; assignedAt: string | null; otpAttemptsLeft: number;
}

/* ===================== Incidents ===================== */
export const INCIDENT_TYPES = ['RESTAURANT_CLOSED', 'CUSTOMER_UNREACHABLE', 'COURIER_UNAVAILABLE', 'LATE', 'WRONG_ORDER', 'DAMAGED', 'PAYMENT', 'DELIVERY_FAILED', 'MISSING_ITEM', 'OTHER'] as const;
export const INCIDENT_LABELS: Record<(typeof INCIDENT_TYPES)[number], string> = {
  RESTAURANT_CLOSED: 'Restaurant fermé', CUSTOMER_UNREACHABLE: 'Client injoignable', COURIER_UNAVAILABLE: 'Livreur indisponible', LATE: 'Retard',
  WRONG_ORDER: 'Commande incorrecte', DAMAGED: 'Commande endommagée', PAYMENT: 'Problème de paiement', DELIVERY_FAILED: 'Livraison échouée',
  MISSING_ITEM: 'Produit manquant', OTHER: 'Autre',
};
export const INCIDENT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const INCIDENT_STATUS_LABELS: Record<(typeof INCIDENT_STATUSES)[number], string> = { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', CLOSED: 'Clôturé' };

export const incidentCreateSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  description: z.string().trim().min(3, 'Décrivez l’incident.').max(1000),
  orderId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
export const incidentUpdateSchema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  assignToMe: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
  resolution: z.string().trim().max(1000).optional(),
}).refine((u) => (u.status !== 'RESOLVED' && u.status !== 'CLOSED') || !!u.resolution, { path: ['resolution'], message: 'La résolution est obligatoire pour clôturer.' });

export const MAX_OTP_ATTEMPTS = 5;
