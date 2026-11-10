import apiService from './apiService';
import databaseService from './databaseService';
import { Anime, WatchHistory } from '../types/anime';
import { isFinished } from '../utils/watchProgress';
import { createLogger } from '../utils/logger';

const log = createLogger('Recommendations');

export type RecommendationShelf = { sourceId: string; title: string; items: Anime[] };

/** Animés sources essayés tour à tour, du plus pertinent au moins pertinent. */
export const MAX_SOURCES = 3;
/** En dessous, l'étagère paraît vide : on essaie la source suivante. */
export const MIN_ITEMS = 3;
export const MAX_ITEMS = 12;
// La route renvoie aussi des titres déjà vus : on en demande plus que l'étagère n'en montre.
const FETCH_LIMIT = 24;

/**
 * Animés sources possibles. `history` est trié du plus récent au plus ancien.
 * Un animé dont au moins un épisode a été terminé passe avant un animé à peine ouvert ;
 * à égalité, le plus récemment regardé gagne.
 */
export const pickSources = (history: WatchHistory[], max = MAX_SOURCES): string[] => {
  const engaged = new Map<string, boolean>();
  for (const entry of history) {
    if (!entry.animeId) continue;
    engaged.set(entry.animeId, (engaged.get(entry.animeId) ?? false) || isFinished(entry.progress));
  }
  const ids = [...engaged.keys()];
  return [...ids.filter(id => engaged.get(id)), ...ids.filter(id => !engaged.get(id))].slice(0, Math.max(0, max));
};

/** Retire les animés exclus (vus, en liste, la source), les doublons et les fiches inutilisables. */
export const filterRecommendations = (items: Anime[], excluded: ReadonlySet<string>, limit = MAX_ITEMS): Anime[] => {
  const seen = new Set<string>();
  const kept: Anime[] = [];
  for (const item of items) {
    if (!item || !item.id || !item.title?.trim() || excluded.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
};

export const shelfTitle = (sourceTitle: string) => `Parce que vous avez regardé ${sourceTitle.trim()}`;

// Cache mémoire court : l'accueil recalcule l'étagère à chaque focus.
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<any> }>();
const cached = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
};
export const clearRecommendationsCache = () => cache.clear();

const similar = (animeId: string) => cached<Anime[]>(`similar:${animeId}`, () => apiService.getSimilarAnimes(animeId, FETCH_LIMIT));
const sourceTitle = (animeId: string) => cached<string>(`title:${animeId}`, async () => {
  const local = await databaseService.getAnime(animeId).catch(() => null);
  return local?.title?.trim() || (await apiService.getAnimeById(animeId)).title?.trim() || '';
});

/**
 * Étagère « Parce que vous avez regardé X », ou `null` s'il n'y a rien d'utile à montrer
 * (historique vide, route en échec, tout déjà vu). Ne rejette jamais.
 * `excludedIds` : animés déjà en liste ou déjà suivis ; ceux de l'historique sont exclus d'office.
 */
export const getRecommendationShelf = async (history: WatchHistory[], excludedIds: Iterable<string> = []): Promise<RecommendationShelf | null> => {
  try {
    const sources = pickSources(history);
    if (!sources.length) return null;
    const excluded = new Set<string>(excludedIds);
    for (const entry of history) excluded.add(entry.animeId);
    for (const sourceId of sources) {
      const items = filterRecommendations(await similar(sourceId).catch(() => [] as Anime[]), excluded);
      if (items.length < MIN_ITEMS) continue;
      const title = await sourceTitle(sourceId).catch(() => '');
      if (!title) continue;
      return { sourceId, title: shelfTitle(title), items };
    }
  } catch (error) {
    log.debug('Recommandations indisponibles', error);
  }
  return null;
};
