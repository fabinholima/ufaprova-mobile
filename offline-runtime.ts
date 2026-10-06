import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createOfflineStore } from './offline-store';
import type { OfflineStore } from './offline-store';
import { createScanClient, ScanApiError } from './scan-api';
import { requireId } from './scan-contract';
export type Account = { owner: string; apiUrl: string; userId: string; institutionId: string; email: string; displayName: string };
export const ACCOUNT_KEY = 'ufaprova.account';
export function accountFromLogin(apiUrl: string, data: any): Account {
  const userId = requireId(data?.user?.id), institutionId = requireId(data?.institution?.id);
  const endpoint = apiUrl.replace(/\/$/, '');
  return { owner: `${endpoint}:${userId}:${institutionId}`, apiUrl: endpoint, userId, institutionId, email: String(data.user.email), displayName: String(data.user.displayName ?? data.user.email) };
}
let storage: Promise<OfflineStore> | null = null;
export function getStore(): Promise<OfflineStore> {
  if (!storage) storage = (async () => { const db = await SQLite.openDatabaseAsync('ufaprova-offline.db'); const store = createOfflineStore(db, Crypto.randomUUID); await store.initialize(); return store; })().catch(error => { storage = null; throw error; });
  return storage;
}
export function accountClient(account: Account) {
  return createScanClient(account.apiUrl, async () => {
    const saved = await SecureStore.getItemAsync(ACCOUNT_KEY);
    const credentials = saved ? JSON.parse(saved) : null;
    if (!credentials || credentials.owner !== account.owner) throw new ScanApiError('Entre novamente na conta que criou esta correção.', false, 401);
    return typeof credentials.sessionToken === 'string' ? credentials.sessionToken : null;
  }, fetch, { userId: account.userId, institutionId: account.institutionId });
}
