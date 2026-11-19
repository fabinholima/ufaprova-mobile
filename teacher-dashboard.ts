import type { CorrectionApplication } from './application-contract';
import type { LocalRecord, Operation } from './offline-store';

// Digitalização que espera uma ação do professor: envio bloqueado, marcações
// para conferir, leitura que falhou ou questões discursivas sem nota.
export function needsAttention(record: LocalRecord, operations: Operation[]): boolean {
  if (operations.some(op => op.recordId === record.id && op.state === 'blocked')) return true;
  if (operations.some(op => op.recordId === record.id)) return false;
  const status = record.scan?.status;
  return status === 'review' || status === 'failed' || (status === 'completed' && !!record.grade?.requiresManualReview);
}

export type ApplicationProgress = {
  // Cartões que o servidor já corrigiu, de quantos alunos.
  completed: number;
  students: number;
  // Fotos desta aplicação neste aparelho que ainda não chegaram ao servidor.
  waiting: number;
  percent: number;
};
export function applicationProgress(application: CorrectionApplication, records: LocalRecord[]): ApplicationProgress {
  const waiting = records.filter(record => record.sheet.applicationId === application.id && !record.remoteId).length;
  const completed = Math.min(Number(application.completed) || 0, application.students);
  return { completed, students: application.students, waiting, percent: application.students ? Math.round((completed / application.students) * 100) : 0 };
}

const statusOrder: Record<CorrectionApplication['status'], number> = { open: 0, scheduled: 1, closed: 2, cancelled: 3 };
// Abertas primeiro; depois agendadas, da data mais próxima para a mais distante; encerradas por último.
export function sortApplications(applications: CorrectionApplication[]): CorrectionApplication[] {
  const time = (value?: string | null) => (value ? Date.parse(value) || Infinity : Infinity);
  return [...applications].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || time(a.scheduledAt) - time(b.scheduledAt) || a.title.localeCompare(b.title, 'pt-BR'));
}
