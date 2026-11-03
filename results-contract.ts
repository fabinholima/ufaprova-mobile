import { requireId } from './scan-contract';

// Contratos das rotas de revisão e autorização de resultados
// (docs/resultados-publicacao.md no repositório da API). Os dados são
// privados e não são guardados no aparelho.

export type ProcessingStatus = 'not_scanned' | 'processing' | 'needs_review' | 'ready' | 'failed';
export type PublicationStatus = 'unpublished' | 'published' | 'republish_required';
export type ReleasePolicy = 'summary' | 'answers' | 'answers_and_key';
export type AnnulledPolicy = 'exclude' | 'award_full';
export type ResultCounts = {
  questions: number; valid: number; correct: number; incorrect: number; blank: number;
  invalid: number; annulled: number; reviewPending: number; manualPending: number;
};
export type ResultSettings = {
  minExpectedPercent: number | null; releasePolicy: ReleasePolicy;
  annulledQuestions: number[]; annulledPolicy: AnnulledPolicy | null;
  effectiveMinExpectedPercent?: number | null; recalculated?: number;
};
export type StudentResult = {
  applicationStudentId: string; studentName: string; registration: string | null; number: number | null;
  resultId: string | null; processingStatus: ProcessingStatus; publicationStatus: PublicationStatus;
  currentVersionId: string | null; currentVersion: number | null;
  counts: ResultCounts | null; percent: number | null; score: number | null; maxScore: number | null;
  cardScanId: string | null; scansInReview: number; publishable: boolean;
  published: { versionId: string; version: number; authorizedAt: string; authorizerName: string; legacy: boolean } | null;
  belowExpected: boolean; followupStatus: 'pending' | 'justified' | null;
};
export type ApplicationResults = {
  application: { id: string; title: string; subject: string; className: string; questionCounts: number[]; settings: ResultSettings; minExpectedPercent: number | null };
  students: StudentResult[];
};
export type ResultItem = {
  questionNumber: number; type?: string; status: string; selectedLabels?: string[]; correctLabels?: string[];
  awardedPoints: number | null; maxPoints: number; answerStatus?: string | null;
};
export type ResultVersion = {
  id: string; version: number; source: string; cardScanId: string | null; items: ResultItem[];
  counts: ResultCounts; percent: number | null; score: number | null; maxScore: number | null;
  createdAt: string; createdByName: string | null;
};
export type ResultDetail = {
  id: string; studentName: string; processingStatus: ProcessingStatus; publicationStatus: PublicationStatus;
  currentVersionId: string | null; publishedVersionId: string | null; versions: ResultVersion[];
  changes: { questionNumber: number; previousLabels: string[]; newLabels: string[]; previousStatus: string | null; newStatus: string; changedAt: string; changedByName: string | null; toVersion: number }[];
  publications: { id: string; version: number; authorizerName: string; authorizedAt: string; legacy: boolean; supersededAt: string | null }[];
  scans: { id: string; status: string; createdAt: string; imageAvailable: boolean; duplicateOfScanId: string | null }[];
};
export type AuthorizeOutcome = 'published' | 'already_published' | 'stale' | 'pending_review' | 'not_found';
export type AuthorizeResponse = { batchId: string; published: number; items: { resultId: string; versionId: string; outcome: AuthorizeOutcome }[] };

const invalid = () => new Error('Atualize o servidor para revisar e autorizar resultados pelo aplicativo.');
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const optionalId = (value: unknown) => (value == null ? null : requireId(value));
const optionalNumber = (value: unknown) => (value == null ? null : Number(value));

function parseCounts(value: unknown): ResultCounts | null {
  if (value == null) return null;
  if (!isObject(value)) throw invalid();
  const keys: (keyof ResultCounts)[] = ['questions', 'valid', 'correct', 'incorrect', 'blank', 'invalid', 'annulled', 'reviewPending', 'manualPending'];
  if (keys.some((key) => !Number.isInteger(value[key]))) throw invalid();
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as ResultCounts;
}

export function parseSettings(value: unknown): ResultSettings {
  if (!isObject(value) || !['summary', 'answers', 'answers_and_key'].includes(value.releasePolicy) || !Array.isArray(value.annulledQuestions)) throw invalid();
  return {
    minExpectedPercent: optionalNumber(value.minExpectedPercent),
    releasePolicy: value.releasePolicy,
    annulledQuestions: value.annulledQuestions.map(Number),
    annulledPolicy: value.annulledPolicy ?? null,
    effectiveMinExpectedPercent: optionalNumber(value.effectiveMinExpectedPercent),
    ...(value.recalculated != null ? { recalculated: Number(value.recalculated) } : {}),
  };
}

export function parseApplicationResults(value: unknown): ApplicationResults {
  if (!isObject(value) || !isObject(value.application) || !Array.isArray(value.students)) throw invalid();
  const a = value.application;
  return {
    application: {
      id: requireId(a.id), title: String(a.title), subject: String(a.subject ?? ''), className: String(a.className),
      questionCounts: Array.isArray(a.questionCounts) ? a.questionCounts.map(Number) : [],
      settings: parseSettings(a.settings), minExpectedPercent: optionalNumber(a.minExpectedPercent),
    },
    students: value.students.map((raw: unknown): StudentResult => {
      if (!isObject(raw) || typeof raw.studentName !== 'string') throw invalid();
      return {
        applicationStudentId: requireId(raw.applicationStudentId), studentName: raw.studentName,
        registration: raw.registration ?? null, number: raw.number ?? null,
        resultId: optionalId(raw.resultId), processingStatus: raw.processingStatus, publicationStatus: raw.publicationStatus,
        currentVersionId: optionalId(raw.currentVersionId), currentVersion: raw.currentVersion ?? null,
        counts: parseCounts(raw.counts), percent: optionalNumber(raw.percent), score: optionalNumber(raw.score), maxScore: optionalNumber(raw.maxScore),
        cardScanId: optionalId(raw.cardScanId), scansInReview: Number(raw.scansInReview ?? 0), publishable: raw.publishable === true,
        published: isObject(raw.published) ? { ...raw.published, versionId: requireId(raw.published.versionId) } as StudentResult['published'] : null,
        belowExpected: raw.belowExpected === true, followupStatus: raw.followupStatus ?? null,
      };
    }),
  };
}

export function parseResultDetail(value: unknown): ResultDetail {
  if (!isObject(value) || !Array.isArray(value.versions) || !Array.isArray(value.publications) || !Array.isArray(value.scans)) throw invalid();
  return {
    id: requireId(value.id), studentName: String(value.studentName),
    processingStatus: value.processingStatus, publicationStatus: value.publicationStatus,
    currentVersionId: optionalId(value.currentVersionId), publishedVersionId: optionalId(value.publishedVersionId),
    versions: value.versions.map((v: any) => ({
      ...v, id: requireId(v.id), items: Array.isArray(v.items) ? v.items : [], counts: parseCounts(v.counts)!,
      percent: optionalNumber(v.percent), score: optionalNumber(v.score), maxScore: optionalNumber(v.maxScore),
    })),
    changes: Array.isArray(value.changes) ? value.changes : [],
    publications: value.publications,
    scans: value.scans.map((s: any) => ({ ...s, id: requireId(s.id) })),
  };
}

export function parseAuthorize(value: unknown): AuthorizeResponse {
  if (!isObject(value) || !Array.isArray(value.items)) throw invalid();
  return { batchId: requireId(value.batchId), published: Number(value.published), items: value.items };
}

// Só entra no lote o que o professor está vendo: resultado sem pendências e
// com uma versão ainda não publicada.
export function authorizable(student: StudentResult): boolean {
  return student.publishable && !!student.resultId && !!student.currentVersionId && student.published?.versionId !== student.currentVersionId;
}

export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  not_scanned: 'Sem cartão corrigido', processing: 'Processando', needs_review: 'Revisão pendente', ready: 'Pronto para autorizar', failed: 'Falha na leitura',
};
export const PUBLICATION_LABEL: Record<PublicationStatus, string> = {
  unpublished: 'Não publicado', published: 'Publicado ao aluno', republish_required: 'Alterado depois da publicação · nova autorização necessária',
};
export const ITEM_LABEL: Record<string, string> = {
  correct: 'Correta', incorrect: 'Incorreta', blank: 'Em branco', invalid: 'Marcação inválida', review_pending: 'Leitura duvidosa · revisar',
  annulled: 'Anulada', manual_pending: 'Discursiva sem nota', manual_graded: 'Discursiva corrigida',
};
export const OUTCOME_LABEL: Record<AuthorizeOutcome, string> = {
  published: 'publicado(s)', already_published: 'já estava(m) publicado(s)', stale: 'mudou(aram) depois da conferência; atualize e confira de novo',
  pending_review: 'ainda tem(têm) pendência', not_found: 'não foi(foram) encontrado(s)',
};
export const RELEASE_LABEL: Record<ReleasePolicy, string> = {
  summary: 'Só o resumo (acertos e percentual)', answers: 'Resumo e respostas marcadas', answers_and_key: 'Respostas marcadas e gabarito',
};

export function countLine(counts: ResultCounts | null, percent: number | null): string {
  if (!counts) return 'Sem leitura';
  const parts = [`${counts.correct} acerto(s) de ${counts.valid}`, `${counts.incorrect} erro(s)`, `${counts.blank} em branco`];
  if (counts.invalid) parts.push(`${counts.invalid} inválida(s)`);
  if (counts.annulled) parts.push(`${counts.annulled} anulada(s)`);
  return `${parts.join(' · ')}${percent == null ? '' : ` · ${String(percent).replace('.', ',')}%`}`;
}

export function pendingLine(student: StudentResult): string | null {
  const notes = [];
  if (student.counts?.reviewPending) notes.push(`${student.counts.reviewPending} leitura(s) duvidosa(s)`);
  if (student.counts?.manualPending) notes.push(`${student.counts.manualPending} discursiva(s) sem nota`);
  if (student.scansInReview) notes.push('outro cartão aguardando decisão');
  return notes.length ? `Pendências: ${notes.join(', ')}` : null;
}

// "1, 3 5" -> [1, 3, 5]; recusa valores que não sejam números de questão.
export function parseQuestionList(text: string): number[] {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error('Informe os números das questões separados por vírgula.');
  return [...new Set(numbers)].sort((a, b) => a - b);
}
