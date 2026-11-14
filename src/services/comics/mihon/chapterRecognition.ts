/*
 * Reconnaissance du numéro de chapitre et du volume dans un nom, portée de Mihon (https://github.com/mihonapp/mihon),
 * licence Apache 2.0 (voir ./LICENSE).
 * Origine : commit 524fa53043f2f5b2321ea13027e44f093ab4245c,
 *   domain/src/main/java/tachiyomi/domain/chapter/service/ChapterRecognition.kt
 * Modifications : traduit de Kotlin en TypeScript ; seule la lecture d'un nom isolé est reprise (parseName, parseNumber,
 * toDouble, volume) — le remplissage à partir de la liste entière (fillChapterNumbers) n'est pas porté, MangaDex
 * fournissant les numéros ; lookbehind « ch. » réécrit sans assertion arrière ; « tome » et « chapitre » ajoutés
 * pour les noms de fichiers français.
 */

const NUMBER_PATTERN = '([0-9]+)(\\.[0-9]+)?(\\.?[a-z]+)?';
const basic = new RegExp(`ch\\. *${NUMBER_PATTERN}`);
const number = new RegExp(NUMBER_PATTERN, 'g');
const unwanted = /\b(?:ver|version)[^a-z]?[0-9]+/g;
const unwantedWhiteSpace = /\s(?=extra|special|omake)/g;
const volume = /\b(?:(?:vol(?:ume)?|season|tome)[^a-z0-9]? *|[vs]\.?)([0-9]+(?:\.[0-9]+)?)\b/;
const part = /\bpart\.? *([0-9]+|i{1,3}|iv|vi{0,3}|ix|x)\b/;
const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

interface RecognizedNumber { value: number; letter?: string }
const format = (value: number) => String(Math.round(value * 1000) / 1000);
const show = (number: RecognizedNumber) => format(number.value) + (number.letter ?? '');

function toRecognizedNumber(match: RegExpMatchArray | RegExpExecArray, offset: number): RecognizedNumber {
  const whole = match[offset], decimal = match[offset + 1] || '', alpha = match[offset + 2] || '';
  const value = Number(whole) + (decimal ? Number(decimal) : 0);
  if (!decimal && alpha.includes('extra')) return { value: value + 0.99 };
  if (!decimal && alpha.includes('omake')) return { value: value + 0.98 };
  if (!decimal && alpha.includes('special')) return { value: value + 0.97 };
  const letter = alpha.replace(/^\.+/, '');
  return { value, letter: letter.length === 1 && letter >= 'a' && letter <= 'i' ? letter : undefined };
}

/** Le nombre après « ch. », sinon le premier, en ignorant les balises de version quand il y en a plusieurs. */
function parseNumber(name: string): RecognizedNumber | undefined {
  const clean = name.trim().replace(/,/g, '.').replace(/-/g, '.').replace(unwantedWhiteSpace, '');
  const numbers = [...clean.matchAll(number)];
  if (numbers.length > 1) {
    const withoutTags = clean.replace(unwanted, '');
    const found = withoutTags.match(basic) ?? withoutTags.match(new RegExp(NUMBER_PATTERN));
    if (found) return toRecognizedNumber(found, 1);
  }
  return numbers[0] && toRecognizedNumber(numbers[0], 1);
}

function parseName(name: string): RecognizedNumber | undefined {
  // Le volume ne peut pas être aussi le numéro de chapitre.
  const withoutVolume = name.replace(new RegExp(volume.source, 'g'), ' ');
  const partMatch = withoutVolume.match(part);
  if (partMatch) {
    const index = Number(partMatch[1]) || romanNumerals.indexOf(partMatch[1]) + 1;
    if (index >= 1 && index <= 26) {
      const rest = withoutVolume.slice(0, partMatch.index) + withoutVolume.slice(partMatch.index! + partMatch[0].length);
      const found = parseNumber(rest);
      if (found) return found.letter ? found : { ...found, letter: String.fromCharCode(96 + index) };
    }
  }
  return parseNumber(withoutVolume);
}

/** Volume et chapitre reconnus dans un nom (titre de l'œuvre retiré), ex. « Vol.2 Ch. 12 Part 2 » → { volume: '2', chapter: '12b' }. */
export function parseChapterName(chapterName: string, comicTitle = ''): { volume?: string; chapter?: string } {
  const lower = chapterName.toLowerCase();
  const name = comicTitle ? lower.replace(comicTitle.toLowerCase(), '') : lower;
  const found = name.match(volume);
  const chapter = parseName(name);
  return { volume: found ? format(Number(found[1])) : undefined, chapter: chapter && show(chapter) };
}

/** Numéro reconnu en nombre : une lettre compte en dixièmes sans décimales, ex. 19a → 19.1 et 1.5a → 1.5. */
export function toDouble(value: string): number {
  const letter = /[a-z]$/i.test(value) ? value.slice(-1).toLowerCase() : '';
  const numeric = Number(letter ? value.slice(0, -1) : value);
  const tenths = letter ? letter.charCodeAt(0) - 96 : 0;
  return letter && tenths < 10 && !value.includes('.') ? numeric + tenths / 10 : numeric;
}
