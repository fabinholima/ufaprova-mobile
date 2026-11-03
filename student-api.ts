import { authHeaders, credentials } from "./platform-http";
export type StudentIdentity = {
  role: "student";
  // Conta criada pelo código pessoal não tem e-mail.
  user: { id: string; displayName: string; email: string | null };
};
export type StudentRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  className: string;
  schoolName: string;
};
export type ClassInvite = { schoolName: string; className: string; teacherName: string };
export const STUDENT_SESSION_KEY = "ufaprova.student.session.v1";
export function createStudentClient(apiUrl: string, token?: string) {
  return async function request<T>(path: string, input?: object): Promise<T> {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
      method: input ? "POST" : "GET",
      credentials,
      headers: { "content-type": "application/json", ...authHeaders(token) },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok)
      throw Object.assign(Error(body.error || "Não foi possível continuar."), { status: response.status });
    return body.data as T;
  };
}
export async function verifyStudentSession(apiUrl: string, token: string) {
  const identity = await createStudentClient(apiUrl, token)<StudentIdentity>("/api/auth/me");
  if (identity?.role !== "student" || !identity.user?.id)
    throw Error("Esta conta não é de aluno. Use a entrada de professor.");
  return identity;
}
export type StudentActivity = {
  id: string;
  title: string;
  className: string;
  schoolName: string;
  score: string | null;
  maxScore: string | null;
  requiresManualReview: boolean;
  scheduledAt?: string | null;
  // Campos da publicação autorizada (APIs anteriores não os enviam).
  subject?: string | null;
  resultId?: string | null;
  resultStatus?: "published" | "in_correction" | "not_corrected";
  percent?: number | null;
  validCount?: number | null;
  correctCount?: number | null;
  incorrectCount?: number | null;
  blankCount?: number | null;
  invalidCount?: number | null;
  annulledCount?: number | null;
  publishedAt?: string | null;
};
export type SkillIndicator = {
  code: string;
  description: string | null;
  questions: number;
  correct: number;
  percent: number;
  sufficientEvidence: boolean;
};
export type StudentResultDetail = StudentActivity & {
  releasePolicy: "summary" | "answers" | "answers_and_key";
  questions: { questionNumber: number; status: string; selectedLabels?: string[]; correctLabels?: string[] }[];
  skills: SkillIndicator[];
  minSkillEvidence: number;
  guidance: { text: string; publishedAt: string } | null;
};
export type SubjectSkills = { subject: string; assessments: number; minSkillEvidence: number; skills: SkillIndicator[] };
// Parsed by hand: React Native's URL polyfill is regex-based and differs from the WHATWG URL in edge cases.
const PORTAL_HOST = /^https:\/\/([a-z0-9.-]+)\/?$/;
export function inviteCodeFromQr(value: string) {
  // The portal is served on the official domain and on Render; EXPO_PUBLIC_PORTAL_URL may list others, comma-separated.
  const hosts = (
    process.env.EXPO_PUBLIC_PORTAL_URL ||
    "https://ufaprova.com.br,https://www.ufaprova.com.br,https://ufaprova-frontend.onrender.com"
  )
    .split(",")
    .map((portal: string) => PORTAL_HOST.exec(portal.trim().toLowerCase())?.[1]);
  const match = /^https:\/\/([a-z0-9.-]+)\/portal\/?\?([^#]*)(?:#.*)?$/i.exec(value.trim());
  const pair = (match?.[2] || "").split("&").find((item) => item.startsWith("invite="));
  let code = "";
  try {
    code = decodeURIComponent((pair || "").slice("invite=".length)).trim().toUpperCase();
  } catch {}
  if (
    !match ||
    !hosts.includes(match[1].toLowerCase()) ||
    !/^([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4})-?([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4})$/.test(code)
  )
    throw Error("Este QR Code não é um convite de turma do UFA Prova.");
  return code;
}
export type StudentProfile = {
  id: string;
  name: string;
  registration: string;
  selfieDataUrl: string | null;
};
export const SELFIE_MAX_BYTES = 400000;
export function selfieDataUrl(base64: string | undefined) {
  const value = (base64 || "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error("Não foi possível preparar a foto.");
  const bytes = Math.floor((value.length * 3) / 4) - (value.match(/=+$/)?.[0].length || 0);
  if (bytes > SELFIE_MAX_BYTES) throw Error("A foto ficou maior que 400 KB. Tente novamente.");
  return `data:image/jpeg;base64,${value}`;
}
export type StudentCodeMatch = {
  studentName: string;
  schoolName: string;
  classes: { className: string }[];
};
// Primeiro acesso pelo código: passwordReset indica conta já existente (senha nova).
export type FirstAccessMatch = StudentCodeMatch & { passwordReset: boolean };
export type StudentCodeClaim = {
  studentId: string;
  classes: { className: string; schoolName: string }[];
};
export function normalizeStudentCode(value: string) {
  const hex = value.trim().toUpperCase().replace(/^UFA-?/, "");
  if (!/^[0-9A-F]{8}$/.test(hex))
    throw Error("Digite o código do aluno no formato UFA-XXXXXXXX.");
  return `UFA-${hex}`;
}
