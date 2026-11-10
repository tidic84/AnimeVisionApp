import { WATCHED_PROGRESS } from './watchProgress';

/**
 * Statistiques personnelles calculées depuis `watchHistory`.
 *
 * L'historique garde une ligne par épisode : la dernière progression (en %), la position d'un
 * éventuel revisionnage et la date du dernier visionnage. Il ne garde ni le temps réellement passé
 * ni les visionnages précédents : le temps total est donc une estimation (progression × durée).
 */
export interface WatchStatsRow {
  animeId: string;
  episodeId: string;
  /** Progression du premier visionnage, en % (100 aussi pour un épisode marqué vu à la main). */
  progress: number;
  /** Position du revisionnage en cours, en %. */
  rewatchProgress?: number | null;
  lastWatchedAt: Date;
  /** Durée de l'épisode en secondes, si sa fiche est encore en cache. */
  episodeDuration?: number | null;
  /** Durée moyenne d'un épisode de l'animé, en minutes. */
  animeDuration?: number | null;
  /** Genres de l'animé ; vide si sa fiche n'est plus en cache. */
  genres: string[];
}

export interface WeekBucket { start: Date; count: number }
export interface GenreCount { genre: string; episodes: number; animes: number }
export interface WatchStats {
  /** Épisodes vus jusqu'au seuil « vu ». */
  episodesWatched: number;
  /** Épisodes commencés sans être terminés. */
  episodesInProgress: number;
  /** Animés avec au moins un épisode vu. */
  animesWatched: number;
  /** Temps regardé estimé, en secondes. */
  estimatedSeconds: number;
  /** Épisodes sans durée connue, comptés avec la durée par défaut. */
  assumedDurations: number;
  weeks: WeekBucket[];
  genres: GenreCount[];
  /** Animés vus dont les genres sont connus, sur `animesWatched`. */
  animesWithGenres: number;
}

/** Durée supposée d'un épisode quand ni l'épisode ni l'animé n'en indiquent une. */
export const DEFAULT_EPISODE_SECONDS = 24 * 60;
export const WEEKS_SHOWN = 8;

const percent = (value?: number | null) => Math.max(0, Math.min(100, Number(value) || 0));
const positive = (value?: number | null) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const isWatched = (row: WatchStatsRow) => percent(row.progress) >= WATCHED_PROGRESS;

/** Durée d'un épisode : la sienne, sinon celle de l'animé, sinon la durée par défaut (`assumed`). */
export function episodeSeconds(row: Pick<WatchStatsRow, 'episodeDuration' | 'animeDuration'>): { seconds: number; assumed: boolean } {
  const own = positive(row.episodeDuration);
  if (own) return { seconds: own, assumed: false };
  const average = positive(row.animeDuration) * 60;
  return average ? { seconds: average, assumed: false } : { seconds: DEFAULT_EPISODE_SECONDS, assumed: true };
}

/** Temps regardé estimé pour une ligne : premier visionnage plus revisionnage en cours. */
export const estimatedSeconds = (row: WatchStatsRow) => episodeSeconds(row).seconds * (percent(row.progress) + percent(row.rewatchProgress)) / 100;

/** Lundi 00:00 (heure locale) de la semaine de `date`. */
export function weekStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7);
}

/** Épisodes vus par semaine sur les `weeks` dernières semaines, de la plus ancienne à la semaine en cours. */
export function episodesPerWeek(rows: WatchStatsRow[], now: Date = new Date(), weeks = WEEKS_SHOWN): WeekBucket[] {
  const current = weekStart(now);
  // Par date de calendrier et non par pas de 7 × 24 h : une semaine de changement d'heure commence aussi un lundi 00:00.
  const buckets = Array.from({ length: weeks }, (_, index) => ({ start: new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7 * (weeks - 1 - index)), count: 0 }));
  const byStart = new Map(buckets.map(bucket => [bucket.start.getTime(), bucket]));
  for (const row of rows) {
    if (!isWatched(row) || Number.isNaN(row.lastWatchedAt.getTime())) continue;
    const bucket = byStart.get(weekStart(row.lastWatchedAt).getTime());
    if (bucket) bucket.count++;
  }
  return buckets;
}

/** Genres classés par épisodes vus, puis par animés, puis par ordre alphabétique. */
export function topGenres(rows: WatchStatsRow[], limit = 5): GenreCount[] {
  const genres = new Map<string, { genre: string; episodes: number; animes: Set<string> }>();
  for (const row of rows) {
    if (!isWatched(row)) continue;
    // Un genre répété dans une fiche (« Action », « action ») ne compte qu'une fois par épisode.
    const names = new Map<string, string>();
    for (const value of row.genres) {
      const genre = String(value ?? '').trim();
      if (genre && !names.has(genre.toLowerCase())) names.set(genre.toLowerCase(), genre);
    }
    for (const [key, genre] of names) {
      const entry = genres.get(key) ?? { genre, episodes: 0, animes: new Set<string>() };
      entry.episodes++; entry.animes.add(row.animeId);
      genres.set(key, entry);
    }
  }
  return [...genres.values()]
    .map(entry => ({ genre: entry.genre, episodes: entry.episodes, animes: entry.animes.size }))
    .sort((a, b) => b.episodes - a.episodes || b.animes - a.animes || a.genre.localeCompare(b.genre, 'fr'))
    .slice(0, limit);
}

export function computeWatchStats(rows: WatchStatsRow[], now: Date = new Date()): WatchStats {
  const watched = rows.filter(isWatched);
  // Une ligne sans progression (épisode ouvert puis refermé) ne compte nulle part.
  const counted = rows.filter(row => percent(row.progress) + percent(row.rewatchProgress) > 0);
  return {
    episodesWatched: watched.length,
    episodesInProgress: rows.filter(row => percent(row.progress) > 0 && !isWatched(row)).length,
    animesWatched: new Set(watched.map(row => row.animeId)).size,
    estimatedSeconds: Math.round(counted.reduce((total, row) => total + estimatedSeconds(row), 0)),
    assumedDurations: counted.filter(row => episodeSeconds(row).assumed).length,
    weeks: episodesPerWeek(rows, now),
    genres: topGenres(rows),
    animesWithGenres: new Set(watched.filter(row => row.genres.some(genre => String(genre ?? '').trim())).map(row => row.animeId)).size,
  };
}

/** « 45 min », « 3 h », « 12 h 05 min ». Les heures ne sont pas converties en jours : elles se comparent mieux. */
export function formatDuration(seconds: number): string {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.round(value / 60);
  if (minutes < 1) return value > 0 ? 'moins d’une minute' : '0 min';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, '0')} min` : ''}`;
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count > 1 ? pluralForm : singular}`;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Étiquette courte sous une barre : le lundi de la semaine, « 3/11 ». */
export const weekTick = (start: Date) => `${start.getDate()}/${start.getMonth() + 1}`;
/** « semaine du 3 novembre ». */
export const weekName = (start: Date) => `semaine du ${start.getDate() === 1 ? '1er' : start.getDate()} ${MONTHS[start.getMonth()]}`;
