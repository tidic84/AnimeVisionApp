const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the real debounce logic and drive it with a fake clock.
const filename = path.resolve(__dirname, '../src/utils/connectivity.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, require, setTimeout, clearTimeout }, { filename });
const { isNetworkUp, createConnectivityMonitor } = moduleObject.exports;

// Network state interpretation.
assert.equal(isNetworkUp(null), null);
assert.equal(isNetworkUp({}), null);
assert.equal(isNetworkUp({ isConnected: true }), true);
assert.equal(isNetworkUp({ isConnected: true, isInternetReachable: true }), true);
assert.equal(isNetworkUp({ isConnected: false }), false);
assert.equal(isNetworkUp({ isConnected: true, isInternetReachable: false }), false);

function setup() {
  let now = 0; let nextId = 0;
  const timers = new Map();
  const events = [];
  const monitor = createConnectivityMonitor({
    offlineDelay: 4000, onlineDelay: 1500,
    onOffline: () => events.push(['offline', now]),
    onOnline: () => events.push(['online', now]),
    setTimer: (callback, ms) => { const id = ++nextId; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: id => timers.delete(id),
  });
  const advance = ms => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].callback();
    }
    now = end;
  };
  return { monitor, advance, events, timers };
}

// A short drop never reaches the interface.
{
  const { monitor, advance, events } = setup();
  monitor.update(false); advance(3000); monitor.update(true); advance(10000);
  assert.deepEqual(events, []);
  assert.equal(monitor.state, 'online');
}

// A lasting drop is reported once, after the delay; repeated events do not restart the delay.
{
  const { monitor, advance, events } = setup();
  monitor.update(false); advance(2000); monitor.update(false); advance(2000);
  assert.deepEqual(events, [['offline', 4000]]);
  assert.equal(monitor.state, 'offline');
  monitor.update(false); advance(10000);
  assert.equal(events.length, 1);
}

// Recovery waits for a stable connection; a flap during the wait cancels it.
{
  const { monitor, advance, events } = setup();
  monitor.update(false); advance(5000);
  monitor.update(true); advance(1000); monitor.update(false); advance(1000);
  assert.deepEqual(events, [['offline', 4000]]);
  monitor.update(true); advance(1500);
  assert.deepEqual(events, [['offline', 4000], ['online', 8500]]);
  assert.equal(monitor.state, 'online');
}

// Unknown states are ignored and dispose clears pending timers.
{
  const { monitor, advance, events, timers } = setup();
  monitor.update(null); advance(10000);
  monitor.update(false); monitor.dispose(); advance(10000);
  assert.deepEqual(events, []);
  assert.equal(timers.size, 0);
}

console.log('connectivity tests passed');
