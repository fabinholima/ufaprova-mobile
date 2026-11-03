import { PROFILE_URL, profileFromLocation } from './profiles';
import type { Profile } from './profiles';

export const hostProfile: Profile | null = profileFromLocation(window.location.hostname, window.location.search);

export function switchProfile(profile: Profile): void {
  if (profileFromLocation(window.location.hostname) === null) {
    // Sem subdomínio próprio, troca só o parâmetro na mesma origem.
    const url = new URL(window.location.href);
    url.searchParams.set('perfil', profile === 'teacher' ? 'professor' : 'aluno');
    window.location.assign(url.href);
  } else window.location.assign(PROFILE_URL[profile]);
}

// No navegador as fotos ainda não enviadas existem só nesta aba.
export function warnBeforeLeaving(pending: boolean): () => void {
  if (!pending) return () => {};
  const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', listener);
  return () => window.removeEventListener('beforeunload', listener);
}
