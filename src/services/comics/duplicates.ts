// Regroupement des doublons entre sources (MangaDex, serveurs, fichiers) : une carte par œuvre, sources conservées.
// Règle prudente : titre principal de l'un identique (après normalisation) à un titre de l'autre, et jamais deux
// entrées d'une même source (MangaDex regroupe déjà les traductions ; deux de ses fiches sont deux œuvres).
import { Comic } from './types';

export function normalizeTitle(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9぀-ヿ㐀-鿿가-힯]+/g, '');
}
const keys = (comic: Comic) => [comic.title, ...comic.altTitles].map(normalizeTitle).filter(key => key.length >= 3);
export function sameWork(a: Comic, b: Comic): boolean {
  if (a.provider === b.provider) return false;
  const main = [normalizeTitle(a.title), normalizeTitle(b.title)];
  return (main[0].length >= 3 && keys(b).includes(main[0])) || (main[1].length >= 3 && keys(a).includes(main[1]));
}

export interface ComicGroup { comic: Comic; also: Comic[] }
/** Garde l'ordre d'arrivée ; la première source trouvée porte la carte. */
export function groupDuplicates(items: Comic[]): ComicGroup[] {
  const groups: ComicGroup[] = [];
  for (const item of items) {
    const group = groups.find(entry => [entry.comic, ...entry.also].every(member => member.provider !== item.provider) && sameWork(entry.comic, item));
    if (group) group.also.push(item); else groups.push({ comic: item, also: [] });
  }
  return groups;
}
