const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const cache = new Map();
// Módulos nativos que os testes não precisam simular um a um.
const React = require('react');
const nativeDefaults = {
  'react-native-safe-area-context': {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => React.createElement('SafeAreaView', null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: () => null },
  'expo-status-bar': { StatusBar: () => null },
};
const reactNativeDefaults = {
  useColorScheme: () => 'light',
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Vibration: { vibrate: () => {} },
  RefreshControl: 'RefreshControl',
  StyleSheet: { create: (x) => x },
};
module.exports = function load(filename, mocks = {}) {
  filename = path.resolve(filename);
  if (Object.keys(mocks).length) {
    mocks = { ...nativeDefaults, ...mocks };
    if (mocks['react-native']) mocks['react-native'] = { ...reactNativeDefaults, ...mocks['react-native'] };
  }
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
