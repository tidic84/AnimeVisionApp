// Fournisseur Poseidon Scans (https://poseidon-scans.net) : lu à la demande, rien n'est copié ni stocké.
// Catalogue : /api/manga/all (JSON). Chapitres et pages : données Next.js (self.__next_f) des pages série et chapitre.
// Chapitres premium encore verrouillés : affichés mais non lisibles (pas de compte).
import { Comic, ComicChapter, ComicKind, ComicPage, ComicProvider, ComicStatus, ComicTag } from './types';

const BASE = 'https://poseidon-scans.net';
const HEADERS: Record<string, string> = typeof document === 'undefined' ? { 'User-Agent': 'Mozilla/5.0 (AnimeVision)' } : {};

async function get(path: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { signal: controller.signal, headers: HEADERS });
  } catch {
    throw new Error('Poseidon Scans est injoignable. Vérifiez la connexion.');
  } finally { clearTimeout(timeout); }
  if (response.status === 404) throw new Error('Contenu introuvable sur Poseidon Scans.');
  if (!response.ok) throw new Error(`Poseidon Scans a répondu ${response.status}.`);
  return response;
}

/** Données React Server Components d'une page Next.js, concaténées. */
export function flightData(html: string): string {
  const parts: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) parts.push(JSON.parse(match[1]));
  return parts.join('');
}

/** Valeur JSON (objet ou tableau) qui suit `"key":` dans le flux, sans dépendre du reste du flux. */
export function jsonAfter(flight: string, key: string): any {
  // `"chapters":12` (compteur) peut précéder la vraie liste : seule une valeur objet/tableau compte.
  const match = new RegExp(`"${key}":(?=[[{])`).exec(flight);
  if (!match) return undefined;
  const open = match.index + match[0].length;
  let depth = 0, inString = false;
  for (let i = open; i < flight.length; i++) {
    const char = flight[i];
    if (inString) { if (char === '\\') i++; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if ((char === '}' || char === ']') && --depth === 0) return JSON.parse(flight.slice(open, i + 1));
  }
  return undefined;
}

// Next.js préfixe les dates sérialisées par `$D`.
const date = (value: unknown) => typeof value === 'string' ? value.replace(/^\$D/, '') : undefined;
const KINDS: Record<string, ComicKind> = { MANHWA: 'manhwa', MANHUA: 'manhua', MANGA: 'manga' };

export function mapStatus(status: string = ''): ComicStatus {
  const value = status.toLowerCase();
  if (value.includes('cours')) return 'ongoing';
  if (value.includes('termin')) return 'completed';
  if (value.includes('pause')) return 'hiatus';
  if (value.includes('abandon') || value.includes('annul')) return 'cancelled';
  return 'unknown';
}

export function coverUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const file = path.includes('storage/covers/') ? path.split('storage/covers/')[1] : path.replace(/^\//, '');
  return `${BASE}/api/covers/${file}`;
}

export function mapComic(raw: any): Comic {
  const cover = coverUrl(raw.coverImage);
  return {
    id: raw.slug,
    provider: 'poseidon',
    kind: KINDS[raw.type] || 'manhwa',
    title: raw.title || 'Sans titre',
    altTitles: [],
    synopsis: String(raw.description || '').trim(),
    cover,
    coverThumb: cover,
    genres: (raw.categories || []).map((category: any) => category.name).filter(Boolean),
    status: mapStatus(raw.status),
    year: Number(String(raw.createdAt || '').slice(0, 4)) || undefined,
    languages: ['fr'],
  };
}

/** Identifiant de chapitre : `slug/numéro`, l'adresse de lecture sur le site. */
export function mapChapter(slug: string, raw: any, now = Date.now()): ComicChapter {
  const number = String(raw.number ?? '').replace(/\.0$/, '');
  const until = Date.parse(date(raw.premiumUntil) || '');
  const locked = raw.isPremium === true && !(until <= now);
  return {
    id: `${slug}/${number}`,
    number: raw.isVolume ? '' : number,
    volume: raw.isVolume ? number : undefined,
    title: raw.title || '',
    language: 'fr',
    pages: 0,
    group: 'Poseidon Scans',
    publishedAt: date(raw.createdAt),
    available: !locked,
    availableAt: locked && until ? new Date(until).toISOString() : undefined,
  };
}

// Le catalogue complet (~800 séries, ~1 Mo) est rechargé au plus toutes les 10 minutes.
let catalog: { at: number; value: Promise<any[]> } | undefined;
function loadCatalog(): Promise<any[]> {
  if (catalog && Date.now() - catalog.at < 10 * 60_000) return catalog.value;
  const value = get('/api/manga/all').then(response => response.json()).then((body: any) => Array.isArray(body?.data) ? body.data : []);
  catalog = { at: Date.now(), value };
  value.catch(() => { catalog = undefined; });
  return value;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SORTS: Record<string, (a: any, b: any) => number> = {
  popular: (a, b) => (b._count?.ratings || 0) - (a._count?.ratings || 0),
  latest: (a, b) => String(b.latestChapterCreatedAt || '').localeCompare(String(a.latestChapterCreatedAt || '')),
  rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  title: (a, b) => String(a.title).localeCompare(String(b.title), 'fr'),
  added: (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
};

const poseidon: ComicProvider = {
  id: 'poseidon',
  name: 'Poseidon Scans',
  credit: 'Traductions de l’équipe Poseidon Scans (poseidon-scans.net). Soutenez-la sur son site.',
  async listTags(): Promise<ComicTag[]> {
    const names = new Set<string>();
    for (const raw of await loadCatalog()) for (const category of raw.categories || []) if (category.name) names.add(category.name);
    return [...names].sort((a, b) => a.localeCompare(b, 'fr')).map(name => ({ id: name, name }));
  },
  async search(search) {
    // Traductions françaises uniquement.
    if (!['fr', 'all', ''].includes(search.language)) return { items: [], total: 0 };
    const query = normalize(search.query?.trim() || '');
    const rows = (await loadCatalog()).filter(raw => {
      if (search.kind !== 'all' && (KINDS[raw.type] || 'manhwa') !== search.kind) return false;
      if (query && !normalize(String(raw.title || '')).includes(query)) return false;
      if (search.status && search.status !== 'unknown' && mapStatus(raw.status) !== search.status) return false;
      const genres: string[] = (raw.categories || []).map((category: any) => category.name);
      return !search.tagIds?.length || search.tagIds.every(tag => genres.includes(tag));
    }).sort(SORTS[search.order] || SORTS.popular);
    const offset = search.cursor ? Number(search.cursor) || 0 : search.offset;
    const end = offset + search.limit;
    return { items: rows.slice(offset, end).map(mapComic), total: rows.length, next: end < rows.length ? String(end) : undefined };
  },
  async getComic(id) {
    const raw = (await loadCatalog()).find(entry => entry.slug === id);
    if (!raw) throw new Error('Série introuvable sur Poseidon Scans.');
    return mapComic(raw);
  },
  async getChapters(comicId, language) {
    if (!['fr', 'all', ''].includes(language)) return [];
    const flight = flightData(await (await get(`/serie/${encodeURIComponent(comicId)}`)).text());
    const raw: any[] = jsonAfter(flight, 'chapters') || [];
    const value = (chapter: ComicChapter) => Number(chapter.number || chapter.volume || 0);
    return raw.map(chapter => mapChapter(comicId, chapter)).sort((a, b) => value(a) - value(b));
  },
  async getPages(chapterId): Promise<ComicPage[]> {
    const [slug, number] = chapterId.split('/');
    const flight = flightData(await (await get(`/serie/${encodeURIComponent(slug)}/chapter/${encodeURIComponent(number)}`)).text());
    const images: any[] = jsonAfter(flight, 'images') || [];
    if (!images.length) throw new Error('Chapitre réservé aux membres premium de Poseidon Scans pour le moment.');
    return images.sort((a, b) => a.order - b.order).map(image => ({ url: image.originalUrl.startsWith('http') ? image.originalUrl : `${BASE}${image.originalUrl}` }));
  },
  async getLanguageInfo(comicId, language) {
    const readable = (await this.getChapters(comicId, language)).filter(chapter => chapter.available);
    return { language, count: readable.length, last: readable.at(-1) };
  },
};

export default poseidon;
