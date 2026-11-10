// Mapping of our seasons (anime-sama split) onto MyAnimeList entries.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const storage = new Map();
const AsyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } };
let requests = [];
let media = {};
const fetch = async (url, options) => {
  const { variables } = JSON.parse(options.body);
  requests.push(variables.ids);
  return { ok: true, status: 200, json: async () => ({ data: { Page: { media: variables.ids.map(id => media[id]).filter(Boolean) } } }) };
};
const mapping = loadTs('services/mal/seasonMapping.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage } }, { fetch });
const { regularSeasons, mainLine, titleSeasonNumber, seasonNumbers, mapEpisode, firstEntry, fetchFranchise } = mapping;

const season = (id, titre_saison, nb_episodes) => ({ id, anime_id: 'a', num_saison: 0, titre_saison, nb_episodes, statut: '', type: '' });
let start = 20200101;
const entry = (id, title, episodes, extra = {}) => ({ id, idMal: id * 10, format: 'TV', episodes, start: start += 10000, title, ...extra });

// Regular seasons only, in order (season, then part); films, OAV and specials are not synced.
const ours = [season('s2', 'Saison 2', 12), season('film', 'Film', 1), season('s1p2', 'Saison 1 Partie 2', 13), season('s1', 'Saison 1', 12), season('oav', 'Saison 1 OAV', 2), season('hs', 'Saison 3 hors-série', 1), season('s10', 'Saison 10', 12)];
assert.deepEqual(regularSeasons(ours).map(item => item.id), ['s1', 's1p2', 's2', 's10']);

// Season number from an English or romaji title.
assert.equal(titleSeasonNumber('Attack on Titan Season 2'), 2);
assert.equal(titleSeasonNumber('Kaguya-sama: Love is War 2nd Season'), 2);
assert.equal(titleSeasonNumber('Overlord III'), 3);
assert.equal(titleSeasonNumber('Mob Psycho 100 II'), 2);
assert.equal(titleSeasonNumber('Re:ZERO -Starting Life in Another World-'), null);
assert.equal(titleSeasonNumber('Vivy: Fluorite Eye\'s Song'), null);

// Main line: TV/ONA only, by air date.
const franchise = [
  entry(3, 'Spy x Family Season 2', 12),
  entry(1, 'Spy x Family', 12),
  entry(2, 'Spy x Family Part 2', 13),
  entry(9, 'Spy x Family Code: White', 1, { format: 'MOVIE' }),
];
franchise[0].start = 20231001; franchise[1].start = 20220409; franchise[2].start = 20221001; franchise[3].start = 20231222;
assert.deepEqual(mainLine(franchise).map(item => item.id), [1, 2, 3]);
// A "Part 2" without number continues the previous season; otherwise an unnumbered entry opens the next one.
assert.deepEqual([...seasonNumbers(mainLine(franchise))], [[1, 1], [2, 1], [3, 2]]);
assert.deepEqual([...seasonNumbers([entry(1, 'Show', 12), entry(2, 'Show: The Sequel', 12)])], [[1, 1], [2, 2]]);

// anime-sama merges both parts into one 25-episode "Saison 1": cumulative split.
const merged = [season('s1', 'Saison 1', 25), season('s2', 'Saison 2', 12)];
assert.deepEqual(mapEpisode(merged, franchise, 's1', 12), { malId: 10, episode: 12, total: 12, title: 'Spy x Family' });
assert.deepEqual(mapEpisode(merged, franchise, 's1', 15), { malId: 20, episode: 3, total: 13, title: 'Spy x Family Part 2' });
assert.equal(mapEpisode(merged, franchise, 's1', 26), null, 'beyond the season on MAL: abstain');
// "Saison 2" never spills into season 1 entries.
assert.deepEqual(mapEpisode(merged, franchise, 's2', 1), { malId: 30, episode: 1, total: 12, title: 'Spy x Family Season 2' });

// As many parts on both sides: one to one, numbering restarts in each part.
const split = [season('p1', 'Saison 1', 12), season('p2', 'Saison 1 Partie 2', 13)];
assert.deepEqual(mapEpisode(split, franchise, 'p2', 5), { malId: 20, episode: 5, total: 13, title: 'Spy x Family Part 2' });
assert.equal(mapEpisode(split, franchise, 'p2', 14), null);
// Different number of parts: back to cumulative, counting the earlier parts.
const three = [season('p1', 'Saison 1', 12), season('p2', 'Saison 1 Partie 2', 12), season('p3', 'Saison 1 Partie 3', 1)];
assert.deepEqual(mapEpisode(three, franchise, 'p2', 1), { malId: 20, episode: 1, total: 13, title: 'Spy x Family Part 2' });
assert.deepEqual(mapEpisode(three, franchise, 'p3', 1), { malId: 20, episode: 13, total: 13, title: 'Spy x Family Part 2' });

// Airing entry (unknown count) at the end of the season: any episode maps to it.
const airing = [entry(1, 'Show', 12), entry(2, 'Show Part 2', null)];
assert.deepEqual(mapEpisode([season('s1', 'Saison 1', 30)], airing, 's1', 30), { malId: 20, episode: 18, total: null, title: 'Show Part 2' });
// Unknown count before another entry: impossible to split, abstain.
assert.equal(mapEpisode([season('s1', 'Saison 1', 30)], [entry(1, 'Show', null), entry(2, 'Show Part 2', 12)], 's1', 20), null);
// Entry without MAL id, non-regular season, episode 0, season missing on AniList.
assert.equal(mapEpisode(merged, [entry(1, 'Spy x Family', 12, { idMal: null })], 's1', 3), null);
assert.equal(mapEpisode([season('film', 'Film', 1)], franchise, 'film', 1), null);
assert.equal(mapEpisode(merged, franchise, 's1', 0), null);
assert.equal(mapEpisode([season('s5', 'Saison 5', 12)], franchise, 's5', 1), null);

// First main entry with a MAL id: the one added to "Plan to Watch".
assert.equal(firstEntry(franchise).id, 1);
assert.equal(firstEntry([entry(1, 'Show', 12, { idMal: null }), entry(2, 'Show 2nd Season', 12)]).id, 2);
assert.equal(firstEntry([entry(9, 'Movie', 1, { format: 'MOVIE' })]), null);

(async () => {
  // Franchise walk over SEQUEL/PREQUEL edges, cached for 7 days.
  const node = (id, relations, extra = {}) => ({ id, idMal: id * 10, type: 'ANIME', format: 'TV', episodes: 12, title: { romaji: `Show ${id}`, english: null }, startDate: { year: 2020 + id, month: null, day: null }, relations: { edges: relations.map(([relationType, target, type = 'ANIME']) => ({ relationType, node: { id: target, type } })) }, ...extra });
  media = { 1: node(1, [['SEQUEL', 2], ['ADAPTATION', 50, 'MANGA']]), 2: node(2, [['PREQUEL', 1], ['SEQUEL', 3], ['SIDE_STORY', 60]]), 3: node(3, [['PREQUEL', 2]]) };
  const entries = await fetchFranchise(2);
  assert.deepEqual(entries.map(item => item.id).sort(), [1, 2, 3]);
  assert.deepEqual(entries.find(item => item.id === 1), { id: 1, idMal: 10, format: 'TV', episodes: 12, start: 20211228, title: 'Show 1', titles: ['Show 1'] });
  assert.deepEqual(requests, [[2], [1, 3]]);
  requests = [];
  await fetchFranchise(2);
  assert.deepEqual(requests, [], 'second call served from the cache');
  const key = [...storage.keys()][0];
  storage.set(key, JSON.stringify({ at: Date.now() - 8 * 86400000, entries: [] }));
  await fetchFranchise(2);
  assert.equal(requests.length, 2, 'expired cache reloads');
  console.log('season mapping tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
