/** Texte de recherche normalisé : minuscules, sans accents. */
export function searchText(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Expression régulière sûre (entrée utilisateur échappée) pour une recherche « contient ». */
export function containsRegex(q: string): RegExp {
  return new RegExp(searchText(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
