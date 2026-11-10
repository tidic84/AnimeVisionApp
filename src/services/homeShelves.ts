import databaseService from './databaseService';
import { WatchStatus } from '../types/anime';
import { createLogger } from '../utils/logger';

const log = createLogger('HomeShelves');

/** Étagère par genre de l'accueil : `genre` est le nom exact attendu par l'API, `title` ce qui s'affiche. */
export type GenreShelf = { genre: string; title: string };

/** Ce que l'on sait localement d'un animé : ses genres et la façon dont l'utilisateur s'y est intéressé. */
export type TasteSignal = {
  genres: string[];
  /** Épisodes regardés jusqu'au bout (historique local). */
  watchedEpisodes: number;
  /** Épisodes commencés sans être finis. */
  startedEpisodes: number;
  /** Présent dans au moins une liste. */
  inList: boolean;
  /** Statut de suivi (import MyAnimeList). */
  status?: string | null;
};

/** Étagères d'origine : affichées telles quelles sans historique, et en complément en dessous de trois genres. */
export const DEFAULT_GENRES = ['Action', 'Romance', 'Aventure'];
export const SHELF_COUNT = 3;

const own = (record: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(record, key);

const TITLES: Record<string, string> = {
  Action: 'Place à l’action',
  Romance: 'Un peu de romance',
  Aventure: 'L’aventure vous attend',
  Comédie: 'De quoi rire un peu',
  Drame: 'Des drames qui marquent',
  Fantastique: 'Une touche de fantastique',
  Fantasy: 'Des mondes de fantasy',
  'Science-fiction': 'Cap sur la science-fiction',
  'Tranche de vie': 'Le quotidien, tout en douceur',
  Mystère: 'Des mystères à percer',
  Horreur: 'De quoi frissonner',
  Thriller: 'Du suspense jusqu’au bout',
  Surnaturel: 'Aux frontières du surnaturel',
  Sport: 'L’esprit de compétition',
  Musique: 'En musique',
  Isekai: 'Bienvenue dans un autre monde',
  Magie: 'Un peu de magie',
  Historique: 'Voyage dans le passé',
};

// Genres de l'API qui ne font pas une étagère d'accueil : contenus adultes, sujets lourds,
// et fragments laissés par le scraper (« Post », « Super », « Aliens / Extra »...).
const EXCLUDED = new Set([
  'Ecchi', 'Érotique', 'Mature', 'Suicide', 'Mort', 'Esclavage', 'Harcèlement', 'Ijime', 'Handicap', 'Terrorisme', 'Assassinat',
  'Post', 'Super', 'Fiction', 'Ai', 'Aliens / Extra',
].map(genre => genre.toLowerCase()));

/**
 * Nom de genre exploitable, ou '' s'il ne doit pas donner d'étagère. L'API compare les genres à
 * l'identique : on ne corrige que les espaces et retours à la ligne parasites (« Romance\n »).
 * Les genres sans majuscule initiale sont des fins de mots coupés (« apocalyptique », « héros »).
 */
export function cleanGenre(genre: unknown): string {
  if (typeof genre !== 'string') return '';
  const name = genre.replace(/\\[rn]/g, ' ').trim();
  if (!name || name[0] === name[0].toLowerCase() || EXCLUDED.has(name.toLowerCase())) return '';
  return name;
}

export const shelfTitle = (genre: string) => (own(TITLES, genre) ? TITLES[genre] : `Dans vos goûts : ${genre}`);

const STATUS_WEIGHT: Record<string, number> = {
  [WatchStatus.COMPLETED]: 6,
  [WatchStatus.WATCHING]: 4,
  [WatchStatus.ON_HOLD]: 2,
};
const MAX_COUNTED_EPISODES = 12;

/**
 * Poids d'un animé dans les goûts. Un simple ajout en liste vaut 1 ; l'avoir regardé vaut de 2 à 8
 * selon le nombre d'épisodes (un épisode commencé compte pour moitié). Un statut importé
 * (terminé, en cours, en pause) vaut un visionnage quand l'historique local n'en dit pas plus.
 * Un animé abandonné ne compte pas.
 */
export function animeWeight(signal: TasteSignal): number {
  if (signal.status === WatchStatus.DROPPED) return 0;
  const episodes = Math.max(0, signal.watchedEpisodes || 0) + Math.max(0, signal.startedEpisodes || 0) / 2;
  const watched = episodes > 0 ? 2 + Math.min(episodes, MAX_COUNTED_EPISODES) / 2 : 0;
  const status = signal.status ?? '';
  const viewing = Math.max(watched, own(STATUS_WEIGHT, status) ? STATUS_WEIGHT[status] : 0);
  const wanted = signal.inList || signal.status === WatchStatus.NOT_STARTED ? 1 : 0;
  return viewing + wanted;
}

/** Genres du plus au moins présent dans l'historique et les listes ; à égalité, les genres par défaut puis l'ordre alphabétique. */
export function rankGenres(signals: TasteSignal[]): string[] {
  const weights = new Map<string, number>();
  for (const signal of signals) {
    const weight = animeWeight(signal);
    if (weight <= 0 || !Array.isArray(signal.genres)) continue;
    for (const genre of new Set(signal.genres.map(cleanGenre))) {
      if (genre) weights.set(genre, (weights.get(genre) ?? 0) + weight);
    }
  }
  const defaultRank = (genre: string) => { const index = DEFAULT_GENRES.indexOf(genre); return index < 0 ? DEFAULT_GENRES.length : index; };
  return [...weights.keys()].sort((a, b) => weights.get(b)! - weights.get(a)! || defaultRank(a) - defaultRank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Les genres préférés, complétés par ceux par défaut jusqu'à `count` étagères. */
export function pickGenreShelves(signals: TasteSignal[], count: number = SHELF_COUNT): GenreShelf[] {
  const genres = [...new Set([...rankGenres(signals), ...DEFAULT_GENRES])].slice(0, count);
  return genres.map(genre => ({ genre, title: shelfTitle(genre) }));
}

export const defaultGenreShelves = (): GenreShelf[] => pickGenreShelves([]);

/**
 * Étagères par genre de l'accueil selon l'historique et les listes locaux. Ne rejette jamais :
 * une base indisponible, ou trop lente pour ne pas retarder l'accueil, donne les étagères par défaut.
 */
export async function getGenreShelves(timeoutMs: number = 1500): Promise<GenreShelf[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const signals = await Promise.race([
      databaseService.getTasteSignals(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!signals) { log.warn('Goûts non disponibles à temps, étagères par défaut'); return defaultGenreShelves(); }
    return pickGenreShelves(signals);
  } catch (error) {
    log.warn('Étagères selon les goûts indisponibles, étagères par défaut', error);
    return defaultGenreShelves();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
