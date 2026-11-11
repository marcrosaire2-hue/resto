import { z } from 'zod';

/**
 * Registre des paramètres de la plateforme. Aucune valeur commerciale n'a de défaut :
 * `null` signifie « non configuré » et les fonctionnalités qui en dépendent restent bloquées
 * tant que l'administration ne les a pas renseignés.
 */
const minutes = z.number().int().min(1).max(24 * 60);
const fcfa = z.number().int().min(0).max(10_000_000);

export const SETTINGS = {
  'orders.restaurant_response_minutes': { schema: minutes, label: 'Délai de réponse du restaurant (minutes)' },
  'orders.auto_cancel_after_minutes': { schema: minutes.nullable(), label: "Annulation automatique sans réponse (minutes, vide = désactivée)" },
  'orders.ready_without_courier_alert_minutes': { schema: minutes, label: 'Alerte commande prête sans livreur (minutes)' },
  'orders.service_fee_fcfa': { schema: fcfa, label: 'Frais de service par commande (FCFA)' },
  'couriers.cash_limit_fcfa': { schema: fcfa, label: "Plafond d'espèces détenues par livreur (FCFA)" },
  'couriers.offer_expiry_seconds': { schema: z.number().int().min(15).max(900), label: "Durée de validité d'une offre de course (secondes)" },
  'delivery.customer_wait_minutes': { schema: minutes, label: "Attente du client avant échec de livraison (minutes)" },
  'finance.refund_double_approval_threshold_fcfa': { schema: fcfa, label: 'Seuil de double validation des remboursements (FCFA)' },
  'auth.max_failed_logins': { schema: z.number().int().min(3).max(20), label: 'Tentatives de connexion avant verrouillage' },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export function isSettingKey(k: string): k is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, k);
}
