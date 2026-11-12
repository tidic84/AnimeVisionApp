// « Toutes les sources » : une source qui ne répond pas ne bloque pas les autres au-delà du délai.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const { federatedProvider } = loadTs('services/comics/federated.ts', {}, {
  // Délai immédiat : le test ne dure pas SOURCE_TIMEOUT.
  setTimeout: fn => { setImmediate(fn); return 0; }, clearTimeout: () => {},
});
const fast = { id: 'fast', name: 'Rapide', search: async () => ({ items: [{ id: 'a', provider: 'fast' }], total: 1 }) };
const hung = { id: 'hung', name: 'Bloquée', search: () => new Promise(() => {}) };

(async () => {
  const result = await federatedProvider([fast, hung]).search({ kind: 'all', language: 'fr', order: 'popular', offset: 0, limit: 10, query: 'x' });
  assert.deepEqual(result.items.map(item => item.id), ['a']);
  assert.match(result.warnings[0], /Bloquée/);

  // Genres par nom : chaque source reçoit ses propres identifiants ; une source sans ce genre ne renvoie rien.
  const seen = {};
  const tagged = (id, tags) => ({ id, name: id, listTags: async () => tags, search: async search => { seen[id] = search.tagIds; return { items: [{ id: `${id}-1`, provider: id }], total: 1 }; } });
  const all = federatedProvider([tagged('md', [{ id: 'uuid-romance', name: 'Romance' }]), tagged('sm', [{ id: 'Romance', name: 'Romance' }, { id: 'Action', name: 'Action' }]), tagged('ps', [{ id: 'Action', name: 'Action' }])]);
  assert.deepEqual((await all.listTags()).map(tag => tag.name), ['Action', 'Romance']);
  const romance = await all.search({ kind: 'all', language: 'fr', order: 'popular', offset: 0, limit: 9, tagIds: ['Romance'] });
  assert.deepEqual(romance.items.map(item => item.provider), ['md', 'sm']);
  assert.deepEqual([seen.md, seen.sm, seen.ps], [['uuid-romance'], ['Romance'], undefined]);
  console.log('federated timeout: ok');
})().catch(error => { console.error(error); process.exit(1); });
