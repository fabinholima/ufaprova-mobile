// Contrato da correção de redações (API: services/api/essay-correction.mjs).
// A nota é sempre calculada no servidor; aqui só montamos o pedido e
// conferimos os dados recebidos.

export type EntryStatus =
  | 'pending' | 'draft' | 'submitted' | 'awaiting_ocr' | 'awaiting_ai' | 'awaiting_grading'
  | 'grading' | 'awaiting_approval' | 'published' | 'returned' | 'absent';

export const STATUS_LABEL: Record<EntryStatus, string> = {
  pending: 'Sem entrega',
  draft: 'Páginas sem recebimento',
  submitted: 'Recebida',
  awaiting_ocr: 'Transcrevendo',
  awaiting_ai: 'Aguardando sugestão da IA',
  awaiting_grading: 'Para corrigir',
  grading: 'Correção em andamento',
  awaiting_approval: 'Pronta para publicar',
  published: 'Nota publicada',
  returned: 'Devolvida ao aluno',
  absent: 'Ausente',
};

export type EssayApplication = {
  id: string;
  title: string;
  theme: string | null;
  className: string;
  status: string;
  appliedOn: string | null;
  dueAt: string | null;
  studentsCount: number;
  submittedCount: number;
  publishedCount: number;
  awaitingApprovalCount: number;
  rubricName: string | null;
};

export type EssayQueueItem = {
  id: string;
  status: EntryStatus;
  studentName: string;
  studentNumber: number | null;
  teacherTotal: number | null;
  aiTotal: number | null;
  maxScore: number | null;
};

export type Level = { score: number; descriptor: string };
export type Criterion = { id: string; numeral: string; title: string; maxScore: number; levels: Level[] };
export type Rubric = { name: string; maxScore: number; criteria: Criterion[]; annulmentReasons: { id: string; label: string }[] };

export type ScoreItem = {
  criterionId: string;
  score: number | null;
  observations: Record<string, true | string>;
  note: string;
  evidence: string[];
  feedback: string;
};
export type Grading = {
  id: string;
  kind: 'ai' | 'teacher';
  status: string;
  scores: ScoreItem[];
  annulmentReason: string;
  total: number | null;
  maxScore: number | null;
  comments: string;
  strengths: string;
  improvements: string;
  rewriteSuggestions: string;
  basedOnGradingId: string | null;
  revision: number | null;
};
export type EssayFile = { id: string; position: number; mimeType: string };
export type Job = { kind: string; status: string; error: string | null };

export type EssayEntry = {
  id: string;
  applicationId: string;
  status: EntryStatus;
  studentName: string;
  className: string;
  yearLocked: boolean;
  aiAvailable: boolean;
  prompt: { title: string; theme: string | null; productionCommand: string | null };
  rubric: Rubric | null;
  submission: { id: string; mode: string; status: string; typedText: string | null; files: EssayFile[] } | null;
  transcription: { text: string; source: string; needsReview: boolean; version: number } | null;
  aiGrading: Grading | null;
  teacherGrading: Grading | null;
  jobs: Job[];
};

export type GradingInput = {
  scores: ScoreItem[];
  annulmentReason: string;
  comments: string;
  strengths: string;
  improvements: string;
  rewriteSuggestions: string;
  basedOnGradingId?: string | null;
  revision?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function essayId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Identificador de redação inválido.');
  return value;
}
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown) => (typeof value === 'string' && value ? value : null);
const num = (value: unknown) => {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const status = (value: unknown): EntryStatus => {
  if (typeof value === 'string' && value in STATUS_LABEL) return value as EntryStatus;
  throw new Error('A API retornou um estado de redação desconhecido.');
};

export function parseEssayApplications(data: unknown): EssayApplication[] {
  if (!Array.isArray(data)) throw new Error('Lista de redações inválida.');
  return data.map((raw) => {
    const row = obj(raw);
    return {
      id: essayId(row.id),
      title: str(row.promptTitle) || 'Redação',
      theme: strOrNull(row.promptTheme),
      className: [str(row.classGrade), str(row.className)].filter(Boolean).join(' — '),
      status: str(row.status),
      appliedOn: strOrNull(row.appliedOn),
      dueAt: strOrNull(row.dueAt),
      studentsCount: num(row.studentsCount) ?? 0,
      submittedCount: num(row.submittedCount) ?? 0,
      publishedCount: num(row.publishedCount) ?? 0,
      awaitingApprovalCount: num(row.awaitingApprovalCount) ?? 0,
      rubricName: strOrNull(row.rubricName),
    };
  }).filter((item) => item.status !== 'cancelled');
}

export function parseEssayQueue(data: unknown): { items: EssayQueueItem[]; pages: number } {
  const page = obj(data);
  if (!Array.isArray(page.items)) throw new Error('Fila de redações inválida.');
  return {
    pages: num(page.pages) ?? 1,
    items: page.items.map((raw) => {
      const row = obj(raw);
      return {
        id: essayId(row.id), status: status(row.status), studentName: str(row.studentName) || 'Aluno',
        studentNumber: num(row.studentNumber), teacherTotal: num(row.teacherTotal), aiTotal: num(row.aiTotal), maxScore: num(row.maxScore),
      };
    }),
  };
}

function parseScore(raw: unknown): ScoreItem {
  const row = obj(raw);
  const observations: Record<string, true | string> = {};
  for (const [key, value] of Object.entries(obj(row.observations))) if (value === true || typeof value === 'string') observations[key] = value;
  return {
    criterionId: str(row.criterionId), score: num(row.score), observations,
    note: str(row.note), evidence: list(row.evidence).filter((item): item is string => typeof item === 'string'), feedback: str(row.feedback),
  };
}
function parseGrading(raw: unknown): Grading | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = obj(raw);
  return {
    id: essayId(row.id), kind: row.kind === 'ai' ? 'ai' : 'teacher', status: str(row.status),
    scores: list(row.scores).map(parseScore), annulmentReason: str(row.annulmentReason),
    total: num(row.total), maxScore: num(row.maxScore), comments: str(row.comments), strengths: str(row.strengths),
    improvements: str(row.improvements), rewriteSuggestions: str(row.rewriteSuggestions),
    basedOnGradingId: strOrNull(row.basedOnGradingId), revision: num(row.revision),
  };
}
function parseRubric(raw: unknown): Rubric | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = obj(raw);
  const criteria = list(row.criteria).map((item) => {
    const c = obj(item);
    return {
      id: str(c.id), numeral: str(c.numeral) || str(c.id), title: str(c.title), maxScore: num(c.maxScore) ?? 0,
      levels: list(c.levels).map((level) => ({ score: num(obj(level).score) ?? 0, descriptor: str(obj(level).descriptor) })),
    };
  }).filter((c) => c.id);
  return {
    name: str(row.name), criteria,
    maxScore: num(row.maxScore) ?? criteria.reduce((sum, c) => sum + c.maxScore, 0),
    annulmentReasons: list(row.annulmentReasons).map((r) => ({ id: str(obj(r).id), label: str(obj(r).label) || str(obj(r).id) })).filter((r) => r.id),
  };
}

export function parseEssayEntry(data: unknown): EssayEntry {
  const row = obj(data);
  const student = obj(row.student), prompt = obj(row.prompt), submission = row.submission ? obj(row.submission) : null;
  const transcriptions = list(row.transcriptions).map(obj);
  const latest = transcriptions[0];
  return {
    id: essayId(row.id),
    applicationId: essayId(row.applicationId),
    status: status(row.status),
    studentName: str(student.name) || 'Aluno',
    className: str(row.className),
    yearLocked: row.yearLocked === true,
    aiAvailable: row.aiAvailable === true,
    prompt: { title: str(prompt.title) || 'Redação', theme: strOrNull(prompt.theme), productionCommand: strOrNull(prompt.productionCommand) },
    rubric: parseRubric(row.rubric),
    submission: submission ? {
      id: essayId(submission.id), mode: str(submission.mode), status: str(submission.status), typedText: strOrNull(submission.typedText),
      files: list(submission.files).map((f) => ({ id: essayId(obj(f).id), position: num(obj(f).position) ?? 0, mimeType: str(obj(f).mimeType) })),
    } : null,
    transcription: latest ? { text: str(latest.text), source: str(latest.source), needsReview: latest.needsReview === true, version: num(latest.version) ?? 1 } : null,
    aiGrading: parseGrading(row.aiGrading),
    teacherGrading: parseGrading(row.teacherGrading),
    jobs: list(row.jobs).map((j) => ({ kind: str(obj(j).kind), status: str(obj(j).status), error: strOrNull(obj(j).error) })),
  };
}

// O que o professor pode fazer em cada estado (mesmas regras do servidor).
export const canAddPages = (entry: EssayEntry) =>
  !entry.yearLocked && (entry.status === 'pending' || entry.status === 'returned' || entry.status === 'absent'
    || (entry.status === 'draft' && entry.submission?.mode === 'teacher_scan'));
export const draftPages = (entry: EssayEntry) =>
  entry.submission?.status === 'draft' && entry.submission.mode === 'teacher_scan' ? entry.submission.files : [];
export const isReceived = (entry: EssayEntry) => entry.submission?.status === 'submitted';
export const canGrade = (entry: EssayEntry) =>
  !entry.yearLocked && isReceived(entry) && !['awaiting_approval', 'published'].includes(entry.status);
export const canEditTranscription = (entry: EssayEntry) => canGrade(entry) && entry.submission?.mode !== 'typed';
export const runningJob = (entry: EssayEntry) =>
  entry.jobs.find((job) => job.status === 'queued' || job.status === 'running') ?? null;
export const failedJob = (entry: EssayEntry) => entry.jobs.find((job) => job.status === 'failed') ?? null;
// Fila: primeiro o que dá para corrigir agora.
export const needsTeacher = (status: EntryStatus) =>
  ['awaiting_grading', 'grading', 'awaiting_approval', 'submitted', 'draft'].includes(status);

/**
 * Pedido de correção a partir da escolha de níveis. Mantém o que o portal já
 * gravou em cada competência (marcações, evidências, devolutiva), porque o
 * servidor substitui a lista inteira.
 */
export function gradingInput(entry: EssayEntry, picked: Record<string, number | null>, extra: { comments: string; annulmentReason: string; basedOnGradingId?: string | null }): GradingInput {
  const current = entry.teacherGrading;
  const criteria = entry.rubric?.criteria ?? [];
  return {
    scores: criteria.map((criterion) => {
      const saved = current?.scores.find((item) => item.criterionId === criterion.id);
      const score = Object.hasOwn(picked, criterion.id) ? picked[criterion.id] : saved?.score ?? null;
      return { criterionId: criterion.id, observations: saved?.observations ?? {}, note: saved?.note ?? '', evidence: saved?.evidence ?? [], feedback: saved?.feedback ?? '', score };
    }),
    annulmentReason: extra.annulmentReason,
    comments: extra.comments,
    strengths: current?.strengths ?? '',
    improvements: current?.improvements ?? '',
    rewriteSuggestions: current?.rewriteSuggestions ?? '',
    basedOnGradingId: extra.basedOnGradingId ?? current?.basedOnGradingId ?? null,
    ...(current?.revision ? { revision: current.revision } : {}),
  };
}

/** Soma das competências escolhidas; null enquanto faltar alguma. */
export function totalOf(rubric: Rubric | null, picked: Record<string, number | null>, annulled: boolean): { total: number | null; partial: number } {
  const criteria = rubric?.criteria ?? [];
  if (annulled) return { total: 0, partial: 0 };
  const values = criteria.map((c) => picked[c.id] ?? null);
  const partial = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return { total: criteria.length && values.every((v) => v !== null) ? partial : null, partial };
}

/** Níveis da sugestão da IA, só com valores válidos no modelo. */
export function aiPicks(entry: EssayEntry): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const criterion of entry.rubric?.criteria ?? []) {
    const score = entry.aiGrading?.scores.find((item) => item.criterionId === criterion.id)?.score;
    if (score != null && (!criterion.levels.length || criterion.levels.some((level) => level.score === score))) picks[criterion.id] = score;
  }
  return picks;
}

// ---------- Área do aluno ----------

export type StudentEssay = {
  id: string; title: string; theme: string | null; className: string; appliedOn: string | null; dueAt: string | null;
  submissionStatus: string; canWrite: boolean; total: number | null; maxScore: number | null;
};
export type StudentEssayResult = {
  total: number | null; maxScore: number | null; annulmentReason: string; comments: string; strengths: string; improvements: string; rewriteSuggestions: string;
  criteria: { id: string; numeral: string; title: string; maxScore: number; score: number | null; level: string; feedback: string }[];
};
export type StudentEssayDetail = {
  id: string; status: string; className: string; teacherName: string | null; canWrite: boolean;
  prompt: { title: string; theme: string | null; productionCommand: string | null };
  result: StudentEssayResult | null;
};

export const STUDENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando sua entrega', draft: 'Rascunho em andamento', returned: 'Devolvida para reescrita', absent: 'Ausência registrada',
  published: 'Correção publicada',
};
export const studentStatus = (status: string) => STUDENT_STATUS_LABEL[status] ?? 'Entregue · em correção';

export function parseStudentEssays(data: unknown): StudentEssay[] {
  if (!Array.isArray(data)) throw new Error('Lista de redações inválida.');
  return data.map((raw) => {
    const row = obj(raw);
    return {
      id: essayId(row.id), title: str(row.title) || 'Redação', theme: strOrNull(row.theme), className: str(row.className),
      appliedOn: strOrNull(row.appliedOn), dueAt: strOrNull(row.dueAt), submissionStatus: str(row.submissionStatus),
      canWrite: row.canWrite === true, total: num(row.total), maxScore: num(row.maxScore),
    };
  });
}

export function parseStudentEssay(data: unknown): StudentEssayDetail {
  const row = obj(data), prompt = obj(row.prompt);
  const result = row.result ? obj(row.result) : null;
  return {
    id: essayId(row.id), status: str(row.status), className: str(row.className), teacherName: strOrNull(row.teacherName), canWrite: row.canWrite === true,
    prompt: { title: str(prompt.title) || 'Redação', theme: strOrNull(prompt.theme), productionCommand: strOrNull(prompt.productionCommand) },
    result: result ? {
      total: num(result.total), maxScore: num(result.maxScore), annulmentReason: str(result.annulmentReason), comments: str(result.comments),
      strengths: str(result.strengths), improvements: str(result.improvements), rewriteSuggestions: str(result.rewriteSuggestions),
      criteria: list(result.criteria).map((c) => {
        const item = obj(c);
        return { id: str(item.id), numeral: str(item.numeral), title: str(item.title), maxScore: num(item.maxScore) ?? 0, score: num(item.score), level: str(item.level), feedback: str(item.feedback) };
      }),
    } : null,
  };
}
