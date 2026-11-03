import { requireId } from './scan-contract';

export type Account = { owner: string; apiUrl: string; userId: string; institutionId: string; email: string; displayName: string };
export const ACCOUNT_KEY = 'ufaprova.account';
export function accountFromLogin(apiUrl: string, data: any): Account {
  const userId = requireId(data?.user?.id), institutionId = requireId(data?.institution?.id);
  const endpoint = apiUrl.replace(/\/$/, '');
  return { owner: `${endpoint}:${userId}:${institutionId}`, apiUrl: endpoint, userId, institutionId, email: String(data.user.email), displayName: String(data.user.displayName ?? data.user.email) };
}
