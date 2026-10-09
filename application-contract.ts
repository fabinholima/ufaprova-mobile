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
};
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
