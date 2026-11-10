// Runs the real HLS downloader against an in-memory file system and network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const sizes = new Map();
const texts = new Map();
const remote = new Map();
const failing = new Set();
const filesystem = {
  documentDirectory: '/app/', cacheDirectory: '/cache/', EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  makeDirectoryAsync: async () => {},
  downloadAsync: async (url, to) => {
    if (failing.has(url)) return { status: 404, uri: to };
    sizes.set(to, 100); return { status: 200, uri: to };
  },
  getInfoAsync: async file => ({ exists: sizes.has(file), size: sizes.get(file) ?? 0 }),
  copyAsync: async ({ from, to }) => { sizes.set(to, sizes.get(from)); },
  writeAsStringAsync: async (file, content) => { texts.set(file, content); sizes.set(file, content.length); },
  readAsStringAsync: async file => { if (!texts.has(file)) throw Error('missing ' + file); return texts.get(file); },
  deleteAsync: async file => { for (const key of [...sizes.keys()]) if (key === file || key.startsWith(file + '/')) sizes.delete(key); },
};
const fetch = async url => remote.has(url) ? { ok: true, status: 200, text: async () => remote.get(url) } : { ok: false, status: 404, text: async () => '' };
const fastTimeout = (fn, ms) => ms >= 30000 ? 0 : setImmediate(fn);
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/hlsDownloader.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const moduleExports = {};
vm.runInNewContext(source, {
  exports: moduleExports, console: silent, fetch, setTimeout: fastTimeout,
  require: name => name === 'expo-file-system/legacy' ? filesystem : name === '../utils/logger' ? { logger: silent } : {},
});
const downloader = new moduleExports.HlsDownloader();
const media = (base, count) => ['#EXTM3U', '#EXT-X-TARGETDURATION:10', ...Array.from({ length: count }, (_, i) => [`#EXTINF:10.0,`, `${base}seg${i}.ts`]).flat(), '#EXT-X-ENDLIST'].join('\n');
const segmentsOf = playlist => texts.get(playlist).split('\n').filter(line => line && !line.startsWith('#'));

(async () => {
  // Master playlist: the highest bandwidth variant is downloaded; files land next to a local playlist.
  remote.set('https://cdn/a/master.m3u8', ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480', 'low/index.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080', 'high/index.m3u8'].join('\n'));
  remote.set('https://cdn/a/high/index.m3u8', media('', 7));
  const progress = [];
  const first = await downloader.downloadHLS({ id: 'ep-1', title: 'Episode 1' }, 'https://cdn/a/master.m3u8', value => progress.push(value));
  assert.equal(first, '/app/downloads/Episode_1_ep_1.ts');
  const firstPlaylist = '/app/downloads/Episode_1_ep_1.m3u8';
  assert.deepEqual(segmentsOf(firstPlaylist), Array.from({ length: 7 }, (_, i) => `Episode_1_ep_1_${i}.ts`));
  for (const name of segmentsOf(firstPlaylist)) assert.ok(sizes.has('/app/downloads/' + name), name);
  assert.ok(texts.get(firstPlaylist).trim().endsWith('#EXT-X-ENDLIST'));
  assert.ok(![...sizes.keys()].some(file => file.startsWith('/app/temp_')), 'temporary folder removed');
  assert.equal(progress.at(-1).status, 'completed');
  assert.equal(progress.at(-1).completedSegments, 7); assert.equal(progress.at(-1).totalSegments, 7);
  assert.ok(progress.slice(0, -1).every(value => value.status === 'downloading'));

  // Same title in another anime (titles default to "Episode N"): nothing is shared or overwritten.
  remote.set('https://cdn/b/index.m3u8', media('https://cdn/b/', 3));
  const second = await downloader.downloadHLS({ id: 'ep-2', title: 'Episode 1' }, 'https://cdn/b/index.m3u8', () => {});
  assert.notEqual(second, first);
  const overlap = segmentsOf('/app/downloads/Episode_1_ep_2.m3u8').filter(name => segmentsOf(firstPlaylist).includes(name));
  assert.deepEqual(overlap, []);
  assert.equal(segmentsOf(firstPlaylist).length, 7);

  // Up to 15 % of segments may be missing; beyond that the download fails.
  remote.set('https://cdn/c/index.m3u8', media('https://cdn/c/', 10));
  failing.add('https://cdn/c/seg0.ts'); failing.add('https://cdn/c/seg1.ts');
  await assert.rejects(downloader.downloadHLS({ id: 'c', title: 'C' }, 'https://cdn/c/index.m3u8', () => {}), /trop incomplet: 8\/10/);

  // Size is estimated from the segment count before anything is downloaded.
  remote.set('https://cdn/d/index.m3u8', media('https://cdn/d/', 200));
  await assert.rejects(downloader.downloadHLS({ id: 'd', title: 'D' }, 'https://cdn/d/index.m3u8', () => {}), /trop volumineux/);

  // An unreachable playlist is an error.
  await assert.rejects(downloader.downloadHLS({ id: 'e', title: 'E' }, 'https://cdn/missing.m3u8', () => {}), /HTTP 404/);
  console.log('HLS downloader passed: best variant, local playlist and segments, cleanup, progress, unique names per episode, missing segments, size limit, unreachable playlist.');
})().catch(error => { console.error(error); process.exitCode = 1; });
