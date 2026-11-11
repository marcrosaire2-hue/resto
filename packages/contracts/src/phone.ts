/**
 * Normalisation des numéros au format E.164.
 * Bénin : depuis la migration de 2024, les numéros comportent 10 chiffres et commencent par 01.
 * Les autres pays sont acceptés s'ils sont saisis avec l'indicatif (+XXX...).
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

export function normalizePhone(input: string): PhoneResult {
  const raw = input.trim();
  const plus = raw.startsWith('+') || raw.startsWith('00');
  const digits = raw.replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return { ok: false, error: 'Numéro de téléphone requis.' };

  let national: string | null = null;
  if (digits.startsWith('229')) national = digits.slice(3);
  else if (!plus) national = digits;

  if (national !== null) {
    if (national.length === 8) {
      return { ok: false, error: 'Les numéros béninois comportent désormais 10 chiffres (ex. 01 97 00 00 00).' };
    }
    if (!/^01\d{8}$/.test(national)) {
      return { ok: false, error: 'Numéro béninois invalide : 10 chiffres commençant par 01.' };
    }
    return { ok: true, e164: `+229${national}` };
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return { ok: false, error: 'Numéro international invalide.' };
  return { ok: true, e164: `+${digits}` };
}

/** Masque un numéro pour l'affichage (ex. +22901••••••12). */
export function maskPhone(e164: string): string {
  if (e164.length < 6) return '••••';
  return `${e164.slice(0, 6)}${'•'.repeat(Math.max(0, e164.length - 8))}${e164.slice(-2)}`;
}
