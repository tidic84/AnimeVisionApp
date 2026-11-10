// Home genre shelves: ranking by watch history and lists, default fallback, titles.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const db = { signals: [], error: null, delay: 0 };
const warnings = [];
const databaseService = {
  getTasteSignals: async () => {
    if (db.delay) await new Promise(resolve => setTimeout(resolve, db.delay));
    if (db.error) throw db.error;
    return db.signals;
  },
};
const { DEFAULT_GENRES, animeWeight, cleanGenre, rankGenres, pickGenreShelves, shelfTitle, getGenreShelves } = loadTs('services/homeShelves.ts', {
  './databaseService': { __esModule: true, default: databaseService },
  '../utils/logger': { createLogger: () => ({ debug() {}, info() {}, warn: (...args) => warnings.push(args), error() {} }) },
});

const signal = (genres, extra = {}) => ({ genres, watchedEpisodes: 0, startedEpisodes: 0, inList: false, status: null, ...extra });
const DEFAULT_SHELVES = [
  { genre: 'Action', title: 'Place à l’action' },
  { genre: 'Romance', title: 'Un peu de romance' },
  { genre: 'Aventure', title: 'L’aventure vous attend' },
];

(async () => {
  // Nothing watched, nothing listed: the original three shelves, in their order.
  assert.deepEqual(DEFAULT_GENRES, ['Action', 'Romance', 'Aventure']);
  assert.deepEqual(pickGenreShelves([]), DEFAULT_SHELVES);

  // Weight: watching beats listing, more episodes weigh more (capped), a started episode counts half.
  const listed = animeWeight(signal([], { inList: true }));
  const oneEpisode = animeWeight(signal([], { watchedEpisodes: 1 }));
  assert.equal(listed, 1);
  assert.ok(oneEpisode > listed);
  assert.ok(animeWeight(signal([], { startedEpisodes: 1 })) > listed, 'even a started episode beats a list entry');
  assert.ok(animeWeight(signal([], { startedEpisodes: 1 })) < oneEpisode);
  assert.ok(animeWeight(signal([], { watchedEpisodes: 6 })) > oneEpisode);
  assert.equal(animeWeight(signal([], { watchedEpisodes: 12 })), animeWeight(signal([], { watchedEpisodes: 500 })));
  assert.equal(animeWeight(signal([], { watchedEpisodes: 3, inList: true })), animeWeight(signal([], { watchedEpisodes: 3 })) + 1);
  assert.equal(animeWeight(signal([])), 0);
  // Imported status: completed/watching count as viewing, plan-to-watch as a list entry, dropped as nothing.
  assert.ok(animeWeight(signal([], { status: 'completed' })) > animeWeight(signal([], { status: 'watching' })));
  assert.ok(animeWeight(signal([], { status: 'watching' })) > animeWeight(signal([], { status: 'on_hold' })));
  assert.equal(animeWeight(signal([], { status: 'not_started' })), listed);
  assert.equal(animeWeight(signal([], { status: 'not_started', inList: true })), listed, 'plan-to-watch and its list entry are one signal');
  assert.equal(animeWeight(signal([], { status: 'dropped', watchedEpisodes: 8, inList: true })), 0);
  assert.equal(animeWeight(signal([], { status: 'completed', watchedEpisodes: 12 })), animeWeight(signal([], { watchedEpisodes: 12 })), 'status and history are not added up');
  assert.equal(animeWeight(signal([], { status: 'constructor' })), 0);

  // Ranking: one anime really watched outweighs several merely listed.
  assert.deepEqual(rankGenres([
    signal(['Comédie'], { inList: true }), signal(['Comédie'], { inList: true }),
    signal(['Horreur', 'Mystère'], { watchedEpisodes: 4 }),
    signal(['Mystère'], { inList: true }),
  ]), ['Mystère', 'Horreur', 'Comédie']);
  // Ties: default genres first, then alphabetical; the result does not depend on input order.
  const tied = [signal(['Sport', 'Aventure', 'Drame', 'Action'], { inList: true })];
  assert.deepEqual(rankGenres(tied), ['Action', 'Aventure', 'Drame', 'Sport']);
  assert.deepEqual(rankGenres([signal(['Drame'], { inList: true }), signal(['Comédie'], { inList: true })]), rankGenres([signal(['Comédie'], { inList: true }), signal(['Drame'], { inList: true })]));
  // A genre repeated on one anime counts once; malformed rows are skipped.
  assert.deepEqual(rankGenres([signal(['Drame', 'Drame\\n', ' Drame '], { inList: true }), signal(['Sport', 'Sport'], { inList: true }), signal(['Sport'], { inList: true })]), ['Sport', 'Drame']);
  assert.deepEqual(rankGenres([signal(null, { inList: true }), signal([null, 42, ''], { watchedEpisodes: 3 }), signal(['Drame'])]), []);

  // Genre names: sent to the API as it knows them, minus stray line breaks; fragments and unsuitable ones are dropped.
  assert.equal(cleanGenre('Tranche de vie'), 'Tranche de vie');
  assert.equal(cleanGenre('Surnaturel\\r\\n'), 'Surnaturel');
  assert.equal(cleanGenre('Romance\n'), 'Romance');
  for (const bad of ['', '  ', 'apocalyptique', 'héros', 'Post', 'Aliens / Extra', 'Ecchi', 'Érotique', 'Suicide', undefined, 7]) assert.equal(cleanGenre(bad), '', String(bad));

  // Top three, in order, each with a title.
  assert.deepEqual(pickGenreShelves([
    signal(['Comédie', 'Tranche de vie'], { watchedEpisodes: 12 }),
    signal(['Comédie', 'Isekai'], { watchedEpisodes: 2 }),
    signal(['Tranche de vie', 'Arts martiaux'], { inList: true }),
    signal(['Action'], { inList: true }),
  ]), [
    { genre: 'Comédie', title: 'De quoi rire un peu' },
    { genre: 'Tranche de vie', title: 'Le quotidien, tout en douceur' },
    { genre: 'Isekai', title: 'Bienvenue dans un autre monde' },
  ]);
  // Fewer than three: completed with the defaults, without duplicates.
  assert.deepEqual(pickGenreShelves([signal(['Seinen'], { watchedEpisodes: 3 })]).map(s => s.genre), ['Seinen', 'Action', 'Romance']);
  assert.deepEqual(pickGenreShelves([signal(['Romance', 'Seinen'], { watchedEpisodes: 3 })]).map(s => s.genre), ['Romance', 'Seinen', 'Action']);
  assert.deepEqual(pickGenreShelves([signal(['Ecchi', 'héros'], { watchedEpisodes: 9 })]), DEFAULT_SHELVES);
  assert.deepEqual(pickGenreShelves([signal(['Drame'], { status: 'dropped', watchedEpisodes: 9 })]), DEFAULT_SHELVES);

  // Titles: the historical ones are kept, any other genre gets a generic one.
  assert.equal(shelfTitle('Action'), 'Place à l’action');
  assert.equal(shelfTitle('Romance'), 'Un peu de romance');
  assert.equal(shelfTitle('Aventure'), 'L’aventure vous attend');
  assert.equal(shelfTitle('Arts martiaux'), 'Dans vos goûts : Arts martiaux');
  assert.equal(shelfTitle('Constructor'), 'Dans vos goûts : Constructor');
  const titles = pickGenreShelves([signal(['Seinen', 'Shônen', 'Yokai'], { inList: true })]).map(s => s.title);
  assert.equal(new Set(titles).size, 3, 'titles are React keys on the home screen');

  // From the database: ranked shelves, and the defaults on error or when the database is too slow.
  db.signals = [signal(['Horreur'], { watchedEpisodes: 5 })];
  assert.deepEqual((await getGenreShelves()).map(s => s.genre), ['Horreur', 'Action', 'Romance']);
  assert.equal(warnings.length, 0);
  db.error = new Error('SQLite indisponible');
  assert.deepEqual(await getGenreShelves(), DEFAULT_SHELVES);
  assert.equal(warnings.length, 1);
  db.error = null; db.delay = 200;
  assert.deepEqual(await getGenreShelves(20), DEFAULT_SHELVES);
  assert.equal(warnings.length, 2);
  db.delay = 0; db.signals = [];
  assert.deepEqual(await getGenreShelves(), DEFAULT_SHELVES);

  console.log('home shelves: all tests passed');
})().catch(error => { console.error(error); process.exit(1); });
