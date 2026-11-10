// Screen reader labels and touch target helpers.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { hitSlopFor, episodeState, episodeLabel } = loadTs('utils/accessibility.ts');
const { DownloadStatus } = loadTs('types/anime.ts');

// Touch target: grow a small icon button to 44 px, never shrink a large one.
assert.deepEqual(hitSlopFor(42), { top: 1, bottom: 1, left: 1, right: 1 });
assert.deepEqual(hitSlopFor(30, 44), { top: 0, bottom: 0, left: 7, right: 7 });
assert.deepEqual(hitSlopFor(20), { top: 12, bottom: 12, left: 12, right: 12 });
assert.deepEqual(hitSlopFor(56), { top: 0, bottom: 0, left: 0, right: 0 });

const episode = extra => ({ id: 'e', animeId: 'a', animeTitle: 'One Piece', number: 5, title: 'Episode 5', watchProgress: 0, isWatched: false, downloadStatus: DownloadStatus.NOT_DOWNLOADED, streamingUrls: [], ...extra });

// State: watched from the shared 90 % threshold, otherwise the progress, then the download.
assert.equal(episodeState(episode()), '');
assert.equal(episodeState(episode({ watchProgress: 42.4 })), 'en cours, 42 %');
assert.equal(episodeState(episode({ watchProgress: 90 })), 'vu');
assert.equal(episodeState(episode({ isWatched: true, watchProgress: 10 })), 'vu');
assert.equal(episodeState(episode({ watchProgress: 120 })), 'vu');
assert.equal(episodeState(episode({ downloadStatus: DownloadStatus.DOWNLOADED })), 'téléchargé');
assert.equal(episodeState(episode({ watchProgress: 30, downloadStatus: DownloadStatus.QUEUED })), 'en cours, 30 %, en attente de téléchargement');
assert.equal(episodeState(episode({ downloadStatus: DownloadStatus.FAILED })), '');
assert.equal(episodeState(episode({ watchProgress: undefined })), '');

// Label: anime, season, number, a real title only, then the state.
assert.equal(episodeLabel(episode()), 'One Piece, épisode 5');
assert.equal(episodeLabel(episode({ num_saison: '2', title: 'Le grand départ', watchProgress: 40 })), 'One Piece, saison 2, épisode 5, Le grand départ, en cours, 40 %');
assert.equal(episodeLabel(episode({ title: 'Épisode 5' })), 'One Piece, épisode 5', 'default titles are not repeated');
assert.equal(episodeLabel(episode({ num_saison: '2024' })), 'One Piece, épisode 5', 'year-like season numbers are ignored, as on screen');
assert.equal(episodeLabel(episode({ isWatched: true }), { withAnime: false }), 'épisode 5, vu');
// The screen's own progress (watch history) wins over the stored episode value.
assert.equal(episodeLabel(episode({ watchProgress: 10 }), { withAnime: false, progress: 95 }), 'épisode 5, vu');
assert.equal(episodeLabel(episode({ animeTitle: undefined })), 'épisode 5');
console.log('accessibility tests passed');
