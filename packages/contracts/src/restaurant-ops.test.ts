import { describe, expect, it } from 'vitest';
import { bestPromotion, PromotionLike, unitDiscount } from './restaurant-ops';

const now = new Date('2026-11-11T12:00:00Z');
const base = { startsAt: '2026-11-01', endsAt: '2026-12-01', minItemsSubtotal: 0, active: true, productIds: [] as string[] };

describe('promotions', () => {
  it('pourcentage arrondi au franc, montant fixe plafonné au prix', () => {
    expect(unitDiscount({ type: 'PERCENT', value: 15 }, 3333)).toBe(500);
    expect(unitDiscount({ type: 'FIXED', value: 5000 }, 3000)).toBe(3000);
  });
  it('choisit la meilleure promotion, sans cumul, et respecte dates, plats et minimum', () => {
    const promos: PromotionLike[] = [
      { ...base, id: 'a', type: 'PERCENT', value: 10 },
      { ...base, id: 'b', type: 'FIXED', value: 500, productIds: ['p1'] },
      { ...base, id: 'c', type: 'PERCENT', value: 50, startsAt: '2026-12-01', endsAt: '2026-12-31' },
      { ...base, id: 'd', type: 'PERCENT', value: 40, minItemsSubtotal: 20_000 },
    ];
    expect(bestPromotion(promos, 'p1', 3000, now, 5000)?.promo.id).toBe('b'); // 500 > 300
    expect(bestPromotion(promos, 'p2', 3000, now, 5000)?.promo.id).toBe('a');
    expect(bestPromotion(promos, 'p2', 3000, now, 25_000)?.promo.id).toBe('d');
    expect(bestPromotion([{ ...base, id: 'x', type: 'PERCENT', value: 10, active: false }], 'p1', 3000, now)).toBeNull();
  });
});
