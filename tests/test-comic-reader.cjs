// Comic reader: page order, reading direction, spreads, fitting, exact vertical position; local archive import helpers.
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { loadTs } = require('./load-ts.cjs');

const layout = loadTs('screens/Comics/readerLayout.ts');
const files = loadTs('services/comics/localFiles.ts');
const mangadex = loadTs('services/comics/mangadex.ts', {}, { fetch: async () => { throw new Error('offline'); } });

// Spreads: single page, or pairs in double-page mode (odd count ends alone).
assert.deepEqual(layout.spreads(3, 'single'), [[0], [1], [2]]);
assert.deepEqual(layout.spreads(5, 'double'), [[0, 1], [2, 3], [4]]);
assert.equal(layout.spreadOf(3, 'double'), 1);
assert.equal(layout.spreadOf(3, 'single'), 3);

// Right-to-left: the first page of a spread sits on the right; taps and arrows follow the direction.
assert.deepEqual(layout.displayOrder([2, 3], 'rtl'), [3, 2]);
assert.deepEqual(layout.displayOrder([2, 3], 'ltr'), [2, 3]);
assert.equal(layout.arrowAction('ArrowLeft', 'rtl'), 'next');
assert.equal(layout.arrowAction('ArrowRight', 'rtl'), 'previous');
assert.equal(layout.arrowAction('ArrowRight', 'ltr'), 'next');

// Fit: whole page in height, or width of the column; zoom multiplies.
assert.deepEqual(layout.fitSpread([1.5], { width: 1000, height: 600 }, 'height', 1), [{ width: 400, height: 600 }]);
assert.deepEqual(layout.fitSpread([1.5], { width: 300, height: 600 }, 'height', 1), [{ width: 300, height: 450 }], 'narrow screen: width limits');
assert.deepEqual(layout.fitSpread([1.5], { width: 1000, height: 600 }, 'width', 2), [{ width: 2000, height: 3000 }]);
assert.deepEqual(layout.fitSpread([1.5, 1.5], { width: 1000, height: 600 }, 'height', 1), [{ width: 400, height: 600 }, { width: 400, height: 600 }]);

// Vertical: exact position (page + fraction) round-trips through the scroll offset.
const offsets = layout.prefixOffsets([1000, 500, 2000]);
assert.deepEqual(offsets, [0, 1000, 1500, 3500]);
assert.deepEqual(layout.positionAt(0, offsets), { page: 0, offset: 0 });
assert.deepEqual(layout.positionAt(1250, offsets), { page: 1, offset: 0.5 });
assert.deepEqual(layout.positionAt(9999, offsets), { page: 2, offset: 1 });
assert.equal(layout.scrollFor(2, 0.25, offsets), 2000);
const back = layout.positionAt(layout.scrollFor(1, 0.4, offsets), offsets);
assert.equal(back.page, 1); assert.ok(Math.abs(back.offset - 0.4) < 1e-9);

// Local files: format by signature then extension, natural page order, junk skipped.
const archive = zipSync({
  'Tome 1/page10.jpg': new Uint8Array([1]), 'Tome 1/page2.jpg': new Uint8Array([2]), 'Tome 1/page1.png': new Uint8Array([3]),
  '__MACOSX/Tome 1/._page1.png': new Uint8Array([9]), 'Tome 1/.hidden.jpg': new Uint8Array([9]), 'Tome 1/info.txt': strToU8('x'), 'Tome 1/empty.jpg': new Uint8Array([]),
});
assert.equal(files.detectFormat('book.cbz'), 'zip');
assert.equal(files.detectFormat('renamed.bin', archive), 'zip', 'zip signature wins');
assert.equal(files.detectFormat('x.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), 'pdf');
assert.equal(files.detectFormat('notes.txt', strToU8('hello')), null);
assert.deepEqual(files.extractImages(archive).map(entry => entry.name), ['Tome 1/page1.png', 'Tome 1/page2.jpg', 'Tome 1/page10.jpg']);
assert.throws(() => files.extractImages(strToU8('not a zip at all')));
assert.equal(files.titleFromFileName('One_Piece_Tome_01.cbz'), 'One Piece Tome 01');
assert.equal(files.mimeOf('a.JPG'), 'image/jpeg');
assert.equal(files.mimeOf('a.webp'), 'image/webp');

// Kind: distinguish Korean and Chinese originals; searches include both Chinese variants.
assert.equal(mangadex.mapComic({ id: 'a', attributes: { originalLanguage: 'ko' } }).kind, 'manhwa');
assert.equal(mangadex.mapComic({ id: 'a', attributes: { originalLanguage: 'zh-hk' } }).kind, 'manhua');
assert.equal(mangadex.mapComic({ id: 'a', attributes: { originalLanguage: 'ja' } }).kind, 'manga');
assert.ok(mangadex.searchPath({ kind: 'manga', language: 'fr', order: 'popular', offset: 0, limit: 24 }).includes('originalLanguage[]=ja'));
assert.ok(mangadex.searchPath({ kind: 'manhwa', language: 'fr', order: 'popular', offset: 0, limit: 24 }).includes('originalLanguage[]=ko'));

assert.equal(mangadex.mapComic({ id: 'a', attributes: { originalLanguage: 'zh' } }).kind, 'manhua');
const searchParams = kind => new URLSearchParams(mangadex.searchPath({ kind, language: 'fr', order: 'popular', offset: 0, limit: 24 }).split('?')[1]);
assert.deepEqual(searchParams('manhua').getAll('originalLanguage[]'), ['zh', 'zh-hk']);
assert.deepEqual(searchParams('all').getAll('originalLanguage[]'), ['ja', 'ko', 'zh', 'zh-hk']);
assert.equal(searchParams('manhua').get('availableTranslatedLanguage[]'), 'fr', 'expanding origins preserves French chapters');
assert.deepEqual(searchParams('manhwa').getAll('originalLanguage[]'), ['ko'], 'Korean works keep their own filter');
const stored = new Map();
const preferences = loadTs('services/preferences.ts', {
  '@react-native-async-storage/async-storage': {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
  },
});
(async () => {
  const defaults = await preferences.getReaderSettings('manhua');
  assert.equal(defaults.mode, 'vertical');
  assert.equal(defaults.direction, 'ltr');
  await preferences.saveReaderSettings('manhua', { ...defaults, mode: 'single', readerWidth: 1100 });
  assert.equal((await preferences.getReaderSettings('manhua')).mode, 'single');
  assert.equal((await preferences.getReaderSettings('manhua')).readerWidth, 1100);
  assert.equal((await preferences.getReaderSettings('manhwa')).mode, 'vertical', 'manhua preferences do not change manhwa preferences');
  assert.equal((await preferences.getReaderSettings('manga')).direction, 'rtl');
  console.log('comic reader tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
