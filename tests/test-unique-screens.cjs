// Navigation stack: a single video player, and no anime page opened twice.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { keepUniqueScreens } = loadTs('navigation/uniqueScreens.ts');

const home = { key: 'home', name: 'MainTabs' };
const player = (key, episodeId) => ({ key, name: 'VideoPlayer', params: { animeId: 'a', episodeId } });
const anime = (key, animeId) => ({ key, name: 'AnimeDetail', params: { animeId } });
const stack = (...routes) => ({ index: routes.length - 1, routes });
const keys = state => state.routes.map(route => route.key);

// Home -> player -> anime page -> player: the first player leaves the stack.
const before = stack(home, player('p1', 'e1'), anime('d1', 'a'));
const after = keepUniqueScreens(before, stack(home, player('p1', 'e1'), anime('d1', 'a'), player('p2', 'e2')));
assert.deepEqual(keys(after), ['home', 'd1', 'p2']);
assert.equal(after.index, 2);

// Going back to the player that stays (anime page -> back) changes nothing.
const back = stack(home, player('p1', 'e1'));
assert.equal(keepUniqueScreens(before, back), back);

// Next episode replaces the player: still one.
const next = stack(home, anime('d1', 'a'), player('p3', 'e3'));
assert.equal(keepUniqueScreens(after, next), next);

// Anime page already open lower in the stack: the old one goes.
const fromPlayer = keepUniqueScreens(stack(home, anime('d1', 'a'), player('p1', 'e1')), stack(home, anime('d1', 'a'), player('p1', 'e1'), anime('d2', 'a')));
assert.deepEqual(keys(fromPlayer), ['home', 'p1', 'd2']);
// Another anime is kept.
const other = stack(home, anime('d1', 'a'), anime('d2', 'b'));
assert.equal(keepUniqueScreens(stack(home, anime('d1', 'a')), other), other);

// Other screens and the first launch are left alone.
const comics = stack(home, { key: 'c1', name: 'ComicDetail' }, { key: 'c2', name: 'ComicDetail' });
assert.equal(keepUniqueScreens(stack(home, { key: 'c1', name: 'ComicDetail' }), comics), comics);
assert.equal(keepUniqueScreens(undefined, stack(home)).routes.length, 1);

console.log('unique screens: ok');
