const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the real logger and run it with a recording console.
function load(dev) {
  const filename = path.resolve(__dirname, '../src/utils/logger.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const calls = [];
  const record = level => (...args) => calls.push([level, ...args]);
  const fakeConsole = { log: record('log'), info: record('info'), warn: record('warn'), error: record('error') };
  const moduleObject = { exports: {} };
  vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, require, console: fakeConsole, __DEV__: dev, Date, JSON }, { filename });
  return { ...moduleObject.exports, calls };
}

// Ring buffer keeps the most recent items, oldest first.
{
  const { RingBuffer } = load(false);
  const ring = new RingBuffer(3);
  assert.deepEqual([...ring.toArray()], []);
  [1, 2].forEach(value => ring.push(value));
  assert.deepEqual([...ring.toArray()], [1, 2]);
  [3, 4, 5].forEach(value => ring.push(value));
  assert.deepEqual([...ring.toArray()], [3, 4, 5]);
  ring.push(6); ring.push(7); ring.push(8);
  assert.deepEqual([...ring.toArray()], [6, 7, 8]);
  assert.equal(ring.size, 3);
  ring.clear();
  assert.deepEqual([...ring.toArray()], []);
  assert.throws(() => new RingBuffer(0));
}

// Production: debug/info are silent, warn/error are emitted and kept.
{
  const { logger, createLogger, getRecentErrors, clearRecentErrors, formatRecentErrors, calls } = load(false);
  logger.debug('trace'); logger.info('info');
  assert.equal(calls.length, 0);
  const scoped = createLogger('Update');
  scoped.warn('Vérification impossible:', new Error('boom'));
  logger.error('plain', { code: 42 });
  assert.deepEqual(calls.map(call => call[0]), ['warn', 'error']);
  assert.equal(calls[0][1], '[Update]');
  const entries = getRecentErrors();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, 'warn');
  assert.match(entries[0].message, /^\[Update\] Vérification impossible: Error: boom/);
  assert.equal(entries[1].message, 'plain {"code":42}');
  assert.match(formatRecentErrors(), /WARN \[Update\]/);
  for (let i = 0; i < 60; i++) logger.error(`error ${i}`);
  const kept = getRecentErrors();
  assert.equal(kept.length, 50, 'buffer is bounded');
  assert.equal(kept[0].message, 'error 10');
  assert.equal(kept[49].message, 'error 59');
  clearRecentErrors();
  assert.equal(getRecentErrors().length, 0);
  assert.equal(formatRecentErrors(), 'Aucune erreur récente.');
}

// Development: debug/info reach the console but are not kept.
{
  const { logger, getRecentErrors, calls } = load(true);
  logger.debug('trace'); logger.info('ready');
  assert.deepEqual(calls.map(call => call[0]), ['log', 'info']);
  assert.equal(getRecentErrors().length, 0);
}

// Long or circular values are bounded and never throw.
{
  const { formatArg } = load(false);
  assert.equal(formatArg('x'.repeat(2000)).length, 1001);
  const circular = {}; circular.self = circular;
  assert.equal(typeof formatArg(circular), 'string');
  assert.equal(formatArg(undefined), 'undefined');
}

console.log('logger tests passed');
