// Player gestures: which side controls what, edge exclusion, tap/swipe detection and level computation.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { swipeSide, isTap, isVerticalSwipe, levelAfterDrag, SLOP } = loadTs('utils/playerGestures.ts');
const edges = { top: 40, bottom: 56, side: 24 };

// Left half = brightness, right half = volume.
assert.equal(swipeSide(200, 300, 800, 400, edges), 'brightness');
assert.equal(swipeSide(600, 300, 800, 400, edges), 'volume');
// Edges are left to the system (status bar, gesture bar, back swipe).
assert.equal(swipeSide(200, 20, 800, 400, edges), null);
assert.equal(swipeSide(200, 360, 800, 400, edges), null);
assert.equal(swipeSide(10, 200, 800, 400, edges), null);
assert.equal(swipeSide(790, 200, 800, 400, edges), null);
// Unknown layout: no swipe.
assert.equal(swipeSide(10, 10, 0, 0, edges), null);

// Tap vs swipe.
assert.equal(isTap(3, -4), true);
assert.equal(isTap(0, SLOP), false);
assert.equal(isVerticalSwipe(2, -20), true);
assert.equal(isVerticalSwipe(2, 20), true);
assert.equal(isVerticalSwipe(20, 22), false);
assert.equal(isVerticalSwipe(0, 5), false);

// Up increases, down decreases, clamped to [0, 1]; the detection slop does not count.
assert.equal(levelAfterDrag(0.5, -SLOP, 400), 0.5);
assert.equal(levelAfterDrag(0.5, SLOP, 400), 0.5);
assert.ok(Math.abs(levelAfterDrag(0.5, -(SLOP + 160), 400) - 1) < 1e-9);
assert.ok(Math.abs(levelAfterDrag(0.5, SLOP + 80, 400) - 0.25) < 1e-9);
assert.equal(levelAfterDrag(0.9, -1000, 400), 1);
assert.equal(levelAfterDrag(0.1, 1000, 400), 0);
assert.equal(levelAfterDrag(1.4, 0, 400), 1);

console.log('player gestures: ok');
