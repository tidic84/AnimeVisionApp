// MangaDex provider (mangas and manhwas): mapping of API payloads, chapter selection, page URLs, search query and rate-limit retry.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const calls = [];
let responses = [];
const fakeFetch = async (url, options) => {
  calls.push({ url, options });
  const next = responses.shift();
  return { ok: next.status === 200, status: next.status, headers: { get: name => (next.headers || {})[name] ?? null }, json: async () => next.body };
};
const md = loadTs('services/comics/mangadex.ts', {}, { fetch: fakeFetch, setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {} });

const raw = {
  id: 'm1',
  attributes: {
    title: { 'ko-ro': 'Na Honjaman Level-Up' },
    altTitles: [{ ko: '나 혼자만 레벨업' }, { en: 'Solo Leveling' }, { fr: 'Solo Leveling (FR)' }],
    description: { en: 'English text', fr: ' Texte français ' },
    status: 'completed', year: 2018, availableTranslatedLanguages: ['fr', 'en'],
    tags: [{ attributes: { group: 'genre', name: { en: 'Action' } } }, { attributes: { group: 'theme', name: { en: 'Monsters' } } }, { attributes: { group: 'genre', name: { en: 'Unknown Genre' } } }],
  },
  relationships: [{ type: 'author', id: 'a' }, { type: 'cover_art', attributes: { fileName: 'c.jpg' } }],
};
const manhwa = md.mapComic(raw, 'fr');
assert.equal(manhwa.title, 'Solo Leveling (FR)', 'French alt title wins');
assert.equal(md.mapComic(raw, 'en').title, 'Solo Leveling');
assert.equal(manhwa.synopsis, 'Texte français');
assert.deepEqual(manhwa.genres, ['Action', 'Unknown Genre'], 'only genre tags, translated when known');
assert.equal(manhwa.coverThumb, 'https://uploads.mangadex.org/covers/m1/c.jpg.256.jpg');
assert.equal(manhwa.status, 'completed');
assert.equal(md.mapComic({ id: 'x', attributes: { title: { ja: 'タイトル' }, status: 'weird' } }).title, 'タイトル', 'falls back to any title');
assert.equal(md.mapComic({ id: 'x', attributes: { title: {} } }).status, 'unknown');
assert.equal(md.mapComic({ id: 'x', attributes: {} }).cover, undefined);

const chapter = (id, number, extra = {}) => md.mapChapter({ id, attributes: { chapter: number, translatedLanguage: 'fr', pages: 10, ...extra }, relationships: [{ type: 'scanlation_group', attributes: { name: 'Team' } }] });
assert.equal(chapter('c', '1').group, 'Team');
assert.equal(chapter('c', '1').available, true);
assert.equal(chapter('c', '1', { externalUrl: 'https://publisher' }).available, false, 'external chapters are not readable here');
assert.equal(chapter('c', '1', { pages: 0 }).available, false);
assert.equal(chapter('c', '1', { isUnavailable: true }).available, false);

const deduped = md.dedupeChapters([chapter('a', '10'), chapter('b', '2', { pages: 0 }), chapter('c', '2'), chapter('d', '2.5'), chapter('e', null), chapter('f', '10')]);
assert.deepEqual(deduped.map(item => item.id), ['e', 'c', 'd', 'a'], 'one per number, readable preferred, numeric order, one-shot first');

const pages = md.pagesFromAtHome({ baseUrl: 'https://node', chapter: { hash: 'h', data: ['1.jpg', '2.jpg'], dataSaver: ['1s.jpg'] } });
assert.deepEqual(pages, [{ url: 'https://node/data/h/1.jpg', fallbackUrl: 'https://node/data-saver/h/1s.jpg' }, { url: 'https://node/data/h/2.jpg', fallbackUrl: undefined }]);
assert.deepEqual(md.pagesFromAtHome({}), []);

const path = md.searchPath({ kind: 'manhwa', query: ' solo lev ', tagIds: ['t1'], status: 'ongoing', language: 'fr', order: 'popular', offset: 24, limit: 24 });
for (const part of ['originalLanguage[]=ko', 'availableTranslatedLanguage[]=fr', 'title=solo%20lev', 'order[relevance]=desc', 'includedTags[]=t1', 'status[]=ongoing', 'offset=24', 'contentRating[]=safe']) assert.ok(path.includes(part), part);
assert.ok(!path.includes('followedCount'), 'search ranks by relevance');
assert.ok(md.searchPath({ kind: 'manga', language: 'en', order: 'latest', offset: 0, limit: 24 }).includes('order[latestUploadedChapter]=desc'));
assert.ok(!md.searchPath({ kind: 'manga', language: 'en', order: 'latest', status: 'unknown', offset: 0, limit: 24 }).includes('status[]'));

(async () => {
  // A 429 is retried once; the request carries a real User-Agent.
  responses = [{ status: 429, headers: { 'X-RateLimit-Retry-After': '0' } }, { status: 200, body: { data: [raw], total: 1 } }];
  const result = await md.default.search({ kind: 'manhwa', language: 'fr', order: 'popular', offset: 0, limit: 24 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].title, 'Solo Leveling (FR)');
  assert.equal(calls.length, 2);
  assert.match(calls[1].options.headers['User-Agent'], /AnimeVision/);

  // Chapter feed is paginated until `total`.
  calls.length = 0;
  responses = [
    { status: 200, body: { data: Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, attributes: { chapter: String(i + 1), pages: 3 } })), total: 501 } },
    { status: 200, body: { data: [{ id: 'last', attributes: { chapter: '501', pages: 3 } }], total: 501 } },
  ];
  const all = await md.default.getChapters('m1', 'fr');
  assert.equal(all.length, 501);
  assert.ok(calls[1].url.includes('offset=500'));

  responses = [{ status: 404, body: {} }];
  await assert.rejects(md.default.getComic('missing'), /introuvable/);
  console.log('comics mangadex tests passed');
})().catch(error => { console.error(error); process.exit(1); });
