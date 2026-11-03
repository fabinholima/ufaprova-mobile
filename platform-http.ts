// Aplicativo nativo: a sessão é um token Bearer guardado no SecureStore.
export const WEB = false;
export const credentials: RequestCredentials | undefined = undefined;
export function authHeaders(token?: string | null): Record<string, string> {
  return { 'x-client': 'mobile', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}
export function loginToken(data: { token?: unknown } | null | undefined): string | null {
  return typeof data?.token === 'string' && data.token ? data.token : null;
}
export async function persistSession(_apiUrl: string, token: string): Promise<string> { return token; }
export async function endSession(_apiUrl: string): Promise<void> {}
