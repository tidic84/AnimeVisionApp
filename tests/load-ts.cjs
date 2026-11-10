// Compiles a TypeScript module from src/ and runs it in this realm (so objects
// it returns compare equal to test literals), with its own module scope.
// `mocks` maps an import specifier to the object it should return; relative
// imports without a mock load the real TypeScript file the same way.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const src = path.resolve(__dirname, '../src');

function loadTs(file, mocks = {}, globals = {}) {
  const filename = path.resolve(src, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const moduleObject = { exports: {} };
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      const target = ['.ts', '.tsx', '/index.ts'].map(ext => base + ext).find(candidate => fs.existsSync(candidate));
      if (target) return loadTs(path.relative(src, target), mocks, globals);
    }
    return require(name);
  };
  // Injected globals (fetch, timers...) shadow the real ones inside the module only.
  const scope = { module: moduleObject, exports: moduleObject.exports, require: localRequire, ...globals };
  const names = Object.keys(scope);
  vm.runInThisContext(`(function (${names.join(", ")}) {${compiled}
})`, { filename })(...names.map(name => scope[name]));
  return moduleObject.exports;
}

module.exports = { loadTs };
