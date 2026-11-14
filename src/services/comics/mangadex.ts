// Fournisseur MangaDex (https://api.mangadex.org/docs/) : métadonnées ET chapitres.
// Règles d'usage respectées : mention de MangaDex et des équipes de traduction, aucun contenu payant/publicitaire,
// User-Agent réel, ~5 requêtes/s max, images servies par le réseau MangaDex@Home.
// Pas de CORS ni de hotlink pour les sites tiers : sur PC, la coque Electron retire Origin/Referer (desktop/main.cjs).
import { Comic, ComicChapter, ComicKind, ComicLanguage, ComicPage, ComicProvider, ComicSearch, ComicStatus, ComicTag, LanguageInfo } from './types';

const API = 'https://api.mangadex.org';
const UPLOADS = 'https://uploads.mangadex.org';
const USER_AGENT = 'AnimeVision (+https://github.com/tidic84/AnimeVisionApp)';
// Contenu adulte exclu.
const RATINGS = 'contentRating[]=safe&contentRating[]=suggestive';
const MIN_INTERVAL = 220;
// Navigateur/Electron : User-Agent fixé par la coque (un en-tête ajouté ici déclencherait une requête CORS préalable).
const HEADERS: Record<string, string> = typeof document === 'undefined' ? { Accept: 'application/json', 'User-Agent': USER_AGENT } : { Accept: 'application/json' };

const GENRES_FR: Record<string, string> = {
  Action: 'Action', Adventure: 'Aventure', Comedy: 'Comédie', Drama: 'Drame', Fantasy: 'Fantastique', Horror: 'Horreur',
  Mystery: 'Mystère', Romance: 'Romance', 'Sci-Fi': 'Science-fiction', 'Slice of Life': 'Tranche de vie', Sports: 'Sport',
  Thriller: 'Thriller', Tragedy: 'Tragédie', Psychological: 'Psychologique', Historical: 'Historique', Isekai: 'Isekai',
  Crime: 'Policier', Medical: 'Médical', Mecha: 'Mecha', Philosophical: 'Philosophique', Superhero: 'Super-héros',
  Wuxia: 'Wuxia', 'Magical Girls': 'Magical girls', "Boys' Love": 'Boys’ love', "Girls' Love": 'Girls’ love',
};
const ORDERS: Record<string, string> = { added: 'order[createdAt]=asc', popular: 'order[followedCount]=desc', latest: 'order[latestUploadedChapter]=desc', rating: 'order[rating]=desc', title: 'order[title]=asc' };
const STATUSES: ComicStatus[] = ['ongoing', 'completed', 'hiatus', 'cancelled'];

type Localized = Record<string, string> | undefined;
/** Texte dans la langue préférée, puis anglais, puis la première disponible. */
export function pickText(value: Localized, language = 'fr'): string {
  if (!value) return '';
  return value[language] || value.en || Object.values(value)[0] || '';
}

export function mapComic(raw: any, language: ComicLanguage = 'fr'): Comic {
  const attributes = raw.attributes || {};
  const altTitles: Record<string, string>[] = attributes.altTitles || [];
  const localTitle = altTitles.find(entry => entry[language])?.[language];
  const englishTitle = attributes.title?.en || altTitles.find(entry => entry.en)?.en;
  const file = (raw.relationships || []).find((relation: any) => relation.type === 'cover_art')?.attributes?.fileName;
  const cover = file ? `${UPLOADS}/covers/${raw.id}/${file}` : undefined;
  const genres = (attributes.tags || []).filter((tag: any) => tag.attributes?.group === 'genre').map((tag: any) => GENRES_FR[tag.attributes.name?.en] || tag.attributes.name?.en).filter(Boolean);
  return {
    id: raw.id,
    provider: 'mangadex',
    // Origine de l’œuvre ; manhwas et manhuas ont des filtres distincts.
    kind: attributes.originalLanguage === 'ko' ? 'manhwa' : attributes.originalLanguage?.startsWith('zh') ? 'manhua' : 'manga',
    title: localTitle || englishTitle || pickText(attributes.title) || 'Sans titre',
    altTitles: altTitles.map(entry => Object.values(entry)[0]).filter(Boolean).slice(0, 6),
    synopsis: pickText(attributes.description, language).trim(),
    cover: cover && `${cover}.512.jpg`,
    coverThumb: cover && `${cover}.256.jpg`,
    genres,
    status: STATUSES.includes(attributes.status) ? attributes.status : 'unknown',
    year: Number(attributes.year) || undefined,
    languages: attributes.availableTranslatedLanguages || [],
  };
}

export function mapChapter(raw: any): ComicChapter {
  const attributes = raw.attributes || {};
  const group = (raw.relationships || []).find((relation: any) => relation.type === 'scanlation_group')?.attributes?.name;
  const pages = Number(attributes.pages) || 0;
  return {
    id: raw.id,
    number: attributes.chapter || '',
    title: attributes.title || '',
    volume: attributes.volume || undefined,
    language: attributes.translatedLanguage || '',
    pages,
    group,
    publishedAt: attributes.publishAt || attributes.readableAt,
    externalUrl: attributes.externalUrl || undefined,
    available: pages > 0 && !attributes.externalUrl && attributes.isUnavailable !== true,
  };
}

/** Un chapitre par numéro (plusieurs équipes traduisent souvent le même), lisible de préférence, trié par numéro. */
export function dedupeChapters(chapters: ComicChapter[]): ComicChapter[] {
  const byNumber = new Map<string, ComicChapter>();
  for (const chapter of chapters) {
    const key = chapter.number || chapter.id;
    const previous = byNumber.get(key);
    if (!previous || (!previous.available && chapter.available)) byNumber.set(key, chapter);
  }
  const value = (chapter: ComicChapter) => chapter.number === '' ? -1 : Number(chapter.number);
  return [...byNumber.values()].sort((a, b) => value(a) - value(b));
}

export function pagesFromAtHome(response: any): ComicPage[] {
  const { baseUrl, chapter } = response || {};
  if (!baseUrl || !chapter?.hash || !Array.isArray(chapter.data)) return [];
  return chapter.data.map((file: string, index: number) => ({
    url: `${baseUrl}/data/${chapter.hash}/${file}`,
    fallbackUrl: chapter.dataSaver?.[index] ? `${baseUrl}/data-saver/${chapter.hash}/${chapter.dataSaver[index]}` : undefined,
  }));
}

// « Tous » inclut aussi les œuvres chinoises en chinois simplifié et traditionnel.
const ORIGINAL_LANGUAGE: Record<ComicKind | 'all', string[]> = { manga: ['ja'], manhwa: ['ko'], manhua: ['zh', 'zh-hk'], all: ['ja', 'ko', 'zh', 'zh-hk'] };

export function searchPath(search: ComicSearch): string {
  // Parcours complet : MangaDex refuse offset + limit > 10 000, on avance donc par date d'ajout (createdAtSince).
  const cursor = search.order === 'added' && !search.query?.trim() ? search.cursor : undefined;
  const params = [`limit=${search.limit}`, `offset=${cursor ? 0 : search.offset}`, ...ORIGINAL_LANGUAGE[search.kind].map(code => `originalLanguage[]=${code}`), 'hasAvailableChapters=true', 'includes[]=cover_art', RATINGS];
  // « all » : toutes les langues de traduction.
  if (search.language !== 'all') params.push(`availableTranslatedLanguage[]=${encodeURIComponent(search.language)}`);
  if (cursor) params.push(`createdAtSince=${encodeURIComponent(cursor)}`);
  if (search.query?.trim()) params.push(`title=${encodeURIComponent(search.query.trim())}`, 'order[relevance]=desc');
  else params.push(ORDERS[search.order] || ORDERS.popular);
  search.tagIds?.forEach(id => params.push(`includedTags[]=${id}`));
  if (search.status && search.status !== 'unknown') params.push(`status[]=${search.status}`);
  return `/manga?${params.join('&')}`;
}

/** Curseur de la page suivante en ordre d'ajout : date du dernier titre (createdAtSince est inclusif, les doublons
 * sont écartés par l'écran) ; une seconde de plus si toute la page a la même date, pour ne pas tourner en rond. */
export function nextCursor(data: any[], search: ComicSearch): string | undefined {
  if (data.length < search.limit) return undefined;
  const last = String(data[data.length - 1]?.attributes?.createdAt || '').slice(0, 19);
  if (!last) return undefined;
  if (last !== search.cursor) return last;
  return new Date(Date.parse(`${last}Z`) + 1000).toISOString().slice(0, 19);
}

export const languageInfoPath = (comicId: string, language: ComicLanguage) =>
  `/manga/${comicId}/feed?translatedLanguage[]=${encodeURIComponent(language)}&limit=1&order[chapter]=desc&order[volume]=desc&includeExternalUrl=0&includeEmptyPages=0&includes[]=scanlation_group`;

let queue: Promise<unknown> = Promise.resolve();
let last = 0;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Requêtes en file, espacées pour rester sous la limite de MangaDex ; une reprise après un 429. */
function request<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const delay = last + MIN_INTERVAL - Date.now();
      if (delay > 0) await wait(delay);
      last = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${API}${path}`, { signal: controller.signal, headers: HEADERS });
      } catch {
        throw new Error('MangaDex est injoignable. Vérifiez la connexion.');
      } finally { clearTimeout(timeout); }
      if (response.status === 429 && attempt === 0) {
        const retry = Number(response.headers.get('X-RateLimit-Retry-After')) * 1000 - Date.now();
        await wait(Math.min(Math.max(retry, 1000), 10000));
        continue;
      }
      if (response.status === 404) throw new Error('Contenu introuvable sur MangaDex.');
      if (!response.ok) throw new Error(`MangaDex a répondu ${response.status}.`);
      return response.json();
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

const mangadex: ComicProvider = {
  id: 'mangadex',
  name: 'MangaDex',
  credit: 'Données et chapitres fournis par MangaDex (mangadex.org) et ses équipes de traduction.',
  async listTags(): Promise<ComicTag[]> {
    const response: any = await request('/manga/tag');
    return (response.data || []).filter((tag: any) => tag.attributes?.group === 'genre')
      .map((tag: any) => ({ id: tag.id, name: GENRES_FR[tag.attributes.name?.en] || tag.attributes.name?.en }))
      .sort((a: ComicTag, b: ComicTag) => a.name.localeCompare(b.name, 'fr'));
  },
  async search(search) {
    const response: any = await request(searchPath(search));
    const data: any[] = response.data || [];
    return { items: data.map(raw => mapComic(raw, search.language)), total: Number(response.total) || 0, next: search.order === 'added' && !search.query?.trim() ? nextCursor(data, search) : undefined };
  },
  async getComic(id) {
    const response: any = await request(`/manga/${id}?includes[]=cover_art`);
    return mapComic(response.data);
  },
  async getChapters(comicId, language) {
    const chapters: ComicChapter[] = [];
    for (let offset = 0; ; offset += 500) {
      const response: any = await request(`/manga/${comicId}/feed?translatedLanguage[]=${encodeURIComponent(language)}&limit=500&offset=${offset}&order[chapter]=asc&includes[]=scanlation_group`);
      chapters.push(...(response.data || []).map(mapChapter));
      if (offset + 500 >= (Number(response.total) || 0) || offset >= 5000) break;
    }
    return dedupeChapters(chapters);
  },
  async getPages(chapterId) {
    return pagesFromAtHome(await request(`/at-home/server/${chapterId}`));
  },
  // `availableTranslatedLanguages` peut annoncer une langue dont tous les chapitres ont été retirés :
  // on compte les chapitres réellement lisibles (sans lien éditeur ni pages vides) et on prend le plus récent.
  async getLanguageInfo(comicId, language): Promise<LanguageInfo> {
    const response: any = await request(languageInfoPath(comicId, language));
    const last = response.data?.[0] ? mapChapter(response.data[0]) : undefined;
    return { language, count: Number(response.total) || 0, last };
  },
};

export default mangadex;
