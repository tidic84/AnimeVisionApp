// Storyboard (WebVTT + sprite) parsing and lookup for the seek bar preview.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const responses = new Map();
let fetches = 0;
const fetch = async url => {
  fetches++;
  const response = responses.get(url);
  if (!response) throw new TypeError('Network request failed');
  return { ok: response.ok ?? true, url: response.url ?? url, text: async () => response.body };
};
const broken = new Set();
const Image = { getSizeWithHeaders: (url, headers, success, failure) => setImmediate(() => broken.has(url) ? failure() : success(320, 180)) };
const { parseStoryboard, loadStoryboard, cueAt, fitStoryboard } = loadTs('services/seekPreview.ts', { 'react-native': { Image } }, { fetch });

const vtt = [
  '﻿WEBVTT', '',
  '00:00:10.000 --> 00:00:20.000', 'sprite-1.jpg#xywh=160,0,160,90', '',
  '00:00.000 --> 00:10.000', 'sprite-1.jpg#xywh=0,0,160,90', '',
  '01:00:00.500 --> 01:00:10.000', '/abs/sprite-2.jpg', '',
  '00:00:30.000 --> 00:00:40.000', '',
].join('\r\n');
const cues = parseStoryboard(vtt, 'https://cdn.example/thumbs/storyboard.vtt?token=1');
// Sorted by start, mm:ss and hh:mm:ss.mmm timestamps, URLs resolved against the VTT, missing box = 0.
assert.deepEqual(cues, [
  { start: 0, end: 10, url: 'https://cdn.example/thumbs/sprite-1.jpg', x: 0, y: 0, w: 160, h: 90 },
  { start: 10, end: 20, url: 'https://cdn.example/thumbs/sprite-1.jpg', x: 160, y: 0, w: 160, h: 90 },
  { start: 3600.5, end: 3610, url: 'https://cdn.example/abs/sprite-2.jpg', x: 0, y: 0, w: 0, h: 0 },
]);
assert.deepEqual(parseStoryboard('WEBVTT\n\nnot a cue\n', 'https://x/'), []);

// Lookup: the cue that started last before the time; before the first one, the first one.
assert.equal(cueAt(cues, 0).start, 0);
assert.equal(cueAt(cues, 9.99).start, 0);
assert.equal(cueAt(cues, 10).start, 10);
assert.equal(cueAt(cues, 500).start, 10, 'a gap keeps the last thumbnail');
assert.equal(cueAt(cues, 99999).start, 3600.5);
assert.equal(cueAt(cues, -5).start, 0);
assert.equal(cueAt([], 12), undefined);

// Fitting the boxes to the real sprite pixels.
const grid = (url, columns, rows, w, h) => Array.from({ length: columns * rows }, (_, i) =>
  ({ start: i * 6, end: i * 6 + 6, url, x: (i % columns) * w, y: Math.floor(i / columns) * h, w, h }));
// Vidmoly (real case): the VTT describes 15x15 tiles of 162x90 (2430x1350) but serves a 5040x2820 sprite (336x188 tiles).
const vidmoly = fitStoryboard(grid('vm.jpg', 15, 15, 162, 90), { 'vm.jpg': { width: 5040, height: 2820 } });
assert.equal(vidmoly.length, 225);
assert.deepEqual(vidmoly[0], { start: 0, end: 6, url: 'vm.jpg', x: 0, y: 0, w: 336, h: 188 });
assert.deepEqual([vidmoly[16].x, vidmoly[16].y, vidmoly[16].w, vidmoly[16].h], [336, 188, 336, 188], 'second row, second column');
assert.deepEqual([vidmoly[224].x, vidmoly[224].y], [14 * 336, 14 * 188], 'last tile ends exactly on the image edge');
// Uqload / Voe (real cases): VTT and image agree, boxes are kept untouched.
const uqload = grid('uq.jpg', 5, 5, 200, 112);
assert.deepEqual(fitStoryboard(uqload, { 'uq.jpg': { width: 1000, height: 560 } }), uqload);
// A sprite measured at another density (downscaled decode) is scaled down the same way.
assert.deepEqual(fitStoryboard(uqload, { 'uq.jpg': { width: 500, height: 280 } })[6], { ...uqload[6], x: 100, y: 56, w: 100, h: 56 });
// Partially used sheet (empty trailing cells): boxes fit inside the image, kept as they are.
const partial = grid('p.jpg', 4, 2, 160, 90);
assert.deepEqual(fitStoryboard(partial, { 'p.jpg': { width: 640, height: 900 } }), partial);
// Boxes overflowing an image of a different shape: the VTT does not describe it, no preview at all.
assert.deepEqual(fitStoryboard(grid('bad.jpg', 10, 10, 160, 90), { 'bad.jpg': { width: 800, height: 1800 } }), []);
// Missing xywh: a single-frame image is shown whole, a full sheet (or a mix with boxed cues) is not.
const bare = url => ({ start: 0, end: 10, url, x: 0, y: 0, w: 0, h: 0 });
assert.deepEqual(fitStoryboard([bare('one.jpg')], { 'one.jpg': { width: 320, height: 180 } }), [{ ...bare('one.jpg'), w: 320, h: 180 }]);
assert.deepEqual(fitStoryboard([bare('sheet.jpg')], { 'sheet.jpg': { width: 1600, height: 450 } }), []);
assert.deepEqual(fitStoryboard([bare('sheet.jpg')], { 'sheet.jpg': { width: 800, height: 900 } }), []);
assert.deepEqual(fitStoryboard([bare('one.jpg'), ...grid('one.jpg', 2, 2, 160, 90)], { 'one.jpg': { width: 320, height: 180 } }).length, 4);
// Unmeasured images are dropped.
assert.deepEqual(fitStoryboard(uqload, {}), []);

(async () => {
  responses.set('https://h/board.vtt', { body: vtt, url: 'https://cdn.example/thumbs/board.vtt' });
  broken.add('https://cdn.example/abs/sprite-2.jpg');
  const board = await loadStoryboard('https://h/board.vtt');
  // Cues whose image cannot be measured are dropped; relative paths follow the final (redirected) URL.
  assert.deepEqual(board.cues.map(cue => cue.start), [0, 10]);
  assert.deepEqual(board.sizes, { 'https://cdn.example/thumbs/sprite-1.jpg': { width: 320, height: 180 } });
  const before = fetches;
  assert.equal(await loadStoryboard('https://h/board.vtt'), board);
  assert.equal(fetches, before, 'one download per link');

  responses.set('https://h/html.vtt', { body: '<html>blocked</html>' });
  assert.equal(await loadStoryboard('https://h/html.vtt'), null);
  responses.set('https://h/denied.vtt', { ok: false, body: 'WEBVTT\n\n00:00.000 --> 00:10.000\na.jpg' });
  assert.equal(await loadStoryboard('https://h/denied.vtt'), null);
  responses.set('https://h/empty.vtt', { body: 'WEBVTT\n' });
  assert.equal(await loadStoryboard('https://h/empty.vtt'), null);
  assert.equal(await loadStoryboard('https://h/offline.vtt'), null);
  // Every cue rejected as inconsistent: no storyboard rather than a broken preview.
  responses.set('https://h/sheet.vtt', { body: 'WEBVTT\n\n00:00.000 --> 00:10.000\nsheet.jpg#xywh=0,0,160,900\n' });
  assert.equal(await loadStoryboard('https://h/sheet.vtt'), null);
  console.log('seek preview tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
