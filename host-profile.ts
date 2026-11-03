import type { Profile } from './profiles';

// Aplicativo nativo: um único aplicativo com as duas entradas na tela inicial.
export const hostProfile: Profile | null = null;
export function switchProfile(_profile: Profile): void {}
export function warnBeforeLeaving(_pending: boolean): () => void { return () => {}; }
