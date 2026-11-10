const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the real verification helpers used by the updater.
const filename = path.resolve(__dirname, '../src/utils/apkIntegrity.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, require }, { filename });
const { parseSha256, extractSha256, checkApk } = moduleObject.exports;

const hash = '1e9bfc333dff603c0c338a246e2b2f098d15f77e194ef8cda3119e5d2366d854';
const other = 'f'.repeat(64);

// GitHub asset digest and bare hexadecimal values.
assert.equal(parseSha256(`sha256:${hash}`), hash);
assert.equal(parseSha256(`SHA256:${hash.toUpperCase()}`), hash);
assert.equal(parseSha256(hash), hash);
assert.equal(parseSha256('sha512:' + 'a'.repeat(128)), null);
assert.equal(parseSha256('md5:d41d8cd98f00b204e9800998ecf8427e'), null);
assert.equal(parseSha256(undefined), null);
assert.equal(parseSha256(null), null);
assert.equal(parseSha256('sha256:1234'), null);

// sha256sum sidecar files.
assert.equal(extractSha256(`${hash}  AnimeVision-v1.0.4.apk\n`, 'AnimeVision-v1.0.4.apk'), hash);
assert.equal(extractSha256(`${hash} *AnimeVision-v1.0.4.apk\r\n`, 'AnimeVision-v1.0.4.apk'), hash);
assert.equal(extractSha256(`${hash.toUpperCase()}\n`), hash, 'hash alone is accepted');
assert.equal(extractSha256(`${other}  other.apk\n${hash}  AnimeVision-v1.0.4.apk\n`, 'AnimeVision-v1.0.4.apk'), hash);
assert.equal(extractSha256(`${other}  other.apk\n`, 'AnimeVision-v1.0.4.apk'), null);
assert.equal(extractSha256('<html>Not Found</html>'), null);
assert.equal(extractSha256(''), null);

// Verification outcomes.
const size = 37498174;
assert.deepEqual({ ...checkApk({ expectedSize: size, actualSize: size, expectedSha256: hash, actualSha256: hash.toUpperCase() }) }, { ok: true, method: 'sha256' });
assert.equal(checkApk({ expectedSize: size, actualSize: size, expectedSha256: hash, actualSha256: other }).reason, 'sha256');
assert.equal(checkApk({ expectedSize: size, actualSize: size - 1, expectedSha256: hash, actualSha256: hash }).reason, 'size', 'size is checked before hashing');
assert.match(checkApk({ expectedSize: size, actualSize: 1024 }).message, /incomplet/);
assert.equal(checkApk({ expectedSize: size, actualSize: 0 }).reason, 'missing');
assert.equal(checkApk({ expectedSize: size, actualSize: null }).reason, 'missing');
// Older releases without a digest: size only; no size known either: accepted.
assert.equal(checkApk({ expectedSize: size, actualSize: size, expectedSha256: null }).method, 'size');
assert.equal(checkApk({ expectedSize: size, actualSize: size, expectedSha256: hash, actualSha256: null }).method, 'size', 'native hashing unavailable falls back to size');
assert.equal(checkApk({ expectedSize: 0, actualSize: 10 }).method, 'none');

console.log('apk integrity tests passed');
