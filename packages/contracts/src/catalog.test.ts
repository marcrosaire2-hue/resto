import { describe, expect, it } from 'vitest';
import { computeUnitPrice, isOpenAt, PricedProduct } from './catalog';

// Heure du Bénin = UTC+1 : 12:00 au Bénin = 11:00 UTC.
const at = (iso: string) => new Date(iso);

describe('isOpenAt (heure de Cotonou)', () => {
  const hours = { openingHours: [{ weekday: 3, opens: '11:00', closes: '22:00' }, { weekday: 6, opens: '18:00', closes: '02:00' }] };
  it('ouvert un mercredi à 12:00 heure du Bénin', () => {
    expect(isOpenAt(hours, at('2026-11-11T11:00:00Z'))).toBe(true); // mercredi
  });
  it("fermé à 10:59 et à 22:00 pile", () => {
    expect(isOpenAt(hours, at('2026-11-11T09:59:00Z'))).toBe(false);
    expect(isOpenAt(hours, at('2026-11-11T21:00:00Z'))).toBe(false);
  });
  it('gère un créneau de nuit samedi 18:00 → dimanche 02:00', () => {
    expect(isOpenAt(hours, at('2026-11-14T22:00:00Z'))).toBe(true); // samedi 23:00
    expect(isOpenAt(hours, at('2026-11-15T00:30:00Z'))).toBe(true); // dimanche 01:30
    expect(isOpenAt(hours, at('2026-11-15T01:30:00Z'))).toBe(false); // dimanche 02:30
  });
  it('une fermeture exceptionnelle prime sur les horaires', () => {
    const h = { ...hours, closures: [{ from: '2026-11-11T00:00:00Z', to: '2026-11-11T23:59:59Z' }] };
    expect(isOpenAt(h, at('2026-11-11T11:00:00Z'))).toBe(false);
  });
});

describe('computeUnitPrice', () => {
  const p: PricedProduct = {
    basePrice: 3000,
    variantGroups: [{ id: 'g1', name: 'Taille', options: [{ id: 's', name: 'Normale', priceDelta: 0 }, { id: 'l', name: 'Grande', priceDelta: 1000 }] }],
    addonGroups: [{ id: 'a', name: 'Suppléments', min: 0, max: 2, options: [
      { id: 'x', name: 'Œuf', price: 300, available: true },
      { id: 'y', name: 'Alloco', price: 500, available: true },
      { id: 'z', name: 'Fromage', price: 400, available: false },
    ] }],
  };
  it('additionne variante et suppléments', () => {
    const r = computeUnitPrice(p, { variants: { g1: 'l' }, addons: ['x', 'y'] });
    expect(r).toMatchObject({ ok: true, unitPrice: 4800 });
  });
  it('exige le choix de variante', () => {
    expect(computeUnitPrice(p, { variants: {}, addons: [] }).ok).toBe(false);
  });
  it('refuse un supplément indisponible, inconnu ou au-delà du maximum', () => {
    expect(computeUnitPrice(p, { variants: { g1: 's' }, addons: ['z'] }).ok).toBe(false);
    expect(computeUnitPrice(p, { variants: { g1: 's' }, addons: ['nope'] }).ok).toBe(false);
    expect(computeUnitPrice(p, { variants: { g1: 's' }, addons: ['x', 'y', 'x2'] }).ok).toBe(false);
  });
});
