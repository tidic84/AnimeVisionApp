/**
 * Correspondance entre nos saisons (découpage anime-sama) et les entrées MyAnimeList.
 *
 * Nos fiches portent l'identifiant de la première saison, alors que MAL a une entrée par saison
 * (et souvent par partie). On reconstitue la chaîne des suites via AniList (SEQUEL/PREQUEL),
 * puis on répartit nos épisodes de façon cumulative : si anime-sama regroupe deux parties en une
 * "Saison 1" de 24 épisodes, l'épisode 15 devient l'épisode 4 de la seconde entrée MAL.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Season } from '../../types/anime';

export interface FranchiseEntry {
  id: number;
  idMal: number | null;
  format: string | null;
  episodes: number | null;
  start: number; // AAAAMMJJ, 99999999 si inconnu
  title: string;
  titles?: string[]; // titres romaji/anglais, pour repérer le numéro de saison
}

export interface MalTarget {
  malId: number;
  episode: number; // numéro d'épisode dans l'entrée MAL
  total: number | null; // nombre d'épisodes de l'entrée (null si en cours de diffusion)
  title: string;
}

const MAIN_FORMATS = ['TV', 'TV_SHORT', 'ONA'];
const SEASON_TITLE = /saison\s*(\d+)(?:\D+?partie\s*(\d+))?/i;

/** Saisons "régulières" dans l'ordre de diffusion ; films, OAV et hors-séries ne sont pas synchronisés. */
export function regularSeasons(seasons: Season[]): Season[] {
  return seasons
    .map(season => ({ season, match: (season.titre_saison || '').match(SEASON_TITLE) }))
    .filter(({ season, match }) => match && !/film|oav|ova|sp[ée]cial|hors/i.test(season.titre_saison))
    .sort((a, b) => Number(a.match![1]) - Number(b.match![1]) || Number(a.match![2] || 0) - Number(b.match![2] || 0))
    .map(({ season }) => season);
}

/** Série principale (TV/ONA) dans l'ordre de diffusion. */
export function mainLine(franchise: FranchiseEntry[]): FranchiseEntry[] {
  return franchise.filter(entry => entry.format && MAIN_FORMATS.includes(entry.format)).sort((a, b) => a.start - b.start);
}

const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

/** Numéro de saison d'une entrée d'après son titre ("Season 2", "2nd Season", "III"), sinon null. */
export function titleSeasonNumber(title: string): number | null {
  const explicit = title.match(/season\s*(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
  if (explicit) return Number(explicit[1]);
  const roman = title.match(/\s(II|III|IV|V|VI|VII|VIII|IX|X)(?=$|[\s:!.-])/);
  return roman ? ROMAN[roman[1]] : null;
}
const isContinuation = (title: string) => /\b(part|cour)\s*(\d+|ii|iii)\b/i.test(title);

/**
 * Numéro de saison de chaque entrée de la série principale. Une entrée sans numéro dans son titre
 * prolonge la saison précédente si c'est une "Part/Cour", sinon ouvre la saison suivante.
 */
export function seasonNumbers(line: FranchiseEntry[]): Map<number, number> {
  const numbers = new Map<number, number>();
  let previous = 0;
  for (const entry of line) {
    const titles = [entry.title, ...(entry.titles || [])];
    const found = titles.map(titleSeasonNumber).find((n): n is number => n !== null);
    const number = found ?? (previous === 0 ? 1 : titles.some(isContinuation) ? previous : previous + 1);
    numbers.set(entry.id, number);
    previous = number;
  }
  return numbers;
}

/**
 * Convertit (saison, épisode) en (entrée MAL, épisode). Notre "Saison N" ne correspond qu'aux entrées
 * de la saison N côté AniList : la correspondance ne déborde jamais sur une autre saison.
 * Renvoie null en cas de doute (saison non régulière, numéro introuvable, épisode hors limites).
 */
export function mapEpisode(seasons: Season[], franchise: FranchiseEntry[], seasonId: string, episodeNumber: number): MalTarget | null {
  const ours = regularSeasons(seasons);
  const season = ours.find(item => item.id === seasonId);
  if (!season || episodeNumber < 1) return null;
  const number = Number(season.titre_saison.match(SEASON_TITLE)![1]);
  const line = mainLine(franchise);
  const numbers = seasonNumbers(line);
  const group = line.filter(entry => numbers.get(entry.id) === number);
  const parts = ours.filter(item => Number(item.titre_saison.match(SEASON_TITLE)![1]) === number);
  if (!group.length) return null;

  const toTarget = (entry: FranchiseEntry, episode: number): MalTarget | null =>
    entry.idMal && (entry.episodes === null || episode <= entry.episodes)
      ? { malId: entry.idMal, episode, total: entry.episodes, title: entry.title }
      : null;

  // Autant de parties des deux côtés : correspondance une à une.
  if (parts.length > 1 && parts.length === group.length) return toTarget(group[parts.indexOf(season)], episodeNumber);

  // Sinon, répartition cumulative à l'intérieur de la saison (anime-sama regroupe souvent les parties).
  let position = parts.slice(0, parts.indexOf(season)).reduce((sum, item) => sum + (item.nb_episodes || 0), 0) + episodeNumber;
  for (let i = 0; i < group.length; i++) {
    const size = group[i].episodes ?? (i === group.length - 1 ? Infinity : null);
    if (size === null) return null;
    if (position <= size) return toTarget(group[i], position);
    position -= size;
  }
  return null; // au-delà de la saison côté MAL (épisode récapitulatif, découpage différent) : on s'abstient
}

/** Première entrée de la série principale : celle qu'on ajoute en "Plan to Watch". */
export function firstEntry(franchise: FranchiseEntry[]): FranchiseEntry | null {
  return mainLine(franchise).find(entry => entry.idMal) || null;
}

// ---------------------------------------------------------------------------------------------
// Récupération de la chaîne sur AniList (sans authentification), mise en cache 7 jours.

const ANILIST_URL = 'https://graphql.anilist.co';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 2; // à incrémenter si la forme des entrées change
const FIELDS = 'id idMal type format episodes title { romaji english } startDate { year month day } relations { edges { relationType node { id type } } }';

export async function anilistQuery<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  // AniList limite à 30 requêtes/minute : on attend le délai indiqué puis on réessaie (2 fois au plus).
  if (response.status === 429 && attempt < 2) {
    const wait = Math.min(60, Number(response.headers.get('Retry-After')) || 30);
    await new Promise(resolve => setTimeout(resolve, wait * 1000));
    return anilistQuery(query, variables, attempt + 1);
  }
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(`AniList : ${body.errors?.[0]?.message || response.status}`);
  return body.data;
}

/** Identifiant AniList d'une fiche : le sien, ou retrouvé à partir de son identifiant MAL. */
export async function resolveAnilistId(anime: { anilistId?: number; malId?: number }): Promise<number | null> {
  if (anime.anilistId) return anime.anilistId;
  if (!anime.malId) return null;
  const data = await anilistQuery<{ Media: { id: number } | null }>('query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { id } }', { idMal: anime.malId }).catch(() => null);
  return data?.Media?.id ?? null;
}

const toEntry = (media: any): FranchiseEntry => ({
  id: media.id,
  idMal: media.idMal ?? null,
  format: media.format ?? null,
  episodes: media.episodes ?? null,
  start: media.startDate?.year ? media.startDate.year * 10000 + (media.startDate.month || 12) * 100 + (media.startDate.day || 28) : 99999999,
  title: media.title?.english || media.title?.romaji || '',
  titles: [media.title?.english, media.title?.romaji].filter(Boolean),
});

/** Parcourt les suites et préquelles à partir d'une fiche AniList (par lots de 50, 8 niveaux au plus). */
export async function fetchFranchise(anilistId: number): Promise<FranchiseEntry[]> {
  const cacheKey = `mal.franchise.v${CACHE_VERSION}.${anilistId}`;
  try {
    const cached = JSON.parse((await AsyncStorage.getItem(cacheKey)) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.entries;
  } catch { /* cache illisible : on recharge */ }

  const seen = new Map<number, FranchiseEntry>();
  let frontier = [anilistId];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next: number[] = [];
    for (let i = 0; i < frontier.length; i += 50) {
      const data = await anilistQuery<{ Page: { media: any[] } }>(
        `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${FIELDS} } } }`,
        { ids: frontier.slice(i, i + 50) }
      );
      for (const media of data.Page.media) {
        seen.set(media.id, toEntry(media));
        for (const edge of media.relations?.edges || []) {
          if (['SEQUEL', 'PREQUEL'].includes(edge.relationType) && edge.node?.type === 'ANIME' && !seen.has(edge.node.id)) next.push(edge.node.id);
        }
      }
    }
    frontier = [...new Set(next)].filter(id => !seen.has(id));
  }
  const entries = [...seen.values()];
  await AsyncStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), entries })).catch(() => {});
  return entries;
}
