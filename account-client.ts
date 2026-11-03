import { ACCOUNT_KEY } from './account';
import type { Account } from './account';
import { sessionStore } from './platform-store';
import { createScanClient, ScanApiError } from './scan-api';

export function accountClient(account: Account) {
  return createScanClient(account.apiUrl, async () => {
    const saved = await sessionStore.getItemAsync(ACCOUNT_KEY);
    const credentials = saved ? JSON.parse(saved) : null;
    if (!credentials || credentials.owner !== account.owner) throw new ScanApiError('Entre novamente na conta que criou esta correção.', false, 401);
    return typeof credentials.sessionToken === 'string' ? credentials.sessionToken : null;
  }, fetch, { userId: account.userId, institutionId: account.institutionId });
}
