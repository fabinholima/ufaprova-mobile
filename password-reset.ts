import { authHeaders, credentials } from './platform-http';

// Pede o link de nova senha. A resposta é a mesma com ou sem conta, para não
// revelar quais e-mails estão cadastrados; a senha é trocada no portal.
export async function requestPasswordReset(apiUrl: string, email: string): Promise<string> {
  const value = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Informe o e-mail da conta para receber o link.');
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/auth/forgot-password`, {
    method: 'POST', credentials, headers: { 'content-type': 'application/json', ...authHeaders(null) },
    body: JSON.stringify({ email: value }), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível pedir uma nova senha agora. Tente novamente mais tarde.');
  }
  return 'Se houver uma conta com este e-mail, enviaremos um link para criar uma nova senha. Abra o link, defina a senha e depois entre aqui.';
}
