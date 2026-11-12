// Catalogue étendu : flux OPDS (fichiers enregistrés depuis un vrai Komga 1.29.1), fournisseur OPDS contre un faux
// serveur, parcours complet MangaDex par curseur et regroupement des doublons entre sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./load-ts.cjs');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const BASE = 'http://localhost:25600';
const feed = loadTs('services/comics/opdsFeed.ts');
const { groupDuplicates, normalizeTitle, sameWork } = loadTs('services/comics/duplicates.ts');

// --- Lecture des flux ---
assert.equal(feed.absolute('/opds/v1.2/x', 'http://h:1/a/b'), 'http://h:1/opds/v1.2/x');
assert.equal(feed.absolute('c?d=1', 'http://h/a/b?q'), 'http://h/a/c?d=1');
assert.equal(feed.absolute('../c', 'http://h/a/b/d'), 'http://h/a/c');
assert.equal(feed.absolute('https://o/x', 'http://h/'), 'https://o/x');
assert.equal(feed.decode('Tom &amp; Jerry &#233;t&#xE9; <![CDATA[<b>]]>'), 'Tom & Jerry été <b>');

const root = feed.parseFeed(fixture('opds-komga-root.xml'), `${BASE}/opds/v1.2/catalog`);
assert.equal(root.title, 'Komga OPDS catalog');
assert.ok(root.entries.some(entry => entry.title === 'All series'));
assert.equal(root.links.find(link => link.rel === 'search').href, `${BASE}/opds/v1.2/search`);
assert.equal(feed.searchTemplate(fixture('opds-komga-search.xml'), `${BASE}/opds/v1.2/search`), `${BASE}/opds/v1.2/series?search={searchTerms}`);
const series = feed.parseFeed(fixture('opds-komga-series.xml'), `${BASE}/opds/v1.2/series`);
assert.deepEqual(series.entries.map(entry => entry.title), ['One-Punch Man', 'Solo Leveling']);
const one = feed.parseFeed(fixture('opds-komga-one.xml'), `${BASE}/opds/v1.2/series/x`);
const stream = feed.pseLink(one.entries[0]);
assert.equal(stream.count, 5);
assert.ok(stream.href.endsWith('/pages/{pageNumber}'), 'modèle {pageNumber} gardé tel quel');
assert.ok(feed.thumbnail(one.entries[0]).endsWith('/thumbnail/small'));
assert.deepEqual(feed.pageUrls('http://h/p/{pageNumber}?w={maxWidth}', 2, 800), ['http://h/p/0?w=800', 'http://h/p/1?w=800']);

// --- Doublons entre sources ---
const comic = (provider, id, title, altTitles = []) => ({ id, provider, kind: 'manga', title, altTitles, synopsis: '', genres: [], status: 'unknown', languages: [] });
assert.equal(normalizeTitle('One-Punch Man !'), 'onepunchman');
assert.equal(normalizeTitle('Pokémon'), 'pokemon');
const md = comic('mangadex', 'm1', 'One-Punch Man', ['Wanpanman']);
const webcomic = comic('mangadex', 'm2', 'One-Punch Man (Webcomic)', ['One-Punch Man']);
const komga = comic('opds:k', 'k1', 'One Punch-Man');
assert.ok(sameWork(md, komga));
assert.ok(!sameWork(md, webcomic), 'deux fiches MangaDex = deux œuvres');
const groups = groupDuplicates([md, webcomic, komga, comic('local', 'l1', 'Autre titre')]);
assert.equal(groups.length, 3);
assert.deepEqual(groups[0].also.map(item => item.id), ['k1']);

// --- Parcours complet MangaDex ---
const mangadex = loadTs('services/comics/mangadex.ts', {}, { fetch: async () => { throw new Error('offline'); } });
const search = { kind: 'manga', language: 'all', order: 'added', offset: 0, limit: 2 };
const all = mangadex.searchPath(search);
assert.ok(!all.includes('availableTranslatedLanguage'), 'toutes les langues : pas de filtre de traduction');
assert.ok(all.includes('order[createdAt]=asc'));
assert.ok(mangadex.searchPath({ ...search, offset: 9990, cursor: '2024-05-01T04:16:50' }).includes('offset=0&') && mangadex.searchPath({ ...search, cursor: '2024-05-01T04:16:50' }).includes('createdAtSince=2024-05-01T04%3A16%3A50'));
const raw = date => ({ attributes: { createdAt: `${date}+00:00` } });
assert.equal(mangadex.nextCursor([raw('2024-01-01T00:00:00'), raw('2024-01-02T03:04:05')], search), '2024-01-02T03:04:05');
assert.equal(mangadex.nextCursor([raw('2024-01-01T00:00:00')], search), undefined, 'dernière page');
assert.equal(mangadex.nextCursor([raw('2024-01-02T03:04:05'), raw('2024-01-02T03:04:05')], { ...search, cursor: '2024-01-02T03:04:05' }), '2024-01-02T03:04:06', 'pas de boucle sur une même seconde');

// --- Fournisseur OPDS contre un faux serveur ---
(async () => {
  const store = new Map();
  const AsyncStorage = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } };
  const calls = [];
  const routes = { '/opds/v1.2/catalog': 'opds-komga-root.xml', '/opds/v1.2/search': 'opds-komga-search.xml', '/opds/v1.2/series': 'opds-komga-series.xml', '/opds/v1.2/series?search=solo': 'opds-komga-search-solo.xml', '/opds/v1.2/series/0S6RF1JBD9WV9': 'opds-komga-one.xml', '/opds/v1.2/series?search=punch': 'opds-komga-series.xml' };
  const empty = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Series search for: one punch</title></feed>';
  const fetch = async (url, options) => {
    calls.push({ url, auth: options?.headers?.Authorization });
    if (options?.headers?.Authorization !== `Basic ${btoa('test@example.com:pass')}`) return { ok: false, status: 401, text: async () => '' };
    if (url.endsWith('search=one%20punch')) return { ok: true, status: 200, text: async () => empty };
    const file = routes[url.slice(BASE.length)];
    return file ? { ok: true, status: 200, text: async () => fixture(file) } : { ok: false, status: 404, text: async () => '' };
  };
  const mocks = { '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage }, 'expo-secure-store': {}, 'react-native': { Platform: { OS: 'web' } } };
  const opds = loadTs('services/comics/opds.ts', mocks, { fetch });
  await assert.rejects(opds.saveServer({ name: 'Maison', url: `${BASE}/opds/v1.2/catalog`, username: 'test@example.com', password: 'faux' }), /refuse l’accès/);
  const server = await opds.saveServer({ name: 'Maison', url: `${BASE}/opds/v1.2/catalog/`, username: 'test@example.com', password: 'pass' });
  assert.equal(server.url, `${BASE}/opds/v1.2/catalog`, 'barre finale retirée');
  assert.deepEqual(opds.imageHeaders(`${BASE}/opds/v1.2/books/x/pages/0`), { Authorization: `Basic ${btoa('test@example.com:pass')}` });
  assert.equal(opds.imageHeaders('https://uploads.mangadex.org/x.jpg'), undefined, 'identifiants jamais envoyés ailleurs');
  const provider = opds.opdsProvider(server.id);
  const browse = await provider.search({ kind: 'all', language: 'all', order: 'popular', offset: 0, limit: 24 });
  assert.deepEqual(browse.items.map(item => item.title), ['One-Punch Man', 'Solo Leveling']);
  assert.ok(browse.items[0].provider.startsWith('opds:'));
  const found = await provider.search({ kind: 'all', query: 'solo', language: 'all', order: 'popular', offset: 0, limit: 24 });
  assert.deepEqual(found.items.map(item => item.title), ['Solo Leveling']);
  // Komga ne trouve pas « one punch » : nouvel essai sur « punch », filtré sur le titre.
  const retried = await provider.search({ kind: 'all', query: 'one punch', language: 'all', order: 'popular', offset: 0, limit: 24 });
  assert.deepEqual(retried.items.map(item => item.title), ['One-Punch Man']);
  const chapters = await provider.getChapters(browse.items[0].id, '');
  assert.deepEqual(chapters.map(chapter => [chapter.volume, chapter.pages]), [['1', 5], ['2', 5]], 'tomes reconnus dans les titres');
  const pages = await provider.getPages(chapters[0].id);
  assert.equal(pages.length, 5);
  assert.ok(pages[0].url.endsWith('/pages/0') && pages[4].url.endsWith('/pages/4'), 'pages numérotées à partir de 0');
  const detail = await provider.getComic(browse.items[0].id);
  assert.equal(detail.title, 'One-Punch Man');
  assert.ok(detail.cover.endsWith('/thumbnail/small'));
  await provider.setKind(browse.items[0].id, 'manhwa');
  assert.equal((await provider.getComic(browse.items[0].id)).kind, 'manhwa');
  console.log('comic catalog: ok');
})().catch(error => { console.error(error); process.exit(1); });
