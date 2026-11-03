// Navegador (PWA): a sessão fica no cookie HttpOnly da API, que o JavaScript
// não lê. Nenhum token vai para localStorage, sessionStorage ou cache.
export const WEB = true;
export const COOKIE_SESSION = 'cookie-session';
export const credentials: RequestCredentials = 'include';
export function authHeaders(token?: string | null): Record<string, string> {
  return { 'x-client': 'web', ...(token && token !== COOKIE_SESSION ? { authorization: `Bearer ${token}` } : {}) };
}
// O login pelo navegador já devolve o cookie; o corpo não traz token.
export function loginToken(_data: { token?: unknown } | null | undefined): string | null { return COOKIE_SESSION; }
// A entrada Google usa o fluxo do aplicativo e termina com um token: ele é
// trocado pelo cookie e descartado em seguida.
export async function persistSession(apiUrl: string, token: string): Promise<string> {
  if (token === COOKIE_SESSION) return token;
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/auth/session/cookie`, { method: 'POST', credentials, headers: authHeaders(token), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'O servidor precisa ser atualizado para concluir a entrada no navegador.' : 'Não foi possível concluir a entrada neste navegador.');
  return COOKIE_SESSION;
}
export async function endSession(apiUrl: string): Promise<void> {
  await fetch(`${apiUrl.replace(/\/$/, '')}/api/auth/logout`, { method: 'POST', credentials, headers: authHeaders(null) }).catch(() => {});
}
