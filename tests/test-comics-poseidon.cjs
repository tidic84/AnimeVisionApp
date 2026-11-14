// Poseidon Scans provider: Next.js flight parsing, premium lock, catalogue filtering and page URLs.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const push = data => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(data).slice(1, -1))}])</script>`;
const seriesHtml = push({ _count: { chapters: 3 }, manga: { slug: 'abc', chapters: [
  { number: 2, title: null, createdAt: '$D2026-01-02T00:00:00.000Z', isPremium: true, premiumUntil: '$D2099-01-01T00:00:00.000Z' },
  { number: 1.5, title: 'Bonus "spécial"', createdAt: '$D2026-01-01T00:00:00.000Z', isPremium: false },
  { number: 1, title: null, createdAt: '$D2026-01-01T00:00:00.000Z', isPremium: true, premiumUntil: '$D2020-01-01T00:00:00.000Z' },
] } });
const chapterHtml = push({ initialData: { images: [{ originalUrl: '/api/chapters/abc/c1/p2', order: 1 }, { originalUrl: '/api/chapters/abc/c1/p1', order: 0 }] } });
const catalog = { success: true, data: [
  { slug: 'abc', title: 'Épée Solo', type: 'MANHWA', status: 'en cours', coverImage: 'storage/covers/abc-x.webp', categories: [{ name: 'Action' }], _count: { ratings: 5 }, createdAt: '2025-01-01' },
  { slug: 'def', title: 'Autre', type: 'MANGA', status: 'terminé', coverImage: 'storage/covers/def.webp', categories: [{ name: 'Romance' }], _count: { ratings: 9 }, createdAt: '2024-01-01' },
] };

const calls = [];
const routes = { '/api/manga/all': catalog, '/serie/abc': seriesHtml, '/serie/abc/chapter/1': chapterHtml, '/serie/abc/chapter/2': push({ initialData: { images: [] } }) };
const fakeFetch = async url => {
  const path = url.replace('https://poseidon-scans.net', '');
  calls.push(path);
  const body = routes[path];
  return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body, text: async () => body };
};
const p = loadTs('services/comics/poseidon.ts', {}, { fetch: fakeFetch });
const provider = p.default;

(async () => {
  assert.equal(p.jsonAfter(p.flightData(seriesHtml), 'chapters').length, 3, 'skips the "chapters":3 counter');

  const chapters = await provider.getChapters('abc', 'fr');
  assert.deepEqual(chapters.map(c => [c.id, c.number, c.available]), [['abc/1', '1', true], ['abc/1.5', '1.5', true], ['abc/2', '2', false]]);
  assert.equal(chapters[1].title, 'Bonus "spécial"');
  assert.equal(chapters[0].publishedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(await provider.getChapters('abc', 'en'), []);

  const pages = await provider.getPages('abc/1');
  assert.deepEqual(pages.map(page => page.url), ['https://poseidon-scans.net/api/chapters/abc/c1/p1', 'https://poseidon-scans.net/api/chapters/abc/c1/p2']);
  await assert.rejects(provider.getPages('abc/2'), /premium/);

  const base = { kind: 'all', language: 'fr', order: 'popular', offset: 0, limit: 1 };
  const first = await provider.search(base);
  assert.deepEqual([first.items[0].id, first.total, first.next], ['def', 2, '1']);
  assert.equal((await provider.search({ ...base, cursor: '1' })).items[0].id, 'abc');
  assert.equal((await provider.search({ ...base, query: 'epee', limit: 10 })).items[0].title, 'Épée Solo');
  assert.deepEqual((await provider.search({ ...base, kind: 'manga', limit: 10 })).items.map(c => c.id), ['def']);
  assert.deepEqual((await provider.search({ ...base, tagIds: ['Action'], status: 'ongoing', limit: 10 })).items.map(c => c.id), ['abc']);
  assert.equal((await provider.search({ ...base, language: 'en' })).items.length, 0);

  const comic = await provider.getComic('abc');
  assert.deepEqual([comic.kind, comic.status, comic.cover], ['manhwa', 'ongoing', 'https://poseidon-scans.net/api/covers/abc-x.webp']);
  assert.equal(calls.filter(path => path === '/api/manga/all').length, 1, 'catalogue cached');
  console.log('poseidon: ok');
})().catch(error => { console.error(error); process.exit(1); });
