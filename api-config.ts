// Endereços fixados no build (EXPO_PUBLIC_*). Desenvolvimento e produção usam
// arquivos .env diferentes; veja a seção "Versão web (PWA)" do README.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.ufaprova.com.br';
// Endereço anterior da mesma API (mesmo banco). Sessões e dados salvos com ele
// continuam valendo depois da troca do endereço padrão.
export const LEGACY_API_URL = 'https://ufaprova-api.onrender.com';
const normalize = (url: string) => url.replace(/\/$/, '');
export function sameApi(saved: unknown, current = API_URL): boolean {
  if (typeof saved !== 'string') return false;
  return normalize(saved) === normalize(current) || (normalize(saved) === LEGACY_API_URL && normalize(current) === 'https://api.ufaprova.com.br');
}
export const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL || 'https://ufaprova.com.br';
