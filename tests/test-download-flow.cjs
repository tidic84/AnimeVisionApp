// Drives the real download service through its public API with a mocked
// extractor, HLS downloader and file system to lock the observable flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

const platform = { OS: 'android' };
const files = new Set();
let stored = null;
const contents = new Map();
const deleted = [];
const filesystem = {
  EncodingType: { UTF8: 'utf8' }, documentDirectory: '/app/',
  getInfoAsync: async file => ({ exists: files.has(file), size: files.has(file) ? 1000 : 0 }),
  deleteAsync: async file => { deleted.push(file); files.delete(file); },
  writeAsStringAsync: async () => {},
  readAsStringAsync: async file => {
    if (file === '/app/downloads.json' && stored !== null) return stored;
    if (contents.has(file) && files.has(file)) return contents.get(file);
    throw Error('none');
  },
  getFreeDiskStorageAsync: async () => 1e9,
};
const silent = { debug() {}, info() {}, warn() {}, error() {} };
function compile(file, mock) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require: mock, console: silent, Buffer, setTimeout });
  return exports;
}
const types = compile('types/anime.ts', require);
const { DownloadService } = compile('services/downloadService.ts', name => name === 'react-native' ? { Platform: platform } : name === 'expo-file-system/legacy' ? filesystem : name === '../types/anime' ? types : name === 'buffer' ? { Buffer } : name === '../utils/logger' ? { logger: silent } : {});
const S = types.DownloadStatus, Q = types.VideoQuality;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, message) { for (let step = 0; step < 200; step++) { if (predicate()) return; await tick(); } assert.fail(message); }
const episode = (id, title = `Episode ${id}`) => ({ id, title, animeId: 'a', number: Number(id) || 1, streamingUrls: [] });

function harness(extractions) {
  const hlsCalls = [];
  const gates = [];
  const hls = { downloadHLS: (ep, url, onProgress) => new Promise((resolve, reject) => { hlsCalls.push({ ep, url }); gates.push({ resolve, reject, onProgress, ep }); }) };
  const extractor = { extractHLSForEpisode: async id => extractions[id] ?? { success: false, urls: [], error: 'introuvable' } };
  const service = new DownloadService(hls, extractor);
  const dbUpdates = [];
  service.updateEpisodeDownloadStatus = async (...args) => { dbUpdates.push(args); };
  return { service, hls, hlsCalls, gates, dbUpdates };
}
const hlsResult = url => ({ success: true, urls: [{ url, type: 'hls', extractedAt: 0, source: 'client' }] });

(async () => {
  // Web never downloads.
  platform.OS = 'web';
  await assert.rejects(harness({}).service.startDownload(episode('1')), /application mobile/);
  platform.OS = 'android';

  // HLS is preferred even when a direct MP4 comes first; ids are download_<episode>_<quality>.
  {
    const { service, hlsCalls, gates, dbUpdates } = harness({ 7: { success: true, urls: [{ url: 'https://h/v.mp4', type: 'mp4' }, { url: 'https://h/master.m3u8', type: 'hls' }] } });
    const seen = [], heard = [];
    // Screens subscribe to every download, not only the ones they started.
    const unsubscribe = service.subscribe(progress => heard.push(progress));
    await service.startDownload(episode('7'), Q.MEDIUM, progress => seen.push(progress));
    assert.deepEqual([...service.downloads.keys()], ['download_7_720p']);
    assert.equal(seen[0].status, 'queued'); assert.equal(seen[0].progress, 0);
    await until(() => hlsCalls.length === 1, 'HLS download should start');
    // Leaving the queue is reported before the total size is known.
    assert.equal(seen.at(-1).status, 'downloading'); assert.equal(seen.at(-1).totalSegments, undefined);
    assert.equal(hlsCalls[0].url, 'https://h/master.m3u8'); assert.equal(hlsCalls[0].ep.id, '7');
    assert.equal(service.downloads.get('download_7_720p').status, S.DOWNLOADING);
    gates[0].onProgress({ downloadId: 'x', totalSegments: 4, completedSegments: 1, totalBytes: 10, status: 'downloading' });
    await tick();
    assert.equal(seen.at(-1).progress, 25); assert.equal(seen.at(-1).totalSegments, 4); assert.equal(seen.at(-1).downloadId, 'download_7_720p');
    // The HLS engine writes the playlist next to the returned .ts path, never the .ts itself.
    files.add('/app/downloads/Episode_7.m3u8');
    gates[0].resolve('/app/downloads/Episode_7.ts');
    await until(() => service.downloads.get('download_7_720p').status === S.DOWNLOADED, 'download should finish');
    await until(() => dbUpdates.some(update => update[2] === '/app/downloads/Episode_7.ts'), 'database should get the file path');
    const done = service.downloads.get('download_7_720p');
    assert.equal(done.filePath, '/app/downloads/Episode_7.ts'); assert.equal(done.progress.progress, 100); assert.equal(done.progress.status, 'completed');
    assert.equal(typeof done.downloadedAt?.getTime, 'function');
    assert.equal(seen.at(-1).status, 'completed');
    assert.deepEqual(heard.map(progress => progress.status), seen.map(progress => progress.status));
    unsubscribe(); const heardCount = heard.length;
    assert.deepEqual(dbUpdates.at(-1), ['7', S.DOWNLOADED, '/app/downloads/Episode_7.ts']);
    assert.ok(!service.downloadCallbacks.has('download_7_720p'), 'callback is released once finished');
    // Starting the same episode/quality again is a no-op.
    await service.startDownload(episode('7'), Q.MEDIUM);
    await tick(); assert.equal(hlsCalls.length, 1);
    assert.equal(heard.length, heardCount, 'an unsubscribed listener hears nothing');
    // Starting another episode keeps the finished HLS download (its playlist exists)...
    await service.startDownload(episode('70'), Q.MEDIUM);
    assert.equal(service.downloads.get('download_7_720p')?.status, S.DOWNLOADED);
    // ...but forgets it once the playlist is gone from the disk.
    files.delete('/app/downloads/Episode_7.m3u8');
    await service.startDownload(episode('71'), Q.MEDIUM);
    assert.ok(!service.downloads.has('download_7_720p'));
    assert.deepEqual(dbUpdates.at(-1), ['7', S.NOT_DOWNLOADED]);
  }

  // Only a direct MP4: the download fails without calling the HLS downloader.
  {
    const { service, hlsCalls, dbUpdates } = harness({ 8: { success: true, urls: [{ url: 'https://h/v.mp4', type: 'mp4' }] } });
    await service.startDownload(episode('8'), Q.HIGH);
    await until(() => service.downloads.get('download_8_1080p').status === S.FAILED, 'MP4-only must fail');
    assert.equal(hlsCalls.length, 0);
    await until(() => dbUpdates.some(update => update[1] === S.FAILED), 'database should get the failure');
    assert.deepEqual(dbUpdates.at(-1), ['8', S.FAILED]);
  }

  // Extraction failure marks the item failed; a failed item can be started again.
  {
    const extractions = { 9: { success: false, urls: [], error: 'hors ligne' } };
    const { service, hlsCalls, gates } = harness(extractions);
    const seen = [];
    await service.startDownload(episode('9'), Q.HIGH, progress => seen.push(progress.status));
    await until(() => service.downloads.get('download_9_1080p').status === S.FAILED, 'extraction failure must fail');
    await until(() => seen.at(-1) === 'error', 'the caller is told about the failure');
    extractions[9] = hlsResult('https://h/9.m3u8');
    await service.startDownload(episode('9'));
    await until(() => hlsCalls.length === 1, 'retry should reach the HLS downloader');
    gates[0].reject(Error('segments'));
    await until(() => service.downloads.get('download_9_1080p').status === S.FAILED, 'HLS failure must fail');
    assert.equal(service.downloads.get('download_9_1080p').progress.status, 'error');
  }

  // One transfer at a time: the second episode waits in the queue, then runs.
  {
    const { service, hlsCalls, gates } = harness({ 1: hlsResult('https://h/1.m3u8'), 2: hlsResult('https://h/2.m3u8') });
    await service.startDownload(episode('1'));
    await service.startDownload(episode('2'));
    await until(() => hlsCalls.length === 1, 'first download should start');
    await tick(); await tick();
    assert.equal(hlsCalls.length, 1);
    assert.equal(service.downloads.get('download_2_1080p').status, S.QUEUED);
    await assert.rejects(service.cancelDownload('1', Q.HIGH), /actif/);
    files.add('/app/downloads/Episode_1.m3u8');
    gates[0].resolve('/app/downloads/Episode_1.ts');
    await until(() => hlsCalls.length === 2, 'queued download should start after the first');
    assert.equal(hlsCalls[1].url, 'https://h/2.m3u8');
  }
  // After an app restart, transfers left queued or in progress are failed, so they can be retried or deleted.
  {
    const saved = (id, status, filePath) => ({ episode: episode(id), quality: Q.HIGH, url: '', status, filePath, progress: { downloadId: `download_${id}_1080p`, episodeId: id, progress: 40, downloadedBytes: 0, totalBytes: 0, speed: 0, timeRemaining: 0, status: 'downloading' } });
    stored = JSON.stringify({ download_20_1080p: saved('20', S.DOWNLOADING), download_21_1080p: saved('21', S.QUEUED), download_22_1080p: saved('22', S.DOWNLOADED, '/app/downloads/Episode_22.ts') });
    files.add('/app/downloads/Episode_22.m3u8');
    const { service, hlsCalls } = harness({ 21: hlsResult('https://h/21.m3u8') });
    const byId = Object.fromEntries((await service.getAllDownloads()).map(item => [item.episode.id, item]));
    assert.equal(byId['20'].status, S.FAILED); assert.equal(byId['20'].progress.status, 'error');
    assert.equal(byId['21'].status, S.FAILED); assert.equal(byId['22'].status, S.DOWNLOADED);
    await service.deleteDownload('20', Q.HIGH);
    assert.ok(!service.downloads.has('download_20_1080p'));
    await service.startDownload(episode('21'));
    await until(() => hlsCalls.length === 1, 'an interrupted download can be started again');
    stored = null;
  }
  // Size and deletion follow the playlist: its segments are counted and removed, shared files are kept.
  {
    const playlist = names => ['#EXTM3U', ...names.flatMap(name => ['#EXTINF:10.0,', name]), '#EXT-X-ENDLIST'].join('\n');
    const { service, gates } = harness({ 30: hlsResult('https://h/30.m3u8') });
    await service.startDownload(episode('30'));
    await until(() => gates.length === 1, 'download 30 should start');
    for (const name of ['Episode_30.m3u8', 'a_0.ts', 'a_1.ts', 'segment_0_0.ts']) files.add('/app/downloads/' + name);
    contents.set('/app/downloads/Episode_30.m3u8', playlist(['a_0.ts', 'a_1.ts', 'segment_0_0.ts']));
    gates[0].resolve('/app/downloads/Episode_30.ts');
    await until(() => service.downloads.get('download_30_1080p').status === S.DOWNLOADED, 'download 30 should finish');
    assert.equal(service.downloads.get('download_30_1080p').fileSize, 4000, 'playlist plus its three segments');
    // An older download whose playlist cites the same legacy segment name.
    files.add('/app/downloads/Episode_31.m3u8');
    contents.set('/app/downloads/Episode_31.m3u8', playlist(['segment_0_0.ts']));
    service.downloads.set('download_31_1080p', { episode: episode('31'), quality: Q.HIGH, url: '', status: S.DOWNLOADED, filePath: '/app/downloads/Episode_31.ts', progress: {} });
    deleted.length = 0;
    await service.deleteDownload('30', Q.HIGH);
    assert.deepEqual(deleted, ['/app/downloads/Episode_30.ts', '/app/downloads/Episode_30.m3u8', '/app/downloads/a_0.ts', '/app/downloads/a_1.ts']);
    assert.ok(files.has('/app/downloads/segment_0_0.ts'));
    assert.equal(await service.sizeOnDisk('/app/downloads/Episode_31.ts'), 2000);
  }
  console.log('Download flow passed: web guard, HLS over MP4, ids, progress mapping, completion, orphan cleanup, duplicate start, MP4-only and extraction failures, retry, single-transfer queue, restart recovery, size on disk, playlist deletion with shared files.');
})().catch(error => { console.error(error); process.exitCode = 1; });
