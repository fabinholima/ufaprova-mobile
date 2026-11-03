import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { createOfflineStore } from './offline-store';
import type { OfflineStore } from './offline-store';
export { ACCOUNT_KEY, accountFromLogin } from './account';
export type { Account } from './account';
export { accountClient } from './account-client';
export const PERSISTENT_STORE = true;
let storage: Promise<OfflineStore> | null = null;
export function getStore(): Promise<OfflineStore> {
  if (!storage) storage = (async () => { const db = await SQLite.openDatabaseAsync('ufaprova-offline.db'); const store = createOfflineStore(db, Crypto.randomUUID); await store.initialize(); return store; })().catch(error => { storage = null; throw error; });
  return storage;
}
