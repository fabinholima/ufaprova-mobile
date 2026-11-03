import { requireId } from './scan-contract';

export type Account = { owner: string; apiUrl: string; userId: string; institutionId: string; email: string; displayName: string };
export const ACCOUNT_KEY = 'ufaprova.account';
// Mesma conta em outro endereço da API: o dono dos dados locais acompanha o endereço.
export function moveAccount(account: Account, apiUrl: string): Account {
  const endpoint = apiUrl.replace(/\/$/, '');
  return { ...account, apiUrl: endpoint, owner: `${endpoint}:${account.userId}:${account.institutionId}` };
}
export function accountFromLogin(apiUrl: string, data: any): Account {
  const userId = requireId(data?.user?.id), institutionId = requireId(data?.institution?.id);
  const endpoint = apiUrl.replace(/\/$/, '');
  return { owner: `${endpoint}:${userId}:${institutionId}`, apiUrl: endpoint, userId, institutionId, email: String(data.user.email), displayName: String(data.user.displayName ?? data.user.email) };
}
