export type StudentIdentity = {
  role: "student";
  user: { id: string; displayName: string; email: string };
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
      headers: {
        "content-type": "application/json",
        "x-client": "mobile",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error || "Não foi possível continuar.");
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
};
export function inviteCodeFromQr(value: string) {
  const url = new URL(value);
  const frontend = new URL(
    process.env.EXPO_PUBLIC_PORTAL_URL || "https://ufaprova-frontend.onrender.com",
  );
  const code = url.searchParams.get("invite") || "";
  if (
    url.origin !== frontend.origin ||
    url.pathname !== "/portal" ||
    url.username ||
    url.password ||
    !url.protocol.startsWith("https") ||
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
