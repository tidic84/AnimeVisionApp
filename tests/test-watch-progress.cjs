// "Watched" threshold, language label, resume progress and relative time.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { WATCHED_PROGRESS, isFinished, episodeLanguage, effectiveProgress } = loadTs('utils/watchProgress.ts');
const { elapsedSince } = loadTs('utils/relativeTime.ts');

// One threshold for the badge, the next episode and MAL: 90 %.
assert.equal(WATCHED_PROGRESS, 90);
assert.equal(isFinished(89.99), false);
assert.equal(isFinished(90), true);
assert.equal(isFinished(100), true);
assert.equal(isFinished(undefined), false);
assert.equal(isFinished(0), false);

// Episode language: its own field first, otherwise every server language once.
const servers = langues => langues.map((langue, index) => ({ name: `S${index}`, url: 'https://x', quality: 'HD', langue }));
assert.equal(episodeLanguage({ langue: 'vostfr', streaming_servers: servers(['VF']) }), 'VOSTFR');
assert.equal(episodeLanguage({ streaming_servers: servers(['vf', 'VF', 'vostfr', undefined]) }), 'VF / VOSTFR');
assert.equal(episodeLanguage({ langue: '', streaming_servers: [] }), '');
assert.equal(episodeLanguage({}), '');

// Resume position: a rewatch overrides the first viewing, even when it restarts at 0.
assert.equal(effectiveProgress({ progress: 100 }), 100);
assert.equal(effectiveProgress({ progress: 100, rewatchProgress: 35 }), 35);
assert.equal(effectiveProgress({ progress: 100, rewatchProgress: 0 }), 0);
assert.equal(isFinished(effectiveProgress({ progress: 95, rewatchProgress: 10 })), false, 'a rewatch in progress is resumed, not skipped');

// Relative time, in French.
const now = Date.parse('2026-11-10T12:00:00Z');
const ago = minutes => new Date(now - minutes * 60000).toISOString();
assert.equal(elapsedSince(ago(0), now), 'moins d’une minute');
assert.equal(elapsedSince(ago(0.9), now), 'moins d’une minute');
assert.equal(elapsedSince(ago(1), now), '1 min');
assert.equal(elapsedSince(ago(59), now), '59 min');
assert.equal(elapsedSince(ago(60), now), '1 h');
assert.equal(elapsedSince(ago(23 * 60 + 59), now), '23 h');
assert.equal(elapsedSince(ago(24 * 60), now), '1 jour');
assert.equal(elapsedSince(new Date(now - 3 * 86400000), now), '3 jours');
assert.equal(elapsedSince(ago(-30), now), 'moins d’une minute', 'a clock ahead of the server never shows a negative time');
console.log('watch progress and relative time tests passed');
