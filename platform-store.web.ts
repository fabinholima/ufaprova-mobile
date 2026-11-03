import { API_URL } from './api-config';
import { ACCOUNT_KEY, accountFromLogin } from './account';
import { COOKIE_SESSION, authHeaders, credentials } from './platform-http.web';
import { STUDENT_SESSION_KEY } from './student-api';

// Nada é gravado no navegador: os valores ficam na memória da aba. Ao reabrir,
// a sessão é reconstruída pelo cookie HttpOnly da API (GET /api/auth/me).
const memory = new Map<string, string>();
let restored: Promise<void> | null = null;
function restore() {
  restored ??= (async () => {
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/api/auth/me`, { credentials, headers: authHeaders(null), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return;
      const data = (await response.json())?.data;
      if (data?.role === 'student') memory.set(STUDENT_SESSION_KEY, JSON.stringify({ apiUrl: API_URL, token: COOKIE_SESSION }));
      else if (data) memory.set(ACCOUNT_KEY, JSON.stringify({ ...accountFromLogin(API_URL, data), sessionToken: COOKIE_SESSION }));
    } catch {
      // Sem conexão ou sessão inválida: a tela de entrada aparece normalmente.
    }
  })();
  return restored;
}
export const sessionStore = {
  async getItemAsync(key: string) { await restore(); return memory.get(key) ?? null; },
  async setItemAsync(key: string, value: string) { await restore(); memory.set(key, value); },
  async deleteItemAsync(key: string) { await restore(); memory.delete(key); },
};
