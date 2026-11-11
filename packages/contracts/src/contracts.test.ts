import { describe, expect, it } from 'vitest';
import { normalizePhone, maskPhone } from './phone';
import { PERMISSIONS, isPermission } from './permissions';
import { PLATFORM_ROLES, RESTAURANT_ROLES } from './roles';
import { registerSchema } from './auth';

describe('normalizePhone', () => {
  it.each([
    ['0197000000', '+2290197000000'],
    ['01 97 00 00 00', '+2290197000000'],
    ['+229 01 97 00 00 00', '+2290197000000'],
    ['002290197000000', '+2290197000000'],
    ['+33612345678', '+33612345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, e164: expected });
  });
  it('refuse les anciens numéros à 8 chiffres avec un message explicite', () => {
    const r = normalizePhone('97000000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/10 chiffres/);
  });
  it('refuse un numéro béninois ne commençant pas par 01', () => {
    expect(normalizePhone('0297000000').ok).toBe(false);
  });
  it('masque un numéro', () => {
    expect(maskPhone('+2290197000012')).toBe('+22901••••••12');
  });
});

describe('rôles système', () => {
  it('chaque rôle ne contient que des permissions existantes de son périmètre', () => {
    for (const role of [...RESTAURANT_ROLES, ...PLATFORM_ROLES]) {
      for (const p of role.permissions) {
        expect(isPermission(p)).toBe(true);
        expect(PERMISSIONS[p].scope).toBe(role.scope);
      }
    }
  });
  it("le cuisinier n'a ni finances, ni personnel, ni contact client", () => {
    const cook = RESTAURANT_ROLES.find((r) => r.code === 'cook')!;
    const perms: readonly string[] = cook.permissions;
    expect(perms).not.toContain('finance.restaurant.view');
    expect(perms).not.toContain('staff.manage');
    expect(perms).not.toContain('orders.view_customer_contact');
    expect(perms).not.toContain('restaurant.profile.edit');
  });
  it("le caissier n'administre pas les livreurs et l'agent financier ne modifie pas les menus", () => {
    const cashier: readonly string[] = RESTAURANT_ROLES.find((r) => r.code === 'cashier')!.permissions;
    expect(cashier).not.toContain('admin.couriers.review');
    const finance: readonly string[] = PLATFORM_ROLES.find((r) => r.code === 'finance_agent')!.permissions;
    expect(finance).not.toContain('menu.edit');
  });
  it('seul le propriétaire gère le personnel', () => {
    for (const r of RESTAURANT_ROLES) {
      const perms: readonly string[] = r.permissions;
      expect(perms.includes('staff.manage')).toBe(r.code === 'owner');
    }
  });
});

describe('registerSchema', () => {
  const base = { fullName: 'Ada Houngbo', phone: '0197000000', password: 'motdepasse123', passwordConfirm: 'motdepasse123' };
  it('accepte une inscription valide et normalise le téléphone', () => {
    const r = registerSchema.parse(base);
    expect(r.phone).toBe('+2290197000000');
    expect(r.email).toBeUndefined();
  });
  it('refuse des mots de passe différents', () => {
    expect(registerSchema.safeParse({ ...base, passwordConfirm: 'autre1234567' }).success).toBe(false);
  });
  it('refuse un mot de passe sans chiffre', () => {
    expect(registerSchema.safeParse({ ...base, password: 'motdepasseeee', passwordConfirm: 'motdepasseeee' }).success).toBe(false);
  });
});
