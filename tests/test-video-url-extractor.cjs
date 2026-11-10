// Runs the download URL extractor against a mocked API and embed pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const silent = { debug() {}, info() {}, warn() {}, error() {} };
const pages = new Map();
const requested = [];
const fetch = async url => {
  requested.push(url);
  if (!pages.has(url)) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '', json: async () => ({}) };
  const body = pages.get(url);
  return { ok: true, status: 200, statusText: 'OK', text: async () => body, json: async () => JSON.parse(body) };
};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/VideoUrlExtractor.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const moduleExports = {};
vm.runInNewContext(source, {
  exports: moduleExports, console: silent, fetch, URL, AbortController, setTimeout, clearTimeout, atob,
  require: name => name === '@env' ? { API_ADDRESS: 'http://api' } : name === '../utils/logger' ? { logger: silent } : {},
});
const extractor = new moduleExports.VideoUrlExtractor();
const api = (id, servers) => pages.set(`http://api/api/episode/${id}`, JSON.stringify({ data: { streaming_servers: servers } }));

(async () => {
  // HD servers are tried first, and the first embed holding a .m3u8 wins.
  api('1', [
    { name: 'Serveur 1', quality: 'SD', url: 'https://vidmoly.to/embed-sd.html', langue: 'VOSTFR' },
    { name: 'Serveur 2', quality: 'HD', url: 'https://vidmoly.to/embed-hd.html', langue: 'VOSTFR' },
  ]);
  pages.set('https://vidmoly.to/embed-hd.html', '<html><script>player.setup({ sources: [{file:"https://cdn.vidmoly.to/hls/x/master.m3u8"}] })</script></html>');
  const ok = await extractor.extractHLSForEpisode('1');
  assert.equal(ok.success, true);
  assert.equal(ok.embedUrl, 'https://vidmoly.to/embed-hd.html');
  assert.equal(ok.urls[0].type, 'hls');
  assert.equal(ok.urls[0].url, 'https://cdn.vidmoly.to/hls/x/master.m3u8');

  // A page exposing only an MP4 yields an mp4 entry, which the download service refuses.
  api('2', [{ name: 'Sibnet', quality: 'HD', url: 'https://video.sibnet.ru/shell.php?videoid=1', langue: 'VF' }]);
  pages.set('https://video.sibnet.ru/shell.php?videoid=1', '<html><script>var src = "https://video.sibnet.ru/v/1.mp4";</script></html>');
  const mp4 = await extractor.extractHLSForEpisode('2');
  assert.equal(mp4.success, true);
  assert.ok(mp4.urls.every(url => url.type !== 'hls'));

  // Unknown hosts (no embed keyword) are not even fetched.
  requested.length = 0;
  api('3', [{ name: 'Autre', quality: 'HD', url: 'https://unknown.example/v/3', langue: 'VF' }]);
  const unknown = await extractor.extractHLSForEpisode('3');
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Aucun serveur de streaming compatible/);
  assert.deepEqual(requested, ['http://api/api/episode/3']);

  // API down or episode without servers.
  const missing = await extractor.extractHLSForEpisode('404');
  assert.equal(missing.success, false);
  assert.match(missing.error, /Aucune URL embed/);

  // Every embed (direct and proxied) fails: a single readable error.
  api('5', [{ name: 'Serveur 1', quality: 'HD', url: 'https://vidmoly.to/embed-dead.html', langue: 'VF' }]);
  const dead = await extractor.extractHLSForEpisode('5');
  assert.equal(dead.success, false);
  assert.match(dead.error, /Serveurs testés: 1\./);
  console.log('Video URL extractor passed: server priority, HLS extraction, MP4-only page, unknown host, missing API data, all embeds failing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
