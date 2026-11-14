// "Reprendre" row: resume point, next episode and ordering, with a mocked API and database.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const data = { seasons: {}, episodes: {}, local: {}, remote: {}, latest: [] };
const calls = [];
const apiService = {
  getSeasonEpisodes: async seasonId => { calls.push(`season:${seasonId}`); return data.episodes[seasonId] ?? []; },
  getAnimeSeasons: async animeId => data.seasons[animeId] ?? [],
  getLatestEpisodes: async () => data.latest,
  getEpisodeById: async id => { calls.push(`episode:${id}`); if (!data.remote[id]) throw new Error('404'); return data.remote[id]; },
};
const databaseService = { getAnimeEpisodes: async animeId => data.local[animeId] ?? [] };
const { resolveContinue, getContinueWatching, isEpisodeBefore, lastOpenedEpisode, clearContinueCache } = loadTs('services/continueWatching.ts', {
  './apiService': { __esModule: true, default: apiService },
  './databaseService': { __esModule: true, default: databaseService },
});

const ep = (animeId, season, number, langue = 'VOSTFR', extra = {}) => ({ id: `${animeId}-${season}-${number}-${langue}`, animeId, animeTitle: animeId.toUpperCase(), saison_id: season, number, langue, title: `Episode ${number}`, streamingUrls: [], ...extra });
const at = seconds => new Date(Date.UTC(2026, 10, 10, 12, 0, seconds));
const entry = (episode, progress, seconds, extra = {}) => ({ animeId: episode.animeId, episodeId: episode.id, progress, lastWatchedAt: at(seconds), ...extra });
const reset = () => { clearContinueCache(); calls.length = 0; Object.assign(data, { seasons: {}, episodes: {}, local: {}, remote: {}, latest: [] }); };

(async () => {
  // Below 90 %: resume the same episode where it stopped.
  reset();
  const a1 = ep('a', 's1', 1), a2 = ep('a', 's1', 2), a2vf = ep('a', 's1', 2, 'VF'), a3 = ep('a', 's1', 3);
  data.local.a = [a1, a2, a3]; data.episodes.s1 = [a3, a2vf, a1, a2];
  let item = await resolveContinue('a', [entry(a1, 89, 0)]);
  assert.equal(item.kind, 'resume'); assert.equal(item.episode.id, a1.id); assert.equal(item.episode.watchProgress, 89);
  assert.equal(item.sortAt, at(0).getTime());

  // From 90 %: the next episode of the same language, from its start.
  item = await resolveContinue('a', [entry(a1, 90, 0)]);
  assert.equal(item.kind, 'next'); assert.equal(item.episode.id, a2.id); assert.equal(item.episode.watchProgress, 0);
  // Next episode already started: resume it; rewatching, the next one already watched is offered again from the start.
  item = await resolveContinue('a', [entry(a1, 100, 10), entry(a2, 30, 0)]);
  assert.equal(item.episode.id, a2.id); assert.equal(item.episode.watchProgress, 30);
  item = await resolveContinue('a', [entry(a1, 100, 10, { rewatchProgress: 100 }), entry(a2, 95, 0)]);
  assert.equal(item.kind, 'next'); assert.equal(item.episode.id, a2.id); assert.equal(item.episode.watchProgress, 0);
  item = await resolveContinue('a', [entry(a1, 100, 10, { rewatchProgress: 100 }), entry(a3, 100, 0)]);
  assert.equal(item.episode.id, a2.id, 'a rewatch follows the last episode opened, not the furthest one');

  // First viewing started from a later episode: the furthest one counts, the earlier ones stay as they are.
  item = await resolveContinue('a', [entry(a1, 100, 10), entry(a2, 95, 0)]);
  assert.equal(item.episode.id, a3.id, 'episode 2 watched, then episode 1: go on with episode 3');
  item = await resolveContinue('a', [entry(a1, 40, 10), entry(a2, 30, 0)]);
  assert.equal(item.kind, 'resume'); assert.equal(item.episode.id, a2.id); assert.equal(item.episode.watchProgress, 30);
  assert.equal((await lastOpenedEpisode('a', [entry(a1, 40, 10), entry(a3, 30, 0)])).id, a3.id);
  // A rewatch in progress overrides the finished first viewing.
  item = await resolveContinue('a', [entry(a2, 100, 0, { rewatchProgress: 25 })]);
  assert.equal(item.kind, 'resume'); assert.equal(item.episode.watchProgress, 25);

  // "Mark the season watched" writes every episode within a few seconds: the furthest one counts.
  item = await resolveContinue('a', [entry(a1, 100, 4), entry(a3, 100, 3), entry(a2, 100, 0)]);
  assert.equal(item, null, 'episode 3 is the last of the only season');
  item = await resolveContinue('a', [entry(a1, 100, 30), entry(a3, 100, 0)]);
  assert.equal(item, null, 'last episode watched first, then episode 1: everything before counts as seen');
  item = await resolveContinue('a', [entry(a1, 30, 30), entry(a3, 100, 0)]);
  assert.equal(item, null, 'an earlier episode opened later does not become the resume point');

  // End of season: first episode of the next season with the same language (a VF-only season is skipped).
  clearContinueCache(); // the season list was cached empty above
  data.seasons.a = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  data.episodes.s2 = [ep('a', 's2', 1, 'VF')];
  const s3e1 = ep('a', 's3', 1), s3e2 = ep('a', 's3', 2);
  data.episodes.s3 = [s3e2, s3e1];
  item = await resolveContinue('a', [entry(a3, 100, 0)]);
  assert.equal(item.episode.id, s3e1.id);
  assert.equal(item.episode.animeTitle, 'A');
  // The furthest episode is ranked by season first, then by number.
  data.remote[s3e1.id] = s3e1;
  item = await resolveContinue('a', [entry(a3, 100, 20), entry(s3e1, 100, 0)]);
  assert.equal(item.episode.id, s3e2.id, 'season 3 episode 1 comes after season 1 episode 3');
  assert.equal(await isEpisodeBefore('a', a3, s3e1), true);
  assert.equal(await isEpisodeBefore('a', s3e1, a3), false);
  assert.equal(await isEpisodeBefore('a', a1, a2), true);
  assert.equal(await isEpisodeBefore('a', { ...a1, saison_id: undefined }, a2), false);

  // Local copy without its season: completed from the API, once thanks to the cache.
  reset();
  const b1 = ep('b', 'sb', 1), b2 = ep('b', 'sb', 2);
  data.local.b = [{ ...b1, saison_id: undefined }]; data.remote[b1.id] = b1; data.episodes.sb = [b1, b2];
  item = await resolveContinue('b', [entry(b1, 100, 0)]);
  assert.equal(item.episode.id, b2.id);
  await resolveContinue('b', [entry(b1, 100, 0)]);
  assert.deepEqual(calls, [`episode:${b1.id}`, 'season:sb']);
  assert.equal((await lastOpenedEpisode('b', [entry(b1, 10, 0)])).saison_id, 'sb');
  // Episode unknown everywhere: nothing to show.
  assert.equal(await resolveContinue('b', [{ animeId: 'b', episodeId: 'gone', progress: 10, lastWatchedAt: at(0) }]), null);
  assert.equal(await resolveContinue('b', []), null);

  // Home row: one item per anime, most recent first, a fresh release moves its anime up, limit applies.
  reset();
  const shows = Array.from({ length: 18 }, (_, index) => `show${index}`);
  for (const id of shows) { data.local[id] = [ep(id, `${id}s`, 1), ep(id, `${id}s`, 2)]; data.episodes[`${id}s`] = data.local[id]; }
  // show0 watched most recently ... show17 the oldest; all finished episode 1 except show1 (in progress).
  const history = shows.flatMap((id, index) => [entry(data.local[id][0], id === 'show1' ? 50 : 100, 1000 - index * 10)]);
  history.splice(1, 0, entry(data.local.show0[0], 20, 995));
  const released = data.local.show17[1];
  data.latest = [{ ...released, date_ajout: at(5000).toISOString() }];
  const row = await getContinueWatching(history, 5);
  assert.deepEqual(row.map(item => item.episode.animeId), ['show17', 'show0', 'show1', 'show2', 'show3']);
  assert.equal(row[0].sortAt, at(5000).getTime());
  assert.equal(row[1].episode.id, data.local.show0[1].id, 'the latest entry of an anime decides, not an older one');
  assert.equal(row[2].kind, 'resume');
  const quiet = await getContinueWatching(history.filter(value => value.animeId !== 'show17'), 30);
  assert.equal(quiet.length, 15, 'beyond the 15 most recent animes, only fresh releases are checked');
  console.log('continue watching tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
