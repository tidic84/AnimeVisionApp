// Noms des langues de traduction (codes MangaDex) et langues proposées comme préférence globale.
const NAMES: Record<string, string> = {
  all: 'Toutes les langues',
  fr: 'Français', en: 'Anglais', es: 'Espagnol', 'es-la': 'Espagnol (Amérique latine)', 'pt-br': 'Portugais (Brésil)', pt: 'Portugais',
  it: 'Italien', de: 'Allemand', nl: 'Néerlandais', pl: 'Polonais', ru: 'Russe', uk: 'Ukrainien', tr: 'Turc', ar: 'Arabe',
  id: 'Indonésien', vi: 'Vietnamien', th: 'Thaï', ja: 'Japonais', ko: 'Coréen', zh: 'Chinois', 'zh-hk': 'Chinois (Hong Kong)',
  ca: 'Catalan', cs: 'Tchèque', ro: 'Roumain', hu: 'Hongrois', el: 'Grec', he: 'Hébreu', hi: 'Hindi', bg: 'Bulgare',
  mn: 'Mongol', eu: 'Basque', fa: 'Persan', ms: 'Malais', tl: 'Tagalog', sv: 'Suédois', fi: 'Finnois', da: 'Danois', no: 'Norvégien',
};
export const languageName = (code: string) => NAMES[code] || code.toUpperCase();
/** Préférence globale (catalogue) : les langues les plus traduites sur MangaDex. */
export const PREFERRED_LANGUAGES = ['all', 'fr', 'en', 'es-la', 'es', 'pt-br', 'it', 'de', 'pl', 'ru', 'tr', 'id', 'vi'];
/** Ordre d'affichage : préférée, français, anglais, puis alphabétique. */
export function sortLanguages(codes: string[], preferred: string): string[] {
  const rank = (code: string) => (code === preferred ? 0 : code === 'fr' ? 1 : code === 'en' ? 2 : 3);
  return [...new Set(codes)].sort((a, b) => rank(a) - rank(b) || languageName(a).localeCompare(languageName(b), 'fr'));
}
