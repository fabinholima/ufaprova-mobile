// Na web, professor.<domínio> e aluno.<domínio> servem o mesmo aplicativo; o
// subdomínio só escolhe a tela de entrada. Quem decide o acesso é a API.
export type Profile = 'teacher' | 'student';
export const PROFILE_URL: Record<Profile, string> = {
  teacher: process.env.EXPO_PUBLIC_TEACHER_URL || 'https://professor.ufaprova.com.br',
  student: process.env.EXPO_PUBLIC_STUDENT_URL || 'https://aluno.ufaprova.com.br',
};
export function profileFromLocation(hostname: string, search = ''): Profile | null {
  const subdomain = hostname.toLowerCase().split('.')[0];
  if (subdomain === 'professor') return 'teacher';
  if (subdomain === 'aluno') return 'student';
  // Sem subdomínio (localhost, prévia do Render): ?perfil=aluno ou ?perfil=professor.
  const requested = new URLSearchParams(search).get('perfil');
  return requested === 'professor' ? 'teacher' : requested === 'aluno' ? 'student' : null;
}
