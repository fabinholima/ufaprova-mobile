import { ScanApiError } from './scan-api';
import type { ScanClient } from './scan-api';
import type { Confirmation, LocalRecord, OfflineStore, QueuedManual } from './offline-store';
import { parseGrade } from './scan-contract';
export type SyncReport = { sent: number; blocked: number; pending: number; authExpired: boolean; error: string | null };
export function createSynchronizer(store: OfflineStore, client: ScanClient, owner: string, now = Date.now) {
  let running: Promise<SyncReport> | null = null;
  async function execute(force: boolean): Promise<SyncReport> {
    const report: SyncReport = { sent: 0, blocked: 0, pending: 0, authExpired: false, error: null };
    try { await client.capabilities(); }
    catch (error) {
      report.error = error instanceof ScanApiError && error.status === 404 ? 'O servidor ainda não recebeu a atualização de sincronização móvel. Seus dados continuam salvos neste aparelho.' : error instanceof Error ? error.message : 'Não foi possível verificar a sincronização.';
      report.authExpired = error instanceof ScanApiError && error.status === 401;
      report.pending = (await store.operations(owner)).length;
      return report;
    }
    for (const operation of await store.operations(owner)) {
      if (operation.state !== 'pending' || (!force && operation.nextAttempt > now())) continue;
      // A manual sync may skip a retry delay, while never changing an immutable operation payload.
      if (force && operation.nextAttempt > now()) await store.fail(owner, operation.id, false, operation.error ?? '', 0);
      if (!await store.claim(owner, operation.id)) continue;
      try {
        const record = await store.get(owner, operation.recordId);
        if (!record) throw new ScanApiError('Digitalização local não encontrada.', false, 422);
        if (operation.kind === 'upload') {
          const created = await client.upload(record.imageDataUrl, record.id);
          await store.acknowledge(owner, operation.id, record.id, { remoteId: created.id });
        } else if (operation.kind === 'confirm') {
          if (!record.remoteId) throw new ScanApiError('A folha ainda não foi enviada.', false, 422);
          const payload = operation.payload as Confirmation;
          const grade = await client.confirm(record.remoteId, payload.candidate, payload.answers, operation.id);
          await store.acknowledge(owner, operation.id, record.id, { grade, scan: record.scan ? { ...record.scan, status: 'completed', applicationStudentId: payload.candidate.id, submissionId: grade.submissionId, score: grade.score, maxScore: grade.maxScore, requiresManualReview: grade.requiresManualReview } : null }, 'objective');
        } else {
          if (!record.submission) throw new ScanApiError('Carregue o resultado antes de corrigir as discursivas.', false, 422);
          const payload = operation.payload as QueuedManual;
          if (payload.submissionId !== record.submission.id) throw new ScanApiError('A identificação desta folha mudou no servidor. Atualize os dados e confira o aluno antes de salvar novamente.', false, 409);
          const submission = await client.manual(payload.submissionId, { expectedRevision: payload.expectedRevision, reviews: payload.reviews }, operation.id);
          await store.acknowledge(owner, operation.id, record.id, { submission, grade: { id: record.remoteId!, submissionId: submission.id, score: submission.score, maxScore: submission.maxScore, requiresManualReview: submission.requiresManualReview } }, 'manual');
        }
        report.sent++;
      } catch (error) {
        const status = error instanceof ScanApiError ? error.status : undefined;
        const message = error instanceof Error ? error.message : 'Não foi possível sincronizar.';
        const blocked = status != null && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
        const nextAttempt = now() + Math.min(300_000, 5_000 * 2 ** Math.min(operation.attempts, 6));
        await store.fail(owner, operation.id, blocked, message, nextAttempt);
        report.error = message;
        if (blocked) report.blocked++;
        if (status === 401) { report.authExpired = true; break; }
        if (!blocked) break;
      }
    }
    if (!report.authExpired) {
      for (const record of await store.list(owner)) {
        if (!record.remoteId) continue;
        // Finished records are refreshed on demand; queued/reviewed cards stay up to date.
        if (!force && record.scan?.status === 'completed' && record.submission) continue;
        try { await refreshRecord(store, client, record); }
        catch (error) {
          report.error = error instanceof Error ? error.message : 'Não foi possível consultar a leitura.';
          if (error instanceof ScanApiError && error.status === 401) { report.authExpired = true; break; }
        }
      }
    }
    report.pending = (await store.operations(owner)).length;
    return report;
  }
  return (force = false) => {
    if (!running) running = execute(force).finally(() => { running = null; });
    return running;
  };
}
export async function refreshRecord(store: OfflineStore, client: ScanClient, record: LocalRecord): Promise<void> {
  if (!record.remoteId) return;
  const scan = await client.read(record.remoteId);
  const grade = scan.submissionId ? parseGrade({ ...scan, id: record.remoteId }) : null;
  await store.update(record.owner, record.id, { scan, grade });
  if (scan.submissionId && (!record.submission || record.submission.id !== scan.submissionId || scan.revision !== record.submission.revision)) {
    await store.update(record.owner, record.id, { submission: await client.submission(scan.submissionId) });
  }
}
