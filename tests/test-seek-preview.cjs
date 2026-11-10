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
const { parseStoryboard, loadStoryboard, cueAt } = loadTs('services/seekPreview.ts', { 'react-native': { Image } }, { fetch });

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
  console.log('seek preview tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
