import { authHeaders, credentials } from './platform-http';
import { parseSubmission } from './manual-contract';
import type { ManualPayload, Submission } from './manual-contract';
import { isPending, parseGrade, parseScan, parseStatus, requireId, reviewResponses } from './scan-contract';
import type { Candidate, Grade, Label, Scan } from './scan-contract';
import { parseApplicationResults, parseAuthorize, parseFollowups, parseResultDetail, parseSettings } from './results-contract';
import type { ApplicationResults, AuthorizeResponse, Followup, FollowupInput, ResultDetail, ResultSettings } from './results-contract';
import { essayId, parseEssayApplications, parseEssayEntry, parseEssayQueue } from './essay-contract';
import type { EssayApplication, EssayEntry, EssayQueueItem } from './essay-contract';

const IMAGE_PREFIX = 'data:image/jpeg;base64,';
export function jpegDataUrl(base64: string | undefined): string {
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new Error('Não foi possível preparar a foto para envio.');
  const dataUrl = `${IMAGE_PREFIX}${base64}`;
  // createScan accepts at most 8,000,000 characters including the prefix.
  if (dataUrl.length > 8_000_000) throw new Error('A foto ultrapassa o limite de envio. Refaça a captura com a folha bem enquadrada.');
  return dataUrl;
}
export class ScanApiError extends Error {
  constructor(message: string, public uncertain = false, public status?: number) { super(message); }
}
export function createScanClient(apiUrl: string, token: () => Promise<string | null>, fetcher: typeof fetch = fetch, identity?: { userId: string; institutionId: string }) {
  async function request(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
    let session;
    try { session = await token(); }
    catch (error) { if (error instanceof ScanApiError) throw error; throw new ScanApiError('Não foi possível acessar a sessão do aplicativo. Tente novamente.'); }
    if (!session) throw new ScanApiError('Sua sessão expirou. Volte e entre novamente.', false, 401);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 45_000);
    try {
      const response = await fetcher(`${apiUrl.replace(/\/$/, '')}${path}`, {
        ...options, signal: controller.signal, credentials,
        headers: { ...authHeaders(session), ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
      });
      let body;
      try { body = await response.json(); }
      catch { throw new ScanApiError(response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'A API retornou uma resposta inválida. Consulte o estado da leitura antes de repetir o envio.', options.method === 'POST' && (response.ok || response.status >= 500), response.status); }
      if (!response.ok) throw new ScanApiError(typeof body?.error === 'string' ? body.error : 'Não foi possível acessar a correção.', options.method === 'POST' && response.status >= 500, response.status);
      if (body?.data == null) throw new ScanApiError('A API não retornou os dados da leitura.', options.method === 'POST');
      return body.data;
    } catch (error) {
      if (error instanceof ScanApiError) throw error;
      if (signal?.aborted) throw error;
      throw new ScanApiError('Falha de conexão ou tempo de espera excedido. Tente consultar o estado novamente.', options.method === 'POST');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  async function readEssayEntry(entryId: string): Promise<EssayEntry> {
    const entry = parseEssayEntry(await request(`/api/essay-entries/${essayId(entryId)}`));
    if (entry.id !== entryId) throw new Error('A API retornou outra redação.');
    return entry;
  }
  return {
    async upload(imageDataUrl: string, clientScanId?: string, expectedApplicationId?: string): Promise<{ id: string; status: Scan['status'] }> {
      const data = await request('/api/card-scans', { method: 'POST', body: JSON.stringify({ imageDataUrl, clientScanId, ...(expectedApplicationId ? {expectedApplicationId:requireId(expectedApplicationId)} : {}), expectedInstitutionId: identity?.institutionId }) });
      try {
        const record = data as { id?: unknown; status?: unknown };
        return { id: requireId(record.id), status: parseStatus(record.status) };
      } catch { throw new ScanApiError('Não foi possível identificar o envio recebido pela API. Confira as leituras no portal antes de reenviar.', true); }
    },
    async capabilities(requireApplicationScope = false): Promise<void> {
      const data = await request('/api/mobile-sync') as { applicationScopedUploads?: boolean; version?: number; idempotentUploads?: boolean; manualReview?: boolean; userId?: string; institutionId?: string };
      if (identity && (data.userId !== identity.userId || data.institutionId !== identity.institutionId)) throw new ScanApiError('O contexto da conta mudou no servidor. Entre novamente antes de sincronizar.', false, 401);
      if(requireApplicationScope && data.applicationScopedUploads !== true)throw new ScanApiError('O servidor precisa ser atualizado para corrigir o cartão na aplicação selecionada. Sua foto continua salva no aparelho.',false,503);
      if (data.version !== 1 || !data.idempotentUploads || !data.manualReview) throw new ScanApiError('O servidor precisa ser atualizado para sincronizar as correções offline.', false, 503);
    },
    async catalog(path: '/api/educator-profile' | '/api/assessments' | '/api/classes' | '/api/assessment-applications'): Promise<unknown> { return request(path); },
    async submission(id: string): Promise<Submission> {
      const result = parseSubmission(await request(`/api/submissions/${requireId(id)}`));
      if (result.id !== id) throw new Error('A API retornou outra correção.');
      return result;
    },
    async manual(id: string, payload: ManualPayload, clientMutationId: string): Promise<Submission> {
      const result = parseSubmission(await request(`/api/submissions/${requireId(id)}/manual-review`, { method: 'POST', body: JSON.stringify({ ...payload, expectedInstitutionId: identity?.institutionId, clientMutationId: requireId(clientMutationId) }) }));
      if (result.id !== id) throw new Error('A API retornou outra correção.');
      return result;
    },
    async read(id: string, signal?: AbortSignal): Promise<Scan> {
      const scan = parseScan(await request(`/api/card-scans/${requireId(id)}`, {}, signal));
      if (scan.id !== id) throw new Error('A API retornou outra leitura.');
      return scan;
    },
    async grade(id: string, signal?: AbortSignal): Promise<Grade | null> {
      const data = await request('/api/card-scans', {}, signal);
      if (!Array.isArray(data)) throw new Error('Lista de resultados inválida.');
      const item = data.find((item) => item?.id === id);
      return item ? parseGrade(item) : null;
    },
    // Revisão e autorização de resultados: sempre online, sem cópia local.
    async applicationResults(applicationId: string): Promise<ApplicationResults> {
      return parseApplicationResults(await request(`/api/assessment-applications/${requireId(applicationId)}/results`));
    },
    async resultDetail(resultId: string): Promise<ResultDetail> {
      const detail = parseResultDetail(await request(`/api/assessment-results/${requireId(resultId)}`));
      if (detail.id !== resultId) throw new Error('A API retornou outro resultado.');
      return detail;
    },
    async authorize(applicationId: string, items: { resultId: string; versionId: string }[], clientMutationId: string): Promise<AuthorizeResponse> {
      return parseAuthorize(await request('/api/assessment-results/authorize', {
        method: 'POST',
        body: JSON.stringify({ applicationId: requireId(applicationId), clientMutationId: requireId(clientMutationId), items: items.map((item) => ({ resultId: requireId(item.resultId), versionId: requireId(item.versionId) })) }),
      }));
    },
    async resultSettings(applicationId: string): Promise<ResultSettings> {
      return parseSettings(await request(`/api/assessment-applications/${requireId(applicationId)}/result-settings`));
    },
    async saveResultSettings(applicationId: string, settings: Omit<ResultSettings, 'effectiveMinExpectedPercent' | 'recalculated'>): Promise<ResultSettings> {
      return parseSettings(await request(`/api/assessment-applications/${requireId(applicationId)}/result-settings`, { method: 'PUT', body: JSON.stringify(settings) }));
    },
    async saveFollowup(resultId: string, input: FollowupInput, clientMutationId: string): Promise<Followup[]> {
      const data = await request(`/api/assessment-results/${requireId(resultId)}/followups`, { method: 'POST', body: JSON.stringify({ ...input, clientMutationId: requireId(clientMutationId) }) }) as { history?: unknown };
      return parseFollowups(data.history);
    },
    // Fonte da foto original do cartão, com a sessão no cabeçalho: a imagem
    // não fica acessível por um link público.
    async scanImage(scanId: string): Promise<{ uri: string; headers: Record<string, string> }> {
      const session = await token();
      if (!session) throw new ScanApiError('Sua sessão expirou. Volte e entre novamente.', false, 401);
      return { uri: `${apiUrl.replace(/\/$/, '')}/api/card-scans/${requireId(scanId)}/image`, headers: authHeaders(session) };
    },
    // Redações: sempre online, sem cópia local (como no portal).
    async essayApplications(): Promise<EssayApplication[]> {
      return parseEssayApplications(await request('/api/essay-applications'));
    },
    async essayQueue(applicationId: string): Promise<EssayQueueItem[]> {
      const items: EssayQueueItem[] = [];
      // A fila vem paginada (30 por página); uma turma cabe em poucas páginas.
      for (let page = 1; page <= 20; page++) {
        const result = parseEssayQueue(await request(`/api/essay-entries?applicationId=${essayId(applicationId)}&page=${page}`));
        items.push(...result.items);
        if (page >= result.pages) break;
      }
      return items;
    },
    essayEntry: readEssayEntry,
    async essayAction(entryId: string, action: 'receive' | 'ocr' | 'ai-grading' | 'grading/reopen' | 'absent' | 'publish' | 'transcription' | 'grading' | 'grading/finalize', body?: object): Promise<EssayEntry> {
      const method = action === 'transcription' || action === 'grading' ? 'PUT' : 'POST';
      const data = await request(`/api/essay-entries/${essayId(entryId)}/${action}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      // ocr, ai-grading e absent não devolvem a produção inteira.
      return data && typeof data === 'object' && 'status' in data && 'student' in data ? parseEssayEntry(data) : readEssayEntry(entryId);
    },
    async addEssayPage(entryId: string, dataUrl: string): Promise<void> {
      await request(`/api/essay-entries/${essayId(entryId)}/files`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
    },
    async removeEssayPage(entryId: string, fileId: string): Promise<void> {
      await request(`/api/essay-entries/${essayId(entryId)}/files/${essayId(fileId)}`, { method: 'DELETE' });
    },
    async essayPageImage(fileId: string): Promise<{ uri: string; headers: Record<string, string> }> {
      const session = await token();
      if (!session) throw new ScanApiError('Sua sessão expirou. Volte e entre novamente.', false, 401);
      return { uri: `${apiUrl.replace(/\/$/, '')}/api/essay-files/${essayId(fileId)}`, headers: authHeaders(session) };
    },
    async retry(id: string): Promise<void> {
      await request(`/api/card-scans/${requireId(id)}/retry`, { method: 'POST' });
    },
    async confirm(id: string, candidate: Candidate, answers: Record<number, Label[]>, clientMutationId?: string): Promise<Grade> {
      const grade = parseGrade(await request(`/api/card-scans/${requireId(id)}/confirm`, {
        method: 'POST', body: JSON.stringify({ expectedInstitutionId: identity?.institutionId, clientMutationId, applicationStudentId: requireId(candidate.id), responses: reviewResponses(candidate, answers) }),
      }));
      if (grade.id !== id) throw new Error('A API retornou outra correção.');
      return grade;
    },
  };
}
export type ScanClient = ReturnType<typeof createScanClient>;
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Acompanhamento interrompido.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function watchScan(client: Pick<ScanClient, 'read'>, id: string, options: {
  signal: AbortSignal;
  onScan: (scan: Scan) => void;
  maxAttempts?: number;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<Scan | null> {
  for (let attempt = 0; attempt < (options.maxAttempts ?? 40); attempt++) {
    if (options.signal.aborted) return null;
    const scan = await client.read(id, options.signal);
    if (options.signal.aborted) return null;
    options.onScan(scan);
    if (!isPending(scan.status)) return scan;
    if (attempt + 1 < (options.maxAttempts ?? 40)) await (options.delay ?? wait)(3000, options.signal);
  }
  return null;
}
