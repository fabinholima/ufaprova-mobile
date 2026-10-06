const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const cache = new Map();
module.exports = function load(filename, mocks = {}) {
  filename = path.resolve(filename);
  if (Object.keys(mocks).length === 0 && cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const requireLocal = createRequire(filename);
  function requireDependency(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.')) { const source = ['.ts', '.tsx'].map(extension => path.resolve(path.dirname(filename), `${name}${extension}`)).find(file => fs.existsSync(file)); if (source) return load(source, mocks); }
    return requireLocal(name);
  }
  const run = vm.runInThisContext(`(function(require, module, exports) {\n${output}\n})`, { filename });
  run(requireDependency, module, module.exports);
  if (!Object.keys(mocks).length) cache.set(filename, module.exports);
  return module.exports;
};
