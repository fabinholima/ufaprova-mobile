// Endereços fixados no build (EXPO_PUBLIC_*). Desenvolvimento e produção usam
// arquivos .env diferentes; veja a seção "Versão web (PWA)" do README.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ufaprova-api.onrender.com';
export const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL || 'https://ufaprova-frontend.onrender.com';
