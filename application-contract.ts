import { requireId } from "./scan-contract";
export type CorrectionApplication = {
  id: string;
  assessmentId: string;
  classId: string;
  title: string;
  className: string;
  status: "scheduled" | "open" | "closed" | "cancelled";
  students: number;
  completed: number;
  scheduledAt?: string | null;
  subject?: string | null;
  // Ausentes numa API anterior: nesse caso o app não bloqueia a captura.
  versions?: { code: string; questions: number; objective: number; missingAnswerKeys: number[] }[];
  answerKeyReady?: boolean;
};
// Resumo do gabarito para o professor conferir antes de corrigir.
export function answerKeyLine(application: CorrectionApplication): string | null {
  if (!application.versions) return null;
  if (!application.versions.length) return "Sem versão de gabarito";
  const counts = [...new Set(application.versions.map((version) => version.questions))];
  return `${counts.join(" ou ")} questões · gabarito ${application.versions.length > 1 ? "versões" : "versão"} ${application.versions.map((version) => version.code).join(", ")}`;
}
export function answerKeyProblem(application: CorrectionApplication): string | null {
  if (application.answerKeyReady !== false) return null;
  const incomplete = application.versions?.find((version) => version.missingAnswerKeys.length);
  return incomplete
    ? `Gabarito incompleto na versão ${incomplete.code} (questões ${incomplete.missingAnswerKeys.join(", ")}). Complete-o no portal antes de corrigir.`
    : "Esta avaliação não tem gabarito válido. Confira-a no portal antes de corrigir.";
}
export function parseApplications(value: unknown): CorrectionApplication[] {
  if (!Array.isArray(value)) throw Error("O servidor retornou uma lista de aplicações inválida.");
  return value
    .map((raw: unknown) => {
      const x = raw as Partial<CorrectionApplication> | null;
      if (
        !x ||
        typeof x.title !== "string" ||
        typeof x.className !== "string" ||
        !["scheduled", "open", "closed", "cancelled"].includes(String(x.status)) ||
        !Number.isInteger(x.students) ||
        Number(x.students) < 0
      )
        throw Error("Atualize os dados do portal para carregar as aplicações de correção.");
      return {
        ...x,
        id: requireId(x.id),
        assessmentId: requireId(x.assessmentId),
        classId: requireId(x.classId),
      } as CorrectionApplication;
    })
    .filter((x) => x.status !== "cancelled" && x.students > 0);
}
