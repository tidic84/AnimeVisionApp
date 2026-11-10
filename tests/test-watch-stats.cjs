// Personal statistics: time estimate, weekly buckets, genre ranking and duration formatting.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { episodeSeconds, estimatedSeconds, weekStart, episodesPerWeek, topGenres, computeWatchStats, formatDuration, plural, weekTick, weekName, DEFAULT_EPISODE_SECONDS } = loadTs('utils/watchStats.ts');
const { weeklyChartLabel } = loadTs('utils/accessibility.ts');

// Local dates throughout, so the suite does not depend on the machine's time zone.
const now = new Date(2026, 10, 10, 15, 30); // Tuesday 10 November 2026
let counter = 0;
const row = (extra = {}) => ({ animeId: 'a', episodeId: `e${counter++}`, progress: 100, lastWatchedAt: now, genres: [], ...extra });

// Duration: the episode's own, else the anime average (minutes), else an assumed default.
assert.deepEqual(episodeSeconds({ episodeDuration: 1500, animeDuration: 24 }), { seconds: 1500, assumed: false });
assert.deepEqual(episodeSeconds({ episodeDuration: 0, animeDuration: 23 }), { seconds: 1380, assumed: false });
assert.deepEqual(episodeSeconds({ episodeDuration: null, animeDuration: null }), { seconds: DEFAULT_EPISODE_SECONDS, assumed: true });
assert.deepEqual(episodeSeconds({ episodeDuration: -5, animeDuration: NaN }), { seconds: DEFAULT_EPISODE_SECONDS, assumed: true });

// Estimate: progress share of the duration, plus the rewatch in progress; out-of-range values are clamped.
assert.equal(estimatedSeconds(row({ episodeDuration: 1200, progress: 50 })), 600);
assert.equal(estimatedSeconds(row({ episodeDuration: 1200, progress: 100, rewatchProgress: 25 })), 1500);
assert.equal(estimatedSeconds(row({ episodeDuration: 1200, progress: 140, rewatchProgress: -3 })), 1200);
assert.equal(estimatedSeconds(row({ progress: 100 })), DEFAULT_EPISODE_SECONDS);

// Weeks start on Monday 00:00 local time.
assert.equal(weekStart(now).getTime(), new Date(2026, 10, 9).getTime());
assert.equal(weekStart(new Date(2026, 10, 9, 0, 0)).getTime(), new Date(2026, 10, 9).getTime(), 'Monday midnight belongs to its own week');
assert.equal(weekStart(new Date(2026, 10, 8, 23, 59)).getTime(), new Date(2026, 10, 2).getTime(), 'Sunday closes the week');
assert.equal(weekStart(new Date(2027, 0, 1)).getTime(), new Date(2026, 11, 28).getTime(), 'weeks cross the year');

// Weekly buckets: oldest first, current week last, only finished episodes inside the window.
const weekly = [
  row({ lastWatchedAt: new Date(2026, 10, 9, 0, 0) }),
  row({ lastWatchedAt: new Date(2026, 10, 10, 8) }),
  row({ lastWatchedAt: new Date(2026, 10, 10, 9), progress: 89 }), // not finished
  row({ lastWatchedAt: new Date(2026, 10, 8, 23, 59) }), // previous week
  row({ lastWatchedAt: new Date(2026, 8, 21, 12) }), // first week of the window
  row({ lastWatchedAt: new Date(2026, 8, 20, 23) }), // just before the window
  row({ lastWatchedAt: new Date('invalid') }),
];
const weeks = episodesPerWeek(weekly, now);
assert.equal(weeks.length, 8);
assert.deepEqual(weeks.map(week => week.count), [1, 0, 0, 0, 0, 0, 1, 2]);
assert.equal(weeks[0].start.getTime(), new Date(2026, 8, 21).getTime());
assert.equal(weeks[7].start.getTime(), new Date(2026, 10, 9).getTime());
// Every bucket starts on a Monday at midnight, including across the October clock change.
for (const week of weeks) { assert.equal(week.start.getDay(), 1); assert.equal(week.start.getHours(), 0); }
assert.deepEqual(episodesPerWeek([], now, 3).map(week => week.count), [0, 0, 0]);

// Genres: ranked by finished episodes, then by anime count, then alphabetically; case and duplicates merged.
const genreRows = [
  row({ animeId: 'a', genres: ['Action', 'Aventure'] }),
  row({ animeId: 'a', genres: ['Action', 'Aventure'] }),
  row({ animeId: 'b', genres: ['action', ' Action ', 'Drame'] }),
  row({ animeId: 'c', genres: ['Comédie', 'Aventure'] }),
  row({ animeId: 'd', genres: ['Sport'], progress: 40 }), // unfinished episodes do not count
  row({ animeId: 'e', genres: ['', null] }),
];
assert.deepEqual(topGenres(genreRows), [
  { genre: 'Action', episodes: 3, animes: 2 },
  { genre: 'Aventure', episodes: 3, animes: 2 },
  { genre: 'Comédie', episodes: 1, animes: 1 },
  { genre: 'Drame', episodes: 1, animes: 1 },
]);
assert.deepEqual(topGenres([row({ animeId: 'a', genres: ['Drame'] }), row({ animeId: 'b', genres: ['Drame'] }), row({ animeId: 'c', genres: ['Action'] }), row({ animeId: 'c', genres: ['Action'] })]).map(entry => entry.genre), ['Drame', 'Action'], 'more animes wins a tie on episodes');
assert.equal(topGenres(genreRows, 2).length, 2);
assert.deepEqual(topGenres([]), []);

// Summary.
const empty = computeWatchStats([], now);
assert.deepEqual({ ...empty, weeks: empty.weeks.map(week => week.count) }, { episodesWatched: 0, episodesInProgress: 0, animesWatched: 0, estimatedSeconds: 0, assumedDurations: 0, weeks: [0, 0, 0, 0, 0, 0, 0, 0], genres: [], animesWithGenres: 0 });

const stats = computeWatchStats([
  row({ animeId: 'a', episodeDuration: 1440, genres: ['Action'] }), // 24 min
  row({ animeId: 'a', episodeDuration: 1440, progress: 90, genres: ['Action'] }), // 21 min 36, counts as watched
  row({ animeId: 'b', animeDuration: 20, progress: 50, genres: ['Drame'] }), // 10 min, in progress
  row({ animeId: 'c', progress: 100, rewatchProgress: 50 }), // unknown duration: 24 + 12 min
  row({ animeId: 'd', progress: 0 }), // opened only: ignored
], now);
assert.equal(stats.episodesWatched, 3);
assert.equal(stats.episodesInProgress, 1);
assert.equal(stats.animesWatched, 2, 'an anime counts once an episode is finished');
assert.equal(stats.estimatedSeconds, 1440 + 1296 + 600 + 2160);
assert.equal(stats.assumedDurations, 1, 'rows without progress are not reported as assumed');
assert.equal(stats.animesWithGenres, 1);
assert.deepEqual(stats.genres, [{ genre: 'Action', episodes: 2, animes: 1 }]);
assert.equal(stats.weeks[7].count, 3);

// Durations.
assert.equal(formatDuration(0), '0 min');
assert.equal(formatDuration(20), 'moins d’une minute');
assert.equal(formatDuration(45 * 60), '45 min');
assert.equal(formatDuration(59 * 60 + 40), '1 h', 'rounding to the minute can reach the next hour');
assert.equal(formatDuration(3 * 3600), '3 h');
assert.equal(formatDuration(12 * 3600 + 5 * 60), '12 h 05 min');
assert.equal(formatDuration(130 * 3600 + 30 * 60), '130 h 30 min');
assert.equal(formatDuration(-10), '0 min');
assert.equal(formatDuration(NaN), '0 min');

assert.equal(plural(0, 'épisode'), '0 épisode');
assert.equal(plural(1, 'épisode'), '1 épisode');
assert.equal(plural(2, 'épisode'), '2 épisodes');
assert.equal(plural(2, 'épisode vu', 'épisodes vus'), '2 épisodes vus');

// Week names, on the bars and for screen readers.
assert.equal(weekTick(new Date(2026, 10, 9)), '9/11');
assert.equal(weekName(new Date(2026, 10, 9)), 'semaine du 9 novembre');
assert.equal(weekName(new Date(2026, 5, 1)), 'semaine du 1er juin');
assert.equal(weeklyChartLabel(episodesPerWeek(weekly, now, 2), weekName), 'Épisodes vus par semaine, 3 sur 2 semaines. semaine du 2 novembre : 1 épisode, semaine du 9 novembre : 2 épisodes');
assert.equal(weeklyChartLabel(episodesPerWeek([], now), weekName), 'Aucun épisode vu sur les 8 dernières semaines');
console.log('watch stats tests passed');
