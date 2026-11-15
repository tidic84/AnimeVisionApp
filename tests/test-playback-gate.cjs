// Playback gate: a stream that finishes loading while the player is not on screen must not start playing.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { createPlaybackGate, playerVisible } = loadTs('utils/playbackGate.ts');

// Visible player: starts right away, nothing kept for later.
let visible = true;
const gate = createPlaybackGate(() => visible);
assert.equal(gate.request(), true);
assert.equal(gate.resume(), false);

// Load finishes after the user went to the anime page: no playback, kept for the return.
visible = false;
assert.equal(gate.request(), false);
assert.equal(gate.resume(), false);
visible = true;
assert.equal(gate.resume(), true);
// Only once.
assert.equal(gate.resume(), false);

// Source changed meanwhile: the kept start is dropped.
visible = false;
gate.request();
gate.cancel();
visible = true;
assert.equal(gate.resume(), false);

// A later visible request clears an older kept start.
visible = false;
gate.request();
visible = true;
assert.equal(gate.request(), true);
assert.equal(gate.resume(), false);

// Navigation inside the app always hides the player; leaving the app only does without background playback.
assert.equal(playerVisible(true, true, false), true);
assert.equal(playerVisible(false, true, true), false);
assert.equal(playerVisible(true, false, false), false);
assert.equal(playerVisible(true, false, true), true);

console.log('playback gate: ok');
