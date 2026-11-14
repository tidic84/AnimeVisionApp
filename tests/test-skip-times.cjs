// Choice and realignment of AniSkip intervals for the video actually played.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { pickSkips } = loadTs('utils/skipTimes.ts');
const pick = pickSkips;
const skip = (type, start, end, episode_length) => ({ type, start, end, episode_length });

// Unknown duration (video not loaded yet): nothing.
assert.deepEqual(pick([skip('op', 90, 180, 1420)], 0), []);
assert.deepEqual(pick([skip('op', 90, 180, 1420)], NaN), []);

// Same cut: intervals as measured; AniSkip types mapped, unknown ones ignored.
assert.deepEqual(pick([skip('op', 90, 180, 1420), skip('ed', 1300, 1390, 1420), skip('recap', 0, 40, 1420), skip('preview', 1390, 1420, 1420)], 1420), [
  { kind: 'intro', start: 90, end: 180 }, { kind: 'outro', start: 1300, end: 1390 }, { kind: 'recap', start: 0, end: 40 },
]);
assert.deepEqual(pick([skip('mixed-op', 0, 85, 1420), skip('mixed-ed', 1330, 1420, 1420)], 1420), [
  { kind: 'intro', start: 0, end: 85 }, { kind: 'outro', start: 1330, end: 1420 },
]);

// Several measures of one type: the one whose episode length is closest to the video wins.
assert.deepEqual(pick([skip('op', 100, 190, 1500), skip('op', 92, 182, 1425), skip('op', 80, 170, 1300)], 1420), [{ kind: 'intro', start: 92, end: 182 }]);

// A measure without episode length is usable, but loses to any measured one.
assert.deepEqual(pick([skip('op', 60, 150, 0)], 1420), [{ kind: 'intro', start: 60, end: 150 }]);
assert.deepEqual(pick([skip('op', 60, 150, 0), skip('op', 95, 185, 1440)], 1420), [{ kind: 'intro', start: 95, end: 185 }]);

// Another cut (double episode, long version: > 25 % apart) or a too short interval: ignored.
assert.deepEqual(pick([skip('op', 90, 180, 2840)], 1420), []);
assert.deepEqual(pick([skip('op', 90, 94, 1420)], 1420), []);

// Host with a shorter file (credits cut, logo added): an ending that ran to the end is moved to the end.
assert.deepEqual(pick([skip('ed', 1370, 1458, 1460)], 1400), [{ kind: 'outro', start: 1310, end: 1400 }]);
// Small gap (under 3 % and 5 s): left as is, only clamped to the video.
assert.deepEqual(pick([skip('ed', 1335, 1423, 1424)], 1420), [{ kind: 'outro', start: 1335, end: 1420 }]);
// An ending that stops before the end (preview after it) is not moved.
assert.deepEqual(pick([skip('ed', 1250, 1340, 1460)], 1400), [{ kind: 'outro', start: 1250, end: 1340 }]);
// The opening stays anchored on the start whatever the gap.
assert.deepEqual(pick([skip('op', 30, 120, 1460)], 1400), [{ kind: 'intro', start: 30, end: 120 }]);

// Hand-entered ending stopping short of the end (Tanaka-kun: 1330-1410 for a credits ending at 1423 in a
// 1426 s video): the last 20 s are only credits and the end card, the skip goes to the end.
assert.deepEqual(pick([skip('ed', 1330, 1410, 1426)], 1426), [{ kind: 'outro', start: 1330, end: 1426 }]);
// More than 20 s left after the ending (preview, post-credits scene): kept.
assert.deepEqual(pick([skip('ed', 1300, 1395, 1426)], 1426), [{ kind: 'outro', start: 1300, end: 1395 }]);

// Nonsense positions: an opening in the second half, an ending in the first half.
assert.deepEqual(pick([skip('op', 800, 890, 1420), skip('ed', 100, 190, 1420)], 1420), []);
// End beyond the video and nothing left once clamped.
assert.deepEqual(pick([skip('ed', 1418, 1430, 1420)], 1420), []);
console.log('skip times tests passed');
