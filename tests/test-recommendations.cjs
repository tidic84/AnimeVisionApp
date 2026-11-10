// "Parce que vous avez regardé X" shelf: source choice, filtering and silent failure, with a mocked API and database.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const data = { similar: {}, local: {}, remote: {} };
const calls = [];
const apiService = {
  getSimilarAnimes: async (animeId, limit) => { calls.push(`similar:${animeId}:${limit}`); const value = data.similar[animeId]; if (value instanceof Error) throw value; return value ?? []; },
  getAnimeById: async id => { calls.push(`anime:${id}`); if (!data.remote[id]) throw new Error('404'); return data.remote[id]; },
};
const databaseService = { getAnime: async id => { if (data.local[id] instanceof Error) throw data.local[id]; return data.local[id] ?? null; } };
const { pickSources, filterRecommendations, shelfTitle, getRecommendationShelf, clearRecommendationsCache, MAX_ITEMS } = loadTs('services/recommendations.ts', {
  './apiService': { __esModule: true, default: apiService },
  './databaseService': { __esModule: true, default: databaseService },
});

const anime = (id, title = `Anime ${id}`) => ({ id, title, thumbnail: `${id}.jpg`, genres: [] });
const at = seconds => new Date(Date.UTC(2026, 10, 10, 12, 0, seconds));
// History is ordered newest first, as the database returns it.
const entry = (animeId, progress, seconds, extra = {}) => ({ animeId, episodeId: `${animeId}-${seconds}`, progress, lastWatchedAt: at(seconds), ...extra });
const reset = () => { clearRecommendationsCache(); calls.length = 0; Object.assign(data, { similar: {}, local: {}, remote: {} }); };
const ids = items => items.map(item => item.id);

(async () => {
  // --- pickSources ---
  assert.deepEqual(pickSources([]), []);
  // Most recently watched first, one entry per anime.
  assert.deepEqual(pickSources([entry('a', 95, 30), entry('b', 100, 20), entry('a', 100, 10)]), ['a', 'b']);
  // An anime with a finished episode beats a more recent one that was barely opened.
  assert.deepEqual(pickSources([entry('peek', 4, 30), entry('done', 100, 20), entry('half', 60, 10)]), ['done', 'peek', 'half']);
  // The finished episode does not have to be the latest entry of that anime.
  assert.deepEqual(pickSources([entry('peek', 4, 40), entry('a', 10, 30), entry('a', 90, 0)]), ['a', 'peek']);
  // 89 % is not finished; a rewatch in progress keeps its finished episode.
  assert.deepEqual(pickSources([entry('almost', 89, 30), entry('re', 100, 20, { rewatchProgress: 5 })]), ['re', 'almost']);
  // Nothing finished yet: plain recency.
  assert.deepEqual(pickSources([entry('x', 10, 30), entry('y', 20, 20)]), ['x', 'y']);
  // Bounded, and entries without an anime are ignored.
  assert.deepEqual(pickSources([entry('a', 100, 50), entry('b', 100, 40), entry('c', 100, 30), entry('d', 100, 20)]), ['a', 'b', 'c']);
  assert.deepEqual(pickSources([entry('a', 100, 50), entry('b', 100, 40)], 1), ['a']);
  assert.deepEqual(pickSources([entry('', 100, 50), entry('a', 100, 40)]), ['a']);

  // --- filterRecommendations ---
  const list = [anime('1'), anime('2'), anime('1'), anime('3'), { id: '', title: 'No id' }, anime('4', '  '), null, anime('5')];
  assert.deepEqual(ids(filterRecommendations(list, new Set())), ['1', '2', '3', '5']);
  assert.deepEqual(ids(filterRecommendations(list, new Set(['2', '5']))), ['1', '3']);
  assert.deepEqual(ids(filterRecommendations(list, new Set(), 2)), ['1', '2']);
  assert.deepEqual(filterRecommendations([], new Set(['1'])), []);
  // Order of the route (best match first) is kept.
  assert.deepEqual(ids(filterRecommendations([anime('9'), anime('3'), anime('7')], new Set())), ['9', '3', '7']);

  assert.equal(shelfTitle(' Frieren '), 'Parce que vous avez regardé Frieren');

  // --- getRecommendationShelf ---
  // Empty history: no shelf, no request.
  reset();
  assert.equal(await getRecommendationShelf([], []), null);
  assert.deepEqual(calls, []);

  // Names the source, drops what is in the history or excluded (watchlist, tracked), and the source itself.
  reset();
  data.local.a = anime('a', 'Frieren');
  data.similar.a = [anime('a'), anime('b'), anime('w'), anime('1'), anime('2'), anime('3')];
  let shelf = await getRecommendationShelf([entry('a', 100, 30), entry('b', 20, 10)], ['w']);
  assert.equal(shelf.sourceId, 'a');
  assert.equal(shelf.title, 'Parce que vous avez regardé Frieren');
  assert.deepEqual(ids(shelf.items), ['1', '2', '3']);

  // A second call within the cache lifetime does not hit the route again.
  const before = calls.length;
  data.similar.a = [...data.similar.a, anime('4')];
  shelf = await getRecommendationShelf([entry('a', 100, 30), entry('b', 20, 10)], ['w']);
  assert.equal(calls.length, before);
  assert.deepEqual(ids(shelf.items), ['1', '2', '3']);
  // Once cleared (pull to refresh), the route is asked again and new exclusions apply.
  clearRecommendationsCache();
  shelf = await getRecommendationShelf([entry('a', 100, 30), entry('b', 20, 10)], ['w', '1']);
  assert.deepEqual(ids(shelf.items), ['2', '3', '4']);

  // Capped to the shelf size.
  reset();
  data.local.a = anime('a', 'Frieren');
  data.similar.a = Array.from({ length: 30 }, (_, index) => anime(`r${index}`));
  shelf = await getRecommendationShelf([entry('a', 100, 30)]);
  assert.equal(shelf.items.length, MAX_ITEMS);

  // Route failing or too few usable titles for the first source: falls back to the next one.
  reset();
  data.local.b = anime('b', 'Bocchi the Rock!');
  data.similar.a = new Error('500');
  data.similar.b = [anime('1'), anime('2'), anime('3')];
  shelf = await getRecommendationShelf([entry('a', 100, 30), entry('b', 100, 20)]);
  assert.equal(shelf.title, 'Parce que vous avez regardé Bocchi the Rock!');
  reset();
  data.local.b = anime('b', 'Bocchi the Rock!');
  data.similar.a = [anime('1'), anime('b')];
  data.similar.b = [anime('1'), anime('2'), anime('3')];
  shelf = await getRecommendationShelf([entry('a', 100, 30), entry('b', 100, 20)]);
  assert.equal(shelf.sourceId, 'b');

  // A failed request is not cached: the next attempt asks again.
  reset();
  data.local.a = anime('a', 'Frieren');
  data.similar.a = new Error('timeout');
  assert.equal(await getRecommendationShelf([entry('a', 100, 30)]), null);
  data.similar.a = [anime('1'), anime('2'), anime('3')];
  assert.equal((await getRecommendationShelf([entry('a', 100, 30)])).sourceId, 'a');

  // Every source failing, fully seen, or answering garbage: no shelf, never a rejection.
  reset();
  data.similar.a = new Error('500');
  assert.equal(await getRecommendationShelf([entry('a', 100, 30), entry('b', 100, 20)]), null);
  reset();
  data.local.a = anime('a', 'Frieren');
  data.similar.a = [anime('1'), anime('2'), anime('3')];
  assert.equal(await getRecommendationShelf([entry('a', 100, 30)], ['1', '2', '3']), null);
  reset();
  data.similar.a = { not: 'a list' };
  assert.equal(await getRecommendationShelf([entry('a', 100, 30)]), null);

  // Source title: local database first, then the API; without a title the source is skipped.
  reset();
  data.local.a = new Error('sqlite');
  data.remote.a = anime('a', 'Vinland Saga');
  data.similar.a = [anime('1'), anime('2'), anime('3')];
  shelf = await getRecommendationShelf([entry('a', 100, 30)]);
  assert.equal(shelf.title, 'Parce que vous avez regardé Vinland Saga');
  reset();
  data.similar.a = [anime('1'), anime('2'), anime('3')];
  assert.equal(await getRecommendationShelf([entry('a', 100, 30)]), null);

  console.log('recommendations tests passed');
})().catch(error => { console.error(error); process.exit(1); });
