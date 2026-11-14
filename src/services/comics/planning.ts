// Planning des scans : sorties de la semaine pour les séries suivies (favoris et lectures en cours),
// et sorties gratuites annoncées des chapitres premium (date donnée par la source).
import { getChaptersCached } from './index';
import { Comic, ComicChapter, ComicLanguage } from './types';

export interface ComicPlanningEntry { comic: Comic; chapter: ComicChapter; at: string; upcoming: boolean }
export interface FollowedComic { comic: Comic; language: ComicLanguage }

const DAY = 86_400_000;
/** Lundi 00:00 (heure locale) de la semaine de `now`. */
export function weekStart(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime() - ((date.getDay() + 6) % 7) * DAY;
}
/** Jour de la semaine (0 = lundi) d'une date, ou -1 hors de la semaine commençant à `monday`. */
export function weekDay(at: string, monday: number): number {
  const time = Date.parse(at);
  if (!Number.isFinite(time) || time < monday || time >= monday + 7 * DAY) return -1;
  const date = new Date(time);
  return (date.getDay() + 6) % 7;
}

/** Entrées d'une série pour la semaine : chapitres publiés, et chapitres verrouillés qui deviennent gratuits. */
export function entriesFor(comic: Comic, chapters: ComicChapter[], monday: number, now = Date.now()): ComicPlanningEntry[] {
  const entries: ComicPlanningEntry[] = [];
  for (const chapter of chapters) {
    if (chapter.available && chapter.publishedAt && weekDay(chapter.publishedAt, monday) >= 0) entries.push({ comic, chapter, at: chapter.publishedAt, upcoming: Date.parse(chapter.publishedAt) > now });
    else if (!chapter.available && chapter.availableAt && weekDay(chapter.availableAt, monday) >= 0) entries.push({ comic, chapter, at: chapter.availableAt, upcoming: Date.parse(chapter.availableAt) > now });
  }
  return entries;
}

// shortcut: au plus 40 séries suivies interrogées ; au-delà, prévoir un rafraîchissement en arrière-plan.
const MAX_FOLLOWED = 40;

export async function getComicPlanning(followed: FollowedComic[], now = Date.now()): Promise<ComicPlanningEntry[]> {
  const monday = weekStart(now);
  const unique = [...new Map(followed.filter(item => item.comic.provider !== 'local' && !item.comic.provider.startsWith('opds:'))
    .map(item => [`${item.comic.provider}:${item.comic.id}`, item])).values()].slice(0, MAX_FOLLOWED);
  const results = await Promise.all(unique.map(({ comic, language }) =>
    getChaptersCached(comic.provider, comic.id, language || 'fr').then(chapters => entriesFor(comic, chapters, monday, now)).catch(() => [])));
  return results.flat().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
