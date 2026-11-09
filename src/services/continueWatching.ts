import apiService from './apiService';
import databaseService from './databaseService';
import { Episode, Season, WatchHistory } from '../types/anime';
import { episodeLanguage, isFinished } from '../utils/watchProgress';

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

const findEpisode = async (episodeId: string, local: Episode[]) =>
  local.find(episode => episode.id === episodeId) || await apiService.getEpisodeById(episodeId).catch(() => null);

// Premier épisode non fini après `current`, même langue : suite de la saison, puis saisons suivantes.
const nextEpisode = async (animeId: string, current: Episode, progress: Map<string, number>): Promise<Episode | null> => {
  const language = episodeLanguage(current);
  const pick = (list: Episode[], after: number) => list
    .filter(episode => episode.number > after && (!language || episodeLanguage(episode) === language))
    .sort((a, b) => a.number - b.number);
  const firstUnwatched = (list: Episode[]) => list.find(episode => !isFinished(progress.get(episode.id)));
  if (!current.saison_id) return null;
  const sameSeason = pick(await seasonEpisodes(current.saison_id, animeId), current.number);
  const found = firstUnwatched(sameSeason);
  if (found) return found;
  const seasons = await animeSeasons(animeId);
  const index = seasons.findIndex(season => season.id === current.saison_id);
  if (index < 0) return null;
  for (const season of seasons.slice(index + 1)) {
    const candidates = pick(await seasonEpisodes(season.id, animeId), -Infinity);
    if (!candidates.length) continue;
    const next = firstUnwatched(candidates);
    if (next) return next;
  }
  return null;
};

/** Historique d'un seul animé, du plus récent au plus ancien. */
export const resolveContinue = async (animeId: string, entries: WatchHistory[]): Promise<ContinueItem | null> => {
  if (!entries.length) return null;
  const local = await databaseService.getAnimeEpisodes(animeId).catch(() => [] as Episode[]);
  const numbers = new Map(local.map(episode => [episode.id, episode.number]));
  // « Marquer la saison comme vue » écrit tout d'un coup : parmi ces entrées, l'épisode le plus avancé fait foi.
  const latestAt = entries[0].lastWatchedAt.getTime();
  const latest = entries.filter(entry => latestAt - entry.lastWatchedAt.getTime() <= 5000)
    .reduce<WatchHistory>((best, entry) => (numbers.get(entry.episodeId) ?? -1) > (numbers.get(best.episodeId) ?? -1) ? entry : best, entries[0]);
  const current = await findEpisode(latest.episodeId, local);
  if (!current) return null;
  if (!isFinished(latest.progress)) return { episode: { ...current, animeId, watchProgress: latest.progress }, kind: 'resume', sortAt: latestAt };
  const progress = new Map(entries.map(entry => [entry.episodeId, entry.progress]));
  const next = await nextEpisode(animeId, current, progress).catch(() => null);
  if (!next) return null;
  return { episode: { ...next, animeId, animeTitle: next.animeTitle || current.animeTitle, watchProgress: progress.get(next.id) ?? 0 }, kind: 'next', sortAt: latestAt };
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
  const candidates = animeIds.filter((id, index) => index < RECENT_ANIMES || (released.has(id) && isFinished(byAnime.get(id)![0].progress)));
  const items = await Promise.all(candidates.map(id => resolveContinue(id, byAnime.get(id)!).catch(() => null)));
  return items.filter((item): item is ContinueItem => !!item)
    // Un épisode tout juste sorti remonte à sa date de sortie.
    .map(item => item.kind === 'next' ? { ...item, sortAt: Math.max(item.sortAt, releasedAt.get(item.episode.id) ?? 0) } : item)
    .sort((a, b) => b.sortAt - a.sortAt).slice(0, limit);
};
