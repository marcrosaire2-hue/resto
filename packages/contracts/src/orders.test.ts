import { describe, expect, it } from 'vitest';
import { checkTransition, computeSplit, roundFcfa } from './orders';

describe('machine à états des commandes', () => {
  it('le restaurant accepte une commande en attente', () => {
    expect(checkTransition('PENDING', 'ACCEPTED', 'restaurant').ok).toBe(true);
  });
  it('un restaurant ne peut jamais marquer une commande livrée', () => {
    for (const from of ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY'] as const) {
      expect(checkTransition(from, 'DELIVERED', 'restaurant').ok).toBe(false);
    }
  });
  it('le refus exige un motif', () => {
    expect(checkTransition('PENDING', 'REJECTED', 'restaurant').ok).toBe(false);
    expect(checkTransition('PENDING', 'REJECTED', 'restaurant', 'Rupture de stock').ok).toBe(true);
  });
  it('le client ne peut annuler qu’une commande en attente', () => {
    expect(checkTransition('PENDING', 'CANCELLED', 'customer', 'Erreur').ok).toBe(true);
    expect(checkTransition('ACCEPTED', 'CANCELLED', 'customer', 'Erreur').ok).toBe(false);
  });
  it('on ne saute pas d’étape (PENDING → READY interdit)', () => {
    expect(checkTransition('PENDING', 'READY', 'restaurant').ok).toBe(false);
  });
});

describe('répartition financière', () => {
  it('calcule commission et net (exemple de test, pas un taux contractuel)', () => {
    const s = computeSplit({ itemsSubtotal: 10_000, restaurantDiscount: 0, platformDiscount: 0, deliveryFee: 1000, courierPay: 700, serviceFee: 200, commissionRateBps: 1500 });
    expect(s).toEqual({ baseRestaurant: 10_000, commission: 1500, restaurantNet: 8500, total: 11_200, deliveryMargin: 300 });
  });
  it('arrondit au franc, demi vers le haut', () => {
    expect(roundFcfa(2.5)).toBe(3);
    expect(computeSplit({ itemsSubtotal: 333, restaurantDiscount: 0, platformDiscount: 0, deliveryFee: 0, courierPay: 0, serviceFee: 0, commissionRateBps: 1500 }).commission).toBe(50);
  });
  it('refuse les montants décimaux ou négatifs', () => {
    expect(() => computeSplit({ itemsSubtotal: 10.5, restaurantDiscount: 0, platformDiscount: 0, deliveryFee: 0, courierPay: 0, serviceFee: 0, commissionRateBps: 0 })).toThrow();
  });
});
