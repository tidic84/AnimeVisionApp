// "Signaler un problème": request sent to the API, answers, local memory of recent reports.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const storage = new Map();
const AsyncStorage = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } };
const calls = [];
let reply = () => ({ status: 201, body: {} });
const fetch = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
  const { status, body, fail } = reply(url, init);
  if (fail) throw new TypeError('Network request failed');
  return { status, json: async () => body };
};
const service = loadTs('services/reportService.ts', {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  'expo-crypto': { randomUUID: () => '0b9d6f2e-4f1c-4a8e-9c55-2c8b1f6d7a10' },
  '@env': { API_ADDRESS: 'https://api.test/' },
}, { fetch });
const { sendReport, recentReport, canReport, reportKey, reportMessage, parseReportState, pruneLocal, ReportError, RECENT_MS, REPORT_REASONS } = service;

(async () => {
  // Only API (numeric) ids can be reported; one target per anime or episode.
  assert.equal(canReport({ animeId: '12' }), true);
  assert.equal(canReport({ animeId: '12', episodeId: '340' }), true);
  assert.equal(canReport({ animeId: 'season_4' }), false);
  assert.equal(canReport({ animeId: '12', episodeId: 'local-3' }), false);
  assert.equal(reportKey({ animeId: '12' }), '12');
  assert.equal(reportKey({ animeId: '12', episodeId: '340' }), '12:340');
  assert.deepEqual(REPORT_REASONS.map(reason => reason.value), ['no_player', 'wrong_episode', 'wrong_info', 'other']);

  // A new report: numeric ids, trimmed comment, stable install id; remembered locally.
  reply = () => ({ status: 201, body: { data: { report_id: 9, status: 'pending', created_at: '2026-11-16T10:00:00.000Z', already_reported: false } } });
  const sent = await sendReport({ animeId: '12', episodeId: '340' }, 'no_player', '  plus rien ne marche  ');
  assert.deepEqual(calls.at(-1), { url: 'https://api.test/api/report', method: 'POST', body: { anime_id: 12, episode_id: 340, reason: 'no_player', comment: 'plus rien ne marche', device_id: '0b9d6f2e-4f1c-4a8e-9c55-2c8b1f6d7a10' } });
  assert.deepEqual(sent, { status: 'pending', reportedAt: '2026-11-16T10:00:00.000Z', processedAt: null, result: null, alreadyReported: false });
  assert.equal(storage.get('report.deviceId'), '0b9d6f2e-4f1c-4a8e-9c55-2c8b1f6d7a10');
  assert.ok(JSON.parse(storage.get('report.recent'))['12:340']);

  // Anime-level report: no episode_id, no empty comment.
  await sendReport({ animeId: '12' }, 'wrong_info');
  assert.deepEqual(calls.at(-1).body, { anime_id: 12, reason: 'wrong_info', device_id: '0b9d6f2e-4f1c-4a8e-9c55-2c8b1f6d7a10' });

  // "Other" needs a comment; checked before any request.
  const before = calls.length;
  await assert.rejects(sendReport({ animeId: '12' }, 'other', '   '), error => error instanceof ReportError);
  await assert.rejects(sendReport({ animeId: 'season_1' }, 'no_player'), error => error instanceof ReportError);
  assert.equal(calls.length, before);

  // Already waiting on the server: reported as such.
  reply = () => ({ status: 200, body: { data: { report_id: 3, status: 'processing', created_at: '2026-11-16T09:00:00.000Z', already_reported: true } } });
  assert.equal((await sendReport({ animeId: '13' }, 'no_player')).alreadyReported, true);

  // API refusals become readable messages.
  for (const [status, pattern] of [[429, /Trop de signalements/], [404, /n’existe plus/], [500, /pas pu être envoyé/]]) {
    reply = () => ({ status, body: { error: true, message: 'x' } });
    await assert.rejects(sendReport({ animeId: '14' }, 'no_player'), error => error instanceof ReportError && pattern.test(error.message));
  }
  reply = () => ({ fail: true });
  await assert.rejects(sendReport({ animeId: '14' }, 'no_player'), /connexion/);

  // Status: the API answer wins (it knows other devices and the re-scrape result)…
  reply = () => ({ status: 200, body: { data: { reported: true, report_id: 9, status: 'done', created_at: '2026-11-16T10:00:00.000Z', processed_at: '2026-11-16T10:30:00.000Z', result: 'Re-scrapé : 1 saison(s), 24 épisode(s) enregistrés' } } });
  const done = await recentReport({ animeId: '12', episodeId: '340' });
  assert.equal(calls.at(-1).url, 'https://api.test/api/report/status?anime_id=12&episode_id=340&device_id=0b9d6f2e-4f1c-4a8e-9c55-2c8b1f6d7a10');
  assert.equal(done.status, 'done');
  assert.match(reportMessage(done).message, /revérifié.*re-scrapé : 1 saison/);
  reply = () => ({ status: 200, body: { data: { reported: false } } });
  assert.equal(await recentReport({ animeId: '99' }), null);
  // …offline, this device's own recent reports still show as "already reported".
  reply = () => ({ fail: true });
  assert.equal((await recentReport({ animeId: '12', episodeId: '340' })).status, 'pending');
  assert.equal(await recentReport({ animeId: '99' }), null);
  assert.equal(await recentReport({ animeId: 'season_2' }), null);

  // Local memory forgets reports after 24 h.
  const now = Date.parse('2026-11-16T12:00:00Z');
  assert.deepEqual(Object.keys(pruneLocal({ a: { reportedAt: new Date(now - RECENT_MS + 1000).toISOString() }, b: { reportedAt: new Date(now - RECENT_MS - 1000).toISOString() } }, now)), ['a']);

  // Messages for every server state.
  assert.equal(parseReportState({ reported: false }), null);
  assert.equal(parseReportState(null), null);
  for (const status of ['pending', 'processing', 'done', 'failed', 'ignored']) {
    const { title, message } = reportMessage({ status, reportedAt: '', alreadyReported: true });
    assert.ok(title && message, status);
  }
  assert.match(reportMessage({ status: 'pending', reportedAt: '', alreadyReported: true }).message, /revérifier/);
  console.log('content report: ok');
})().catch(error => { console.error(error); process.exit(1); });
