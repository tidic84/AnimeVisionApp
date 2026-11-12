// Chapitre équivalent dans une autre traduction. Les numéros ne coïncident pas toujours (chapitres découpés,
// éditions différentes, bonus) : on ne propose une correspondance sûre que si le numéro existe tel quel, sinon on
// explique pourquoi et on laisse choisir. Fonction pure, testée dans tests/test-comic-languages.cjs.
import { ComicChapter } from './types';
import { parseChapterName, toDouble } from './mihon/chapterRecognition';

export type ChapterMatch =
  | { kind: 'exact'; chapter: ComicChapter }
  | { kind: 'uncertain' | 'none'; reason: string; candidates: ComicChapter[] };

/** Numéro comparable d'un chapitre ; NaN pour un one-shot ou un bonus sans numéro. */
export function chapterValue(chapter: Pick<ComicChapter, 'number' | 'title'>): number {
  const number = chapter.number || parseChapterName(chapter.title).chapter;
  return number ? toDouble(number) : NaN;
}

export function findEquivalentChapter(current: ComicChapter, targets: ComicChapter[], languageName: string): ChapterMatch {
  const sortValue = (chapter: ComicChapter) => { const value = chapterValue(chapter); return Number.isNaN(value) ? -1 : value; };
  const readable = targets.filter(chapter => chapter.available).sort((a, b) => sortValue(a) - sortValue(b));
  const numbered = readable.filter(chapter => !Number.isNaN(chapterValue(chapter)));
  if (!readable.length) return { kind: 'none', reason: `Aucun chapitre n’est lisible en ${languageName} pour ce titre.`, candidates: [] };
  const value = chapterValue(current);
  const label = current.number || current.title || 'ce chapitre';

  if (Number.isNaN(value)) {
    const unnumbered = readable.filter(chapter => Number.isNaN(chapterValue(chapter)));
    return { kind: 'uncertain', reason: `« ${label} » n’a pas de numéro (one-shot, bonus ou spécial) : impossible de savoir à coup sûr lequel lui correspond en ${languageName}.`, candidates: unnumbered.length ? unnumbered : readable.slice(0, 5) };
  }
  const near = (center: number) => {
    const at = numbered.findIndex(chapter => chapterValue(chapter) >= center);
    const index = at < 0 ? numbered.length : at;
    return numbered.slice(Math.max(index - 1, 0), index + 2);
  };

  const same = numbered.find(chapter => chapterValue(chapter) === value);
  if (same) {
    if (current.volume && same.volume && current.volume !== same.volume)
      return { kind: 'uncertain', reason: `Le chapitre ${label} existe en ${languageName}, mais rangé dans le volume ${same.volume} au lieu du volume ${current.volume} : les éditions peuvent être découpées différemment.`, candidates: near(value) };
    return { kind: 'exact', chapter: same };
  }
  const parts = numbered.filter(chapter => Math.floor(chapterValue(chapter)) === value);
  if (Number.isInteger(value) && parts.length)
    return { kind: 'uncertain', reason: `En ${languageName}, le chapitre ${label} est découpé en plusieurs parties (${parts.map(chapter => chapter.number).join(', ')}). Commencez par la première.`, candidates: parts };
  const whole = numbered.find(chapter => chapterValue(chapter) === Math.floor(value));
  if (!Number.isInteger(value) && whole)
    return { kind: 'uncertain', reason: `Le chapitre ${label} (souvent un bonus ou une partie de chapitre) n’existe pas en ${languageName}. Le chapitre ${whole.number} en est le plus proche.`, candidates: near(value) };
  if (!numbered.length) return { kind: 'uncertain', reason: `Les chapitres en ${languageName} ne sont pas numérotés : choisissez celui qui correspond.`, candidates: readable.slice(0, 5) };
  const first = numbered[0], last = numbered[numbered.length - 1];
  if (value > chapterValue(last)) return { kind: 'none', reason: `La version en ${languageName} s’arrête au chapitre ${last.number} : le chapitre ${label} n’y est pas encore lisible.`, candidates: [last] };
  if (value < chapterValue(first)) return { kind: 'none', reason: `La version en ${languageName} commence au chapitre ${first.number}.`, candidates: [first] };
  return { kind: 'none', reason: `Le chapitre ${label} manque en ${languageName}. Voici les chapitres les plus proches.`, candidates: near(value) };
}
