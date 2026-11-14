// Scans : zones d'appui et reconnaissance de chapitres portées de Mihon, correspondance entre traductions,
// disponibilité par langue (MangaDex) et filtre « Tous ».
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const nav = loadTs('services/comics/mihon/viewerNavigation.ts');
const recognition = loadTs('services/comics/mihon/chapterRecognition.ts');
const { findEquivalentChapter, chapterValue } = loadTs('services/comics/chapterMatch.ts');
const languages = loadTs('services/comics/languages.ts');
const requests = [];
const mangadex = loadTs('services/comics/mangadex.ts', {}, {
  fetch: async url => {
    requests.push(url);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ total: 62, data: [{ id: 'c1126', attributes: { chapter: '1126', volume: '111', translatedLanguage: 'pt-br', pages: 17 }, relationships: [{ type: 'scanlation_group', attributes: { name: 'Equipe' } }] }] }) };
  },
});

// --- Zones d'appui (Mihon ViewerNavigation) ---
const tap = (layout, x, y, reversed = false, invert) => nav.navigationAction(layout, x, y, reversed, invert);
// Bords gauche/droite : même comportement que l'ancien lecteur, sens manga inversé.
assert.equal(tap('sides', 0.05, 0.5, true), 'next', 'manga : bord gauche = suivant');
assert.equal(tap('sides', 0.95, 0.5, true), 'previous');
assert.equal(tap('sides', 0.05, 0.5, false), 'previous');
assert.equal(tap('sides', 0.5, 0.5, false), 'menu');
// En L : haut = précédent, bas = suivant, centre = menu ; le sens de lecture n'inverse pas PREV/NEXT.
assert.equal(tap('l', 0.5, 0.1), 'previous');
assert.equal(tap('l', 0.5, 0.9), 'next');
assert.equal(tap('l', 0.1, 0.5), 'previous');
assert.equal(tap('l', 0.9, 0.5, true), 'next');
assert.equal(tap('l', 0.5, 0.5), 'menu');
// Liseuse : bandeau du haut = menu.
assert.equal(tap('kindlish', 0.5, 0.1), 'menu');
assert.equal(tap('kindlish', 0.1, 0.8), 'previous');
assert.equal(tap('kindlish', 0.8, 0.8), 'next');
// Bords : bas du centre = précédent.
assert.equal(tap('edge', 0.5, 0.9), 'previous');
assert.equal(tap('edge', 0.1, 0.1), 'next');
assert.equal(tap('off', 0.05, 0.5), 'menu');
// Inversion horizontale/verticale.
assert.equal(tap('l', 0.5, 0.1, false, 'vertical'), 'next');
assert.equal(tap('sides', 0.05, 0.5, false, 'horizontal'), 'next');

// --- Reconnaissance des numéros (Mihon ChapterRecognition) ---
const parse = (name, title) => recognition.parseChapterName(name, title);
assert.deepEqual(parse('Mokushiroku Alice Vol.1 Ch. 4: Misrepresentation', 'Mokushiroku Alice'), { volume: '1', chapter: '4' });
assert.equal(parse('Bleach 567: Down With Snowwhite', 'Bleach').chapter, '567');
assert.equal(parse('Onepunch-Man Punch Ver002 028', 'Onepunch-Man').chapter, '28');
assert.equal(parse('Chapter 1.5 Part II').chapter, '1.5b');
assert.equal(parse('Oshi no Ko Chapter 5 Part 1', 'Oshi no Ko').chapter, '5a');
assert.equal(parse('One Piece 12 special', 'One Piece').chapter, '12.97');
assert.deepEqual(parse('The Gamer S3 - Chapter 20', 'The Gamer'), { volume: '3', chapter: '20' });
// Ajout pour les fichiers français : « Tome » est un volume, pas un chapitre.
assert.deepEqual(parse('Test Manga Tome 1'), { volume: '1', chapter: undefined });
assert.equal(recognition.toDouble('19a'), 19.1);
assert.equal(recognition.toDouble('1.5a'), 1.5);
assert.equal(recognition.toDouble('12.5'), 12.5);

// --- Chapitre équivalent entre traductions ---
const ch = (number, extra = {}) => ({ id: `${extra.language || 'en'}-${number || extra.title}`, number, title: '', language: 'en', pages: 20, available: true, ...extra });
const english = [ch('1'), ch('2', { volume: '1' }), ch('3'), ch('3.5'), ch('4.1'), ch('4.2'), ch('6'), ch('', { title: 'Oneshot' })];
assert.equal(chapterValue(ch('', { title: 'Chapter 7' })), 7, 'numéro lu dans le titre si absent');
let match = findEquivalentChapter(ch('3', { language: 'fr' }), english, 'anglais');
assert.equal(match.kind, 'exact');
assert.equal(match.chapter.id, 'en-3');
// Volume différent : incertain, l'utilisateur choisit.
match = findEquivalentChapter(ch('2', { volume: '2' }), english, 'anglais');
assert.equal(match.kind, 'uncertain');
assert.match(match.reason, /volume 1 au lieu du volume 2/);
// Chapitre découpé en parties dans l'autre langue.
match = findEquivalentChapter(ch('4'), english, 'anglais');
assert.equal(match.kind, 'uncertain');
assert.deepEqual(match.candidates.map(item => item.number), ['4.1', '4.2']);
// Bonus 2.5 absent : on propose le 2 sans l'imposer.
match = findEquivalentChapter(ch('2.5'), english, 'anglais');
assert.equal(match.kind, 'uncertain');
assert.ok(match.candidates.some(item => item.number === '2'));
// Trou dans la traduction, fin de traduction, one-shot.
match = findEquivalentChapter(ch('5'), english, 'anglais');
assert.equal(match.kind, 'none');
assert.deepEqual(match.candidates.map(item => item.number), ['4.2', '6']);
match = findEquivalentChapter(ch('40'), english, 'anglais');
assert.equal(match.kind, 'none');
assert.match(match.reason, /s’arrête au chapitre 6/);
match = findEquivalentChapter(ch('', { title: 'Oneshot' }), english, 'anglais');
assert.equal(match.kind, 'uncertain');
assert.equal(match.candidates[0].title, 'Oneshot');
// Chapitres non lisibles ignorés : aucune disponibilité inventée.
match = findEquivalentChapter(ch('3'), english.map(item => ({ ...item, available: false })), 'anglais');
assert.equal(match.kind, 'none');
assert.equal(match.candidates.length, 0);

// --- Langues ---
assert.equal(languages.languageName('pt-br'), 'Portugais (Brésil)');
assert.equal(languages.languageName('xx'), 'XX');
assert.deepEqual(languages.sortLanguages(['it', 'en', 'fr', 'de', 'en'], 'it'), ['it', 'fr', 'en', 'de']);

(async () => {
  // Disponibilité réelle : chapitres sans lien éditeur ni pages vides, le plus récent d'abord.
  const info = await mangadex.default.getLanguageInfo('op', 'pt-br');
  assert.equal(info.count, 62);
  assert.equal(info.last.number, '1126');
  assert.equal(info.last.volume, '111');
  for (const part of ['translatedLanguage[]=pt-br', 'limit=1', 'order[chapter]=desc', 'includeExternalUrl=0', 'includeEmptyPages=0'])
    assert.ok(requests[0].includes(part), part);
  // « Tous » : mangas (japonais) et manhwas (coréens) ensemble.
  const all = mangadex.searchPath({ kind: 'all', language: 'fr', order: 'popular', offset: 0, limit: 24 });
  assert.ok(all.includes('originalLanguage[]=ja') && all.includes('originalLanguage[]=ko'));
  assert.ok(!mangadex.searchPath({ kind: 'manga', language: 'fr', order: 'popular', offset: 0, limit: 24 }).includes('originalLanguage[]=ko'));
  console.log('comic languages: ok');
})().catch(error => { console.error(error); process.exit(1); });
