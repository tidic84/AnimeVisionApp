// Planning des scans : semaine du lundi, chapitres publiés et sorties gratuites des chapitres premium.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const planning = loadTs('services/comics/planning.ts', { './index': { getChaptersCached: async () => [] } });
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

// Mercredi 11 novembre 2026 : la semaine commence le lundi 9 à minuit.
const now = local(2026, 11, 11);
const monday = planning.weekStart(now);
assert.equal(monday, new Date(2026, 10, 9).getTime());
assert.equal(planning.weekDay(new Date(local(2026, 11, 9, 0)).toISOString(), monday), 0);
assert.equal(planning.weekDay(new Date(local(2026, 11, 15, 23)).toISOString(), monday), 6);
assert.equal(planning.weekDay(new Date(local(2026, 11, 16, 1)).toISOString(), monday), -1);
assert.equal(planning.weekDay('pas une date', monday), -1);

const comic = { id: 'c', provider: 'poseidon', title: 'Série' };
const iso = (d, h) => new Date(local(2026, 11, d, h)).toISOString();
const entries = planning.entriesFor(comic, [
  { id: 'a', number: '1', available: true, publishedAt: iso(10, 9) },
  { id: 'b', number: '2', available: false, publishedAt: iso(10, 9), availableAt: iso(13, 20) },
  { id: 'c', number: '0', available: true, publishedAt: iso(2, 9) },
  { id: 'd', number: '3', available: false },
], monday, now);
assert.deepEqual(entries.map(e => [e.chapter.id, planning.weekDay(e.at, monday), e.upcoming]), [['a', 1, false], ['b', 4, true]]);
console.log('comic planning: ok');
