import { requireId } from './scan-contract';
export type RichBlock = { type: string; text?: string; tex?: string; code?: string; formula?: string; equation?: string; alt?: string; caption?: string; dataUrl?: string; svgDataUrl?: string; items?: string[] };
export type ManualQuestion = { number: number; type: string; points: number; statement: RichBlock[]; guide: RichBlock[] };
export type ManualItem = { questionNumber: number; status: string; maxPoints: number; awardedPoints: number | null; feedback?: string };
export type Submission = {
  id: string; versionId: string; revision: number; candidate: { name: string; class?: string; number?: string };
  responses: { questionNumber: number; text?: string }[];
  result: { items: ManualItem[] }; questions: ManualQuestion[];
  score: number; maxScore: number; requiresManualReview: boolean;
};
export type ManualReview = { questionNumber: number; awardedPoints: number; feedback: string };
export type ManualPayload = { expectedRevision: number; reviews: ManualReview[] };
export type ManualDraft = { submissionId: string; revision: number; points: Record<number, string>; feedback: Record<number, string> };
export const isManual = (question: { type: string }) => question.type === 'essay' || question.type === 'short_answer';
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function parseSubmission(value: unknown): Submission {
  if (!object(value) || !object(value.candidate) || typeof value.candidate.name !== 'string' || !Array.isArray(value.questions) || !Array.isArray(value.responses) || !object(value.result) || !Array.isArray(value.result.items) || !Number.isInteger(value.revision) || value.revision < 0 || !finite(value.score) || !finite(value.maxScore)) throw new Error('A API retornou uma correção manual inválida.');
  const questions: ManualQuestion[] = value.questions.map((question: unknown) => {
    if (!object(question) || !Number.isInteger(question.number) || question.number < 1 || typeof question.type !== 'string' || !finite(question.points) || question.points < 0 || !Array.isArray(question.statement) || !Array.isArray(question.guide)) throw new Error('Questão discursiva inválida.');
    return { number: question.number, type: question.type, points: question.points, statement: question.statement.filter((block: unknown): block is RichBlock => object(block) && typeof block.type === 'string'), guide: question.guide.filter((block: unknown): block is RichBlock => object(block) && typeof block.type === 'string') };
  });
  if (new Set(questions.map(q => q.number)).size !== questions.length) throw new Error('Questões repetidas na correção.');
  const items: ManualItem[] = value.result.items.map((item: unknown) => {
    if (!object(item) || !Number.isInteger(item.questionNumber) || typeof item.status !== 'string' || !finite(item.maxPoints) || (item.awardedPoints !== null && (!finite(item.awardedPoints) || item.awardedPoints < 0 || item.awardedPoints > item.maxPoints))) throw new Error('Nota manual inválida.');
    return { questionNumber: item.questionNumber, status: item.status, maxPoints: item.maxPoints, awardedPoints: item.awardedPoints, feedback: typeof item.feedback === 'string' ? item.feedback : '' };
  });
  return { id: requireId(value.id), versionId: requireId(value.versionId), revision: value.revision, candidate: { name: value.candidate.name, class: typeof value.candidate.class === 'string' ? value.candidate.class : undefined, number: typeof value.candidate.number === 'string' ? value.candidate.number : undefined }, responses: value.responses, result: { items }, questions, score: value.score, maxScore: value.maxScore, requiresManualReview: value.requiresManualReview === true };
}
export function initialManualDraft(submission: Submission): ManualDraft {
  const points: Record<number, string> = {}, feedback: Record<number, string> = {};
  for (const question of submission.questions.filter(isManual)) {
    const item = submission.result.items.find(item => item.questionNumber === question.number);
    points[question.number] = item?.awardedPoints == null ? '' : String(item.awardedPoints).replace('.', ',');
    feedback[question.number] = item?.feedback ?? '';
  }
  return { submissionId: submission.id, revision: submission.revision, points, feedback };
}
export function manualPayload(submission: Submission, draft: ManualDraft): ManualPayload {
  const questions = submission.questions.filter(isManual);
  if (!questions.length) throw new Error('Não há questões discursivas nesta avaliação.');
  const reviews = questions.map(question => {
    const input = (draft.points[question.number] ?? '').trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) throw new Error(`Informe a nota da questão ${question.number}, com até duas casas decimais.`);
    const awardedPoints = Number(input.replace(',', '.'));
    if (!Number.isFinite(awardedPoints) || awardedPoints < 0 || awardedPoints > question.points) throw new Error(`A nota da questão ${question.number} deve estar entre 0 e ${question.points}.`);
    const feedback = (draft.feedback[question.number] ?? '').trim();
    if (feedback.length > 2000) throw new Error('O comentário deve ter até 2000 caracteres.');
    return { questionNumber: question.number, awardedPoints, feedback };
  });
  return { expectedRevision: draft.revision, reviews };
}
