const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the throttle used for the update download notification.
const filename = path.resolve(__dirname, '../src/utils/progressThrottle.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, require }, { filename });
const { createProgressThrottle } = moduleObject.exports;

// First value always goes through, then only steps of at least 2 points, and 100 % always.
let throttle = createProgressThrottle(2);
assert.equal(throttle(0), 0);
assert.equal(throttle(0.005), null);
assert.equal(throttle(0.019), null);
assert.equal(throttle(0.02), 2);
assert.equal(throttle(0.03), null);
assert.equal(throttle(0.045), 4);
assert.equal(throttle(0.99), 99);
assert.equal(throttle(1), 100);
assert.equal(throttle(1), null);

// Many tiny callbacks produce few updates.
throttle = createProgressThrottle(5);
let emitted = 0;
for (let bytes = 0; bytes <= 1000; bytes++) if (throttle(bytes / 1000) !== null) emitted++;
assert.equal(emitted, 21);

// Out-of-range input is clamped.
throttle = createProgressThrottle(2);
assert.equal(throttle(-1), 0);
assert.equal(throttle(1.5), 100);

console.log('progress throttle tests passed');
