import * as Crypto from 'expo-crypto';
import { createMemoryStore } from './memory-store';
import type { OfflineStore } from './offline-store';
export { ACCOUNT_KEY, accountFromLogin } from './account';
export type { Account } from './account';
export { accountClient } from './account-client';
// No navegador, fotos de cartões e listas da escola não ficam gravadas no aparelho.
export const PERSISTENT_STORE = false;
const storage: Promise<OfflineStore> = Promise.resolve(createMemoryStore(Crypto.randomUUID));
export function getStore(): Promise<OfflineStore> { return storage; }
