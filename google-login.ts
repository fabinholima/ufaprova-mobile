import * as Crypto from 'expo-crypto';

export type GoogleAttempt = { id: string; token: string; browserUrl: string; expiresAt: number };

async function request(apiUrl: string, path: string, body: object) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'mobile' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) throw new Error('O servidor precisa ser atualizado para permitir a entrada com Google no aplicativo.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível entrar com Google.');
  return result.data;
}

export async function startGoogleLogin(apiUrl: string, accountType: 'educator' | 'student' = 'educator'): Promise<GoogleAttempt> {
  // Only the hash leaves the device until the app checks the completed login.
  // The browser ticket is separate and can never be used as an app session.
  const token = Array.from(Crypto.getRandomBytes(32), byte => byte.toString(16).padStart(2, '0')).join('');
  const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
  const data = await request(apiUrl, '/api/auth/google/mobile/start', { tokenHash, ...(accountType === 'student' ? {accountType} : {}) });
  const target = new URL(data?.url);
  const api = new URL(apiUrl);
  if (target.origin !== api.origin || target.pathname !== '/api/auth/google/mobile/browser' ||
      (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname))) ||
      typeof data?.id !== 'string' || !data.id || !Number.isFinite(Date.parse(data.expiresAt))) {
    throw new Error('O servidor retornou uma tentativa de login inválida.');
  }
  return { id: data.id, token, browserUrl: target.href, expiresAt: Date.parse(data.expiresAt) };
}

export async function checkGoogleLogin(apiUrl: string, attempt: GoogleAttempt): Promise<boolean> {
  if (Date.now() >= attempt.expiresAt) throw new Error('A entrada com Google expirou. Tente novamente.');
  const data = await request(apiUrl, '/api/auth/google/mobile/status', { id: attempt.id, token: attempt.token });
  if (data?.status === 'completed') return true;
  if (data?.status === 'failed') throw new Error(data.message || 'A entrada com Google não foi concluída. Tente novamente.');
  if (data?.status !== 'pending') throw new Error('O servidor retornou um estado de login inválido.');
  return false;
}
