import apiService from './apiService';
import databaseService from './databaseService';
import { Episode, Season, WatchHistory } from '../types/anime';
import { effectiveProgress, episodeLanguage, isFinished } from '../utils/watchProgress';

export type ContinueItem = { episode: Episode; kind: 'resume' | 'next'; sortAt: number };

// Cache mémoire court : l'accueil se recharge à chaque focus, une requête par saison suffit.
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<any> }>();
const cached = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
};
export const clearContinueCache = () => cache.clear();

const seasonEpisodes = (seasonId: string, animeId: string) => cached<Episode[]>(`season:${seasonId}`, () => apiService.getSeasonEpisodes(seasonId, animeId));
const animeSeasons = (animeId: string) => cached<Season[]>(`seasons:${animeId}`, () => apiService.getAnimeSeasons(animeId));
const latestFeed = () => cached<Episode[]>('latest', () => apiService.getLatestEpisodes(100));
const time = (value?: string) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : 0; };

// La base locale ne garde pas la saison : l'API complète l'épisode quand il le faut.
const findEpisode = async (episodeId: string, local: Episode[]) => {
  const saved = local.find(episode => episode.id === episodeId);
  if (saved?.saison_id) return saved;
  const remote = await cached<Episode | null>(`episode:${episodeId}`, () => apiService.getEpisodeById(episodeId)).catch(() => null);
  return remote ? { ...saved, ...remote } : saved || null;
};

// Épisode qui suit `current`, vu ou non (revisionnage), même langue : suite de la saison, puis saisons suivantes.
const nextEpisode = async (animeId: string, current: Episode): Promise<Episode | null> => {
  const language = episodeLanguage(current);
  const pick = (list: Episode[], after: number) => list
    .filter(episode => episode.number > after && (!language || episodeLanguage(episode) === language))
    .sort((a, b) => a.number - b.number)[0];
  if (!current.saison_id) return null;
  const found = pick(await seasonEpisodes(current.saison_id, animeId), current.number);
  if (found) return found;
  const seasons = await animeSeasons(animeId);
  const index = seasons.findIndex(season => season.id === current.saison_id);
  if (index < 0) return null;
  for (const season of seasons.slice(index + 1)) {
    const next = pick(await seasonEpisodes(season.id, animeId), -Infinity);
    if (next) return next;
  }
  return null;
};

/** `a` vient avant `b` dans l'ordre saison → épisode (inconnu : non). */
export const isEpisodeBefore = async (animeId: string, a: Episode, b: Episode): Promise<boolean> => {
  if (!a.saison_id || !b.saison_id) return false;
  if (a.saison_id === b.saison_id) return a.number < b.number;
  const seasons = await animeSeasons(animeId).catch(() => [] as Season[]);
  const first = seasons.findIndex(season => season.id === a.saison_id), second = seasons.findIndex(season => season.id === b.saison_id);
  return first >= 0 && second >= 0 && first < second;
};

/** Dernier épisode ouvert ou terminé ; « Marquer la saison comme vue » écrit tout d'un coup : l'épisode le plus avancé fait foi. */
const latestEntry = (entries: WatchHistory[], local: Episode[]) => {
  const numbers = new Map(local.map(episode => [episode.id, episode.number]));
  const latestAt = entries[0].lastWatchedAt.getTime();
  return entries.filter(entry => latestAt - entry.lastWatchedAt.getTime() <= 5000)
    .reduce<WatchHistory>((best, entry) => (numbers.get(entry.episodeId) ?? -1) > (numbers.get(best.episodeId) ?? -1) ? entry : best, entries[0]);
};

/** Rang saison → épisode de chaque épisode de l'animé ; sans saisons connues, le numéro local seul. */
const episodePositions = async (animeId: string, local: Episode[]) => {
  const seasons = await animeSeasons(animeId).catch(() => [] as Season[]);
  const lists = await Promise.all(seasons.map(season => seasonEpisodes(season.id, animeId).catch(() => [] as Episode[])));
  const positions = new Map<string, [number, number]>();
  if (!seasons.length) local.forEach(episode => positions.set(episode.id, [0, episode.number]));
  lists.forEach((list, index) => list.forEach(episode => positions.set(episode.id, [index, episode.number])));
  return positions;
};

/**
 * Point de reprise : l'épisode le plus avancé (saison → épisode) ouvert ou terminé, pas le premier non vu ni le
 * dernier ouvert — commencer par le dernier épisode sorti vaut « tout vu avant », sans rien marquer.
 * Un revisionnage (l'épisode le plus récent était déjà vu) suit le dernier épisode ouvert.
 */
const referenceEntry = async (animeId: string, entries: WatchHistory[], local: Episode[]) => {
  const latest = latestEntry(entries, local);
  if (entries.length < 2 || entries[0].rewatchProgress !== undefined) return latest;
  const positions = await episodePositions(animeId, local);
  const after = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
  let best = positions.has(latest.episodeId) ? latest : null;
  for (const entry of entries) {
    const position = positions.get(entry.episodeId);
    if (position && (!best || after(position, positions.get(best.episodeId)!) > 0)) best = entry;
  }
  return best ?? latest;
};

/** Épisode de référence de l'animé (historique du plus récent au plus ancien), celui de « Reprendre ». */
export const lastOpenedEpisode = async (animeId: string, entries: WatchHistory[]): Promise<Episode | null> => {
  if (!entries.length) return null;
  const local = await databaseService.getAnimeEpisodes(animeId).catch(() => [] as Episode[]);
  return findEpisode((await referenceEntry(animeId, entries, local)).episodeId, local);
};

/** Historique d'un seul animé, du plus récent au plus ancien. */
export const resolveContinue = async (animeId: string, entries: WatchHistory[]): Promise<ContinueItem | null> => {
  if (!entries.length) return null;
  const local = await databaseService.getAnimeEpisodes(animeId).catch(() => [] as Episode[]);
  const latest = await referenceEntry(animeId, entries, local);
  const latestAt = entries[0].lastWatchedAt.getTime();
  const current = await findEpisode(latest.episodeId, local);
  if (!current) return null;
  const position = effectiveProgress(latest);
  if (!isFinished(position)) return { episode: { ...current, animeId, watchProgress: position }, kind: 'resume', sortAt: latestAt };
  const next = await nextEpisode(animeId, current).catch(() => null);
  if (!next) return null;
  const saved = entries.find(entry => entry.episodeId === next.id);
  const nextPosition = saved ? effectiveProgress(saved) : 0;
  // Un épisode déjà vu proposé en revisionnage repart du début.
  return { episode: { ...next, animeId, animeTitle: next.animeTitle || current.animeTitle, watchProgress: isFinished(nextPosition) ? 0 : nextPosition }, kind: 'next', sortAt: latestAt };
};

const RECENT_ANIMES = 15;

/** Un élément par animé, d'après le dernier épisode consulté. `history` est trié du plus récent au plus ancien. */
export const getContinueWatching = async (history: WatchHistory[], limit = 12): Promise<ContinueItem[]> => {
  const byAnime = new Map<string, WatchHistory[]>();
  for (const entry of history) {
    const list = byAnime.get(entry.animeId);
    if (list) list.push(entry); else byAnime.set(entry.animeId, [entry]);
  }
  const animeIds = [...byAnime.keys()];
  // Les animés anciens ne sont revérifiés que si un nouvel épisode vient de sortir.
  const feed = await latestFeed().catch(() => [] as Episode[]);
  const released = new Set(feed.map(episode => episode.animeId));
  const releasedAt = new Map(feed.map(episode => [episode.id, time(episode.date_ajout) || time(episode.date_sortie)]));
  const candidates = animeIds.filter((id, index) => index < RECENT_ANIMES || (released.has(id) && isFinished(effectiveProgress(byAnime.get(id)![0]))));
  const items = await Promise.all(candidates.map(id => resolveContinue(id, byAnime.get(id)!).catch(() => null)));
  return items.filter((item): item is ContinueItem => !!item)
    // Un épisode tout juste sorti remonte à sa date de sortie.
    .map(item => item.kind === 'next' ? { ...item, sortAt: Math.max(item.sortAt, releasedAt.get(item.episode.id) ?? 0) } : item)
    .sort((a, b) => b.sortAt - a.sortAt).slice(0, limit);
};
