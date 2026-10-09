const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const api = 'https://ufaprova-api.onrender.com';
const helpers = () => load(path.join(__dirname, '../google-login.ts'), {
  'expo-crypto': { getRandomBytes: n => new Uint8Array(n).fill(42), CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
});
function mockFetch(t, handler) { const original = global.fetch; global.fetch = handler; t.after(() => { global.fetch = original; }); }
test('Google login sends only a hash and validates the browser destination', async t => {
  let sent;
  mockFetch(t, async (url, options) => { assert.equal(url, `${api}/api/auth/google/mobile/start`); sent = JSON.parse(options.body); return { ok: true, json: async () => ({ data: { id: 'attempt', url: `${api}/api/auth/google/mobile/browser?ticket=opaque`, expiresAt: new Date(Date.now()+600000).toISOString() } }) }; });
  const attempt = await helpers().startGoogleLogin(api);
  assert.equal(sent.tokenHash, createHash('sha256').update(attempt.token).digest('hex'));
  assert(!JSON.stringify(sent).includes(attempt.token));
});
test('Google login rejects redirects to a foreign server', async t => {
  mockFetch(t, async () => ({ ok: true, json: async () => ({ data: { id: 'attempt', url: 'https://untrusted.example/api/auth/google/mobile/browser', expiresAt: new Date(Date.now()+600000).toISOString() } }) }));
  await assert.rejects(helpers().startGoogleLogin(api), /inválida/);
});
test('pending, completed, cancelled and expired login states are distinct', async t => {
  let status = 'pending';
  mockFetch(t, async (url, options) => { assert.match(url, /mobile\/status$/); assert.equal(JSON.parse(options.body).token, 'private-proof'); return { ok: true, json: async () => ({ data: { status } }) }; });
  const { checkGoogleLogin } = helpers(); const attempt = { id: 'attempt', token: 'private-proof', expiresAt: Date.now()+600000 };
  assert.equal(await checkGoogleLogin(api, attempt), false); status = 'completed'; assert.equal(await checkGoogleLogin(api, attempt), true);
  status = 'failed'; await assert.rejects(checkGoogleLogin(api, attempt), /não foi concluída/);
  await assert.rejects(checkGoogleLogin(api, { ...attempt, expiresAt: 0 }), /expirou/);
});
test('an older API reports that Google mobile login requires a server update', async t => {
  mockFetch(t, async () => ({ status: 404 }));
  await assert.rejects(helpers().startGoogleLogin(api), /servidor precisa ser atualizado/);
});
