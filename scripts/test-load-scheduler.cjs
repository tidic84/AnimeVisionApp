const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual TypeScript scheduler against controlled asynchronous jobs.
const filename = path.resolve(__dirname, '../src/services/loadScheduler.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports, require,
  AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, console,
}, { filename });
const { LoadScheduler } = moduleObject.exports;
assert.equal(typeof LoadScheduler, 'function', 'The production class must be exported');

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, message) {
  for (let step = 0; step < 50; step++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(message);
}
function controlled() {
  const attempts = [];
  return {
    attempts,
    run(signal) {
      return new Promise((resolve, reject) => {
        const attempt = { signal, resolve, reject };
        attempts.push(attempt);
        const onAbort = () => {
          const error = new Error('Controlled HTTP request aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}

async function concurrencyAndFIFO() {
  const scheduler = new LoadScheduler(2);
  const started = [];
  let running = 0;
  let peak = 0;
  const jobs = Array.from({ length: 5 }, () => controlled());
  const promises = jobs.map((job, index) => scheduler.schedule('home', `concurrent-${index}`, async signal => {
    started.push(index);
    running++;
    peak = Math.max(peak, running);
    try { return await job.run(signal); }
    finally { running--; }
  }));
  await until(() => started.length === 2, 'Two slots should start working');
  assert.deepEqual(started, [0, 1]);
  for (let index = 0; index < jobs.length; index++) {
    await until(() => jobs[index].attempts.length === 1, `FIFO job ${index} should start`);
    jobs[index].attempts[0].resolve(index);
    await promises[index];
  }
  assert.equal(peak, 2, 'Physical concurrent jobs must never exceed the configured limit');
  assert.deepEqual(started, [0, 1, 2, 3, 4], 'Same-priority backlog must retain FIFO order');
  assert.deepEqual(await Promise.all(promises), [0, 1, 2, 3, 4]);
}

async function backgroundFIFO() {
  const scheduler = new LoadScheduler(2);
  const started = [];
  const jobs = Array.from({ length: 4 }, () => controlled());
  const promises = jobs.map((job, index) => scheduler.schedule('background', `background-${index}`, signal => {
    started.push(index);
    return job.run(signal);
  }));
  await tick();
  assert.deepEqual(started, [0], 'One background job leaves capacity for a newly opened page');
  for (let index = 0; index < jobs.length; index++) {
    await until(() => jobs[index].attempts.length === 1, `Background job ${index} should start`);
    jobs[index].attempts[0].resolve(index);
    await promises[index];
  }
  assert.deepEqual(started, [0, 1, 2, 3]);
}

async function deduplication() {
  const scheduler = new LoadScheduler(2);
  const job = controlled();
  let duplicateRuns = 0;
  const first = scheduler.schedule('home', 'same-resource', signal => job.run(signal));
  const second = scheduler.schedule('catalog', 'same-resource', () => { duplicateRuns++; return Promise.resolve('wrong'); });
  assert.equal(second, first, 'Duplicate keys must share the original promise');
  await until(() => job.attempts.length === 1, 'Original request should run exactly once');
  job.attempts[0].resolve('shared');
  assert.deepEqual(await Promise.all([first, second]), ['shared', 'shared']);
  assert.equal(duplicateRuns, 0);
  assert.equal(job.attempts.length, 1);
}

async function foregroundPreemption() {
  const scheduler = new LoadScheduler(2);
  scheduler.setActiveGroup('home');
  const home = controlled();
  const background = controlled();
  const catalog = controlled();
  const original = scheduler.schedule('home', 'old-page', signal => home.run(signal));
  const backgroundPromise = scheduler.schedule('background', 'background-page', signal => background.run(signal));
  await until(() => home.attempts.length === 1 && background.attempts.length === 1, 'Home and background should occupy both slots');
  scheduler.setActiveGroup('catalog');
  const foreground = scheduler.schedule('catalog', 'visible-page', signal => catalog.run(signal));
  await until(() => catalog.attempts.length === 1, 'Visible page must receive the released slot');
  assert.equal(home.attempts[0].signal.aborted, true, 'Old foreground HTTP work must be aborted');
  assert.equal(background.attempts[0].signal.aborted, false, 'Background work should keep its reserved slot');
  catalog.attempts[0].resolve('visible');
  assert.equal(await foreground, 'visible');
  background.attempts[0].resolve('background');
  await backgroundPromise;
  await until(() => home.attempts.length === 2, 'Interrupted page must resume in the background');
  home.attempts[1].resolve('resumed');
  assert.equal(await original, 'resumed', 'Abort/requeue must preserve and eventually settle the original promise');
}

async function failureReleasesSlot() {
  const scheduler = new LoadScheduler(2);
  const jobs = Array.from({ length: 3 }, () => controlled());
  const promises = jobs.map((job, index) => scheduler.schedule('home', `failure-${index}`, signal => job.run(signal)));
  // Attach the rejection observer before rejecting to avoid an unhandled rejection.
  const rejected = assert.rejects(promises[0], /deliberate failure/);
  await until(() => jobs[0].attempts.length && jobs[1].attempts.length, 'First two jobs should start');
  jobs[0].attempts[0].reject(new Error('deliberate failure'));
  await rejected;
  await until(() => jobs[2].attempts.length === 1, 'A failed job must free its slot');
  jobs[1].attempts[0].resolve('second');
  jobs[2].attempts[0].resolve('third');
  assert.deepEqual(await Promise.all(promises.slice(1)), ['second', 'third']);
}

async function queuedPriority() {
  const scheduler = new LoadScheduler(2);
  const started = [];
  const jobs = Array.from({ length: 5 }, () => controlled());
  const groups = ['home', 'home', 'catalog', 'home', 'system'];
  const promises = jobs.map((job, index) => scheduler.schedule(groups[index], `priority-${index}`, signal => {
    started.push(index);
    return job.run(signal);
  }));
  await until(() => started.length === 2, 'Initial visible jobs should occupy both slots');
  jobs[0].attempts[0].resolve(0);
  await promises[0];
  await until(() => jobs[4].attempts.length === 1, 'System work must precede queued page work');
  assert.deepEqual(started, [0, 1, 4]);
  jobs[4].attempts[0].resolve(4);
  await promises[4];
  await until(() => jobs[3].attempts.length === 1, 'Visible page must precede an older hidden page request');
  assert.deepEqual(started, [0, 1, 4, 3]);
  jobs[3].attempts[0].resolve(3);
  await promises[3];
  await until(() => jobs[2].attempts.length === 1, 'Hidden page must eventually receive its background slot');
  jobs[1].attempts[0].resolve(1);
  jobs[2].attempts[0].resolve(2);
  assert.deepEqual(await Promise.all(promises), [0, 1, 2, 3, 4]);
}

(async () => {
  for (const test of [concurrencyAndFIFO, backgroundFIFO, deduplication, foregroundPreemption, failureReleasesSlot, queuedPriority]) {
    await test();
    console.log(`PASS ${test.name}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
