export const labels = ['A', 'B', 'C', 'D', 'E'] as const;
export type Label = typeof labels[number];
export type ScanStatus = 'queued' | 'processing' | 'review' | 'failed' | 'completed';
export type Answer = { questionNumber: number; selectedLabels: Label[]; status?: string };
export type Question = { number: number; type: string; labels: Label[] };
export type Candidate = {
  id: string;
  studentName: string;
  registration?: string | null;
  number?: number | null;
  versionCode: string;
  assessmentId?: string;
  classId?: string;
  assessmentTitle: string;
  className: string;
  questions: Question[];
};
export type Scan = {
  id: string;
  status: ScanStatus;
  submissionId?: string | null;
  score?: number | null;
  maxScore?: number | null;
  requiresManualReview?: boolean;
  revision?: number | null;
  error?: string | null;
  applicationStudentId?: string | null;
  imageAvailable: boolean;
  detectedAnswers: Answer[];
  candidates: Candidate[];
};
export type Grade = {
  id: string;
  submissionId?: string | null;
  score: number | null;
  maxScore: number | null;
  requiresManualReview: boolean;
};
export type ScanContext = { assessmentId?: string; classId?: string; assessmentTitle: string; className: string };
export const isPending = (status: ScanStatus) => status === 'queued' || status === 'processing';
export const isObjective = (question: Question) => question.type !== 'essay' && question.type !== 'short_answer';
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function requireId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('A API retornou um identificador inválido.');
  }
  return value;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A API retornou dados de leitura inválidos.');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('A API retornou uma questão inválida.');
  return value;
}
function parseLabels(value: unknown): Label[] {
  if (!Array.isArray(value) || value.some((label) => !labels.includes(label)) || new Set(value).size !== value.length) {
    throw new Error('A API retornou alternativas inválidas.');
  }
  return value as Label[];
}
export function parseStatus(value: unknown): ScanStatus {
  if (!['queued', 'processing', 'review', 'failed', 'completed'].includes(String(value))) throw new Error('Status de leitura não reconhecido.');
  return value as ScanStatus;
}
export function parseScan(value: unknown): Scan {
  if (!isObject(value) || !Array.isArray(value.detectedAnswers) || !Array.isArray(value.candidates)) throw new Error('A API retornou uma leitura inválida.');
  return {
    id: requireId(value.id), status: parseStatus(value.status),
    submissionId: value.submissionId == null ? null : requireId(value.submissionId),
    score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : null,
    maxScore: typeof value.maxScore === 'number' && Number.isFinite(value.maxScore) ? value.maxScore : null,
    requiresManualReview: value.requiresManualReview === true,
    revision: typeof value.revision === 'number' && Number.isInteger(value.revision) ? value.revision : null,
    error: typeof value.error === 'string' ? value.error : null,
    applicationStudentId: value.applicationStudentId == null ? null : requireId(value.applicationStudentId),
    imageAvailable: value.imageAvailable === true,
    detectedAnswers: value.detectedAnswers.map((answer) => {
      if (!isObject(answer)) throw new Error('Resposta de leitura inválida.');
      return { questionNumber: number(answer.questionNumber), selectedLabels: parseLabels(answer.selectedLabels), status: typeof answer.status === 'string' ? answer.status : undefined };
    }),
    candidates: value.candidates.map((candidate) => {
      if (!isObject(candidate) || !Array.isArray(candidate.questions)) throw new Error('Aluno de revisão inválido.');
      return {
        id: requireId(candidate.id), studentName: string(candidate.studentName),
        registration: typeof candidate.registration === 'string' ? candidate.registration : null,
        number: typeof candidate.number === 'number' ? candidate.number : null,
        assessmentId: candidate.assessmentId == null ? undefined : requireId(candidate.assessmentId),
        classId: candidate.classId == null ? undefined : requireId(candidate.classId),
        versionCode: string(candidate.versionCode), assessmentTitle: string(candidate.assessmentTitle), className: string(candidate.className),
        questions: candidate.questions.map((question) => {
          if (!isObject(question)) throw new Error('Questão de revisão inválida.');
          return { number: number(question.number), type: string(question.type), labels: parseLabels(question.labels) };
        }),
      };
    }),
  };
}
export function parseGrade(value: unknown): Grade {
  if (!isObject(value)) throw new Error('Resultado da correção inválido.');
  const score = value.score == null ? null : value.score;
  const maxScore = value.maxScore == null ? null : value.maxScore;
  if ((score !== null && (typeof score !== 'number' || !Number.isFinite(score))) || (maxScore !== null && (typeof maxScore !== 'number' || !Number.isFinite(maxScore)))) throw new Error('Nota inválida retornada pela API.');
  return { id: requireId(value.id), submissionId: value.submissionId == null ? null : requireId(value.submissionId), score, maxScore, requiresManualReview: value.requiresManualReview === true };
}
export function matchesContext(candidate: Candidate, context: ScanContext): boolean {
  if (context.assessmentId || context.classId) return candidate.assessmentId === context.assessmentId && candidate.classId === context.classId;
  return candidate.assessmentTitle === context.assessmentTitle && candidate.className === context.className;
}
export function initialAnswers(candidate: Candidate, detected: Answer[], useDetected: boolean): Record<number, Label[]> {
  return Object.fromEntries(candidate.questions.filter(isObjective).map((question) => [
    question.number,
    useDetected ? (detected.find((answer) => answer.questionNumber === question.number)?.selectedLabels ?? []).filter((label) => question.labels.includes(label)) : [],
  ]));
}
export function reviewResponses(candidate: Candidate, answers: Record<number, Label[]>): Answer[] {
  if (!candidate.questions.length) throw new Error('Esta versão da avaliação não possui questões.');
  const numbers = candidate.questions.map((question) => question.number);
  if (new Set(numbers).size !== numbers.length) throw new Error('A avaliação contém números de questões repetidos.');
  return candidate.questions.filter(isObjective).map((question) => {
    const selectedLabels = answers[question.number] ?? [];
    if (new Set(selectedLabels).size !== selectedLabels.length || selectedLabels.some((label) => !question.labels.includes(label))) throw new Error(`Alternativa inválida na questão ${question.number}.`);
    return { questionNumber: question.number, selectedLabels: [...selectedLabels] };
  });
}
