import type { CapturedSheet } from './CaptureScreen';
import type { Confirmation, LocalRecord, OfflineStore, Operation, QueuedManual } from './offline-store';

// Versão do navegador do armazenamento local: as mesmas regras do SQLite do
// aplicativo, mas tudo fica na memória da aba e some ao fechá-la. Fotos dos
// cartões e listas da escola não vão para IndexedDB nem para o cache offline.
type Changes = Partial<Pick<LocalRecord, 'remoteId' | 'scan' | 'grade' | 'submission'>>;
type Queued = Operation & { createdAt: number };

export function createMemoryStore(uuid: () => string, now = Date.now): OfflineStore {
  const cached = new Map<string, unknown>(), drafts = new Map<string, unknown>();
  const records = new Map<string, LocalRecord & { order: number }>(), outbox = new Map<string, Queued>();
  let order = 0;
  const key = (...parts: string[]) => JSON.stringify(parts);
  const copy = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
  const owned = (owner: string, id: string) => { const row = records.get(id); return row?.owner === owner ? row : null; };
  const record = ({ order: _order, ...row }: LocalRecord & { order: number }): LocalRecord => copy(row);
  const operation = ({ createdAt: _createdAt, ...row }: Queued): Operation => copy(row);
  function apply(row: LocalRecord, changes: Changes) {
    for (const [field, value] of Object.entries(changes)) {
      if (!['remoteId', 'scan', 'grade', 'submission'].includes(field)) throw new Error('Campo local inválido.');
      (row as Record<string, unknown>)[field] = value == null ? null : copy(value);
    }
  }
  function queue(owner: string, recordId: string, kind: Operation['kind'], payload: Confirmation | QueuedManual | null) {
    const id = uuid();
    outbox.set(id, { id, owner, recordId, kind, payload: copy(payload), state: 'pending', attempts: 0, nextAttempt: 0, error: null, createdAt: now() });
  }
  const store = {
    async initialize() {},
    async cache<T>(owner: string, name: string): Promise<T | null> { return cached.has(key(owner, name)) ? copy(cached.get(key(owner, name)) as T) : null; },
    async putCache(owner: string, name: string, value: unknown) { cached.set(key(owner, name), copy(value)); },
    async create(owner: string, sheet: CapturedSheet, imageDataUrl: string): Promise<string> {
      const id = uuid();
      const savedSheet = { ...sheet, photo: { uri: `local:${id}`, width: sheet.photo.width, height: sheet.photo.height } };
      // Como no SQLite, a foto original é substituída pela referência local.
      records.set(id, { id, owner, sheet: copy(savedSheet) as CapturedSheet, imageDataUrl, remoteId: null, scan: null, grade: null, submission: null, createdAt: now(), order: order++ });
      queue(owner, id, 'upload', null);
      return id;
    },
    async list(owner: string) { return [...records.values()].filter(row => row.owner === owner).sort((a, b) => b.createdAt - a.createdAt || b.order - a.order).map(record); },
    async get(owner: string, id: string) { const row = owned(owner, id); return row ? record(row) : null; },
    async operations(owner: string) { return [...outbox.values()].filter(row => row.owner === owner).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(operation); },
    async enqueue(owner: string, recordId: string, kind: 'confirm' | 'manual', payload: Confirmation | QueuedManual) {
      if (!owned(owner, recordId)) throw new Error('Digitalização local não encontrada para esta conta.');
      const existing = [...outbox.values()].find(row => row.owner === owner && row.recordId === recordId && row.kind === kind);
      if (existing && existing.state !== 'blocked') throw new Error('Esta correção já está aguardando sincronização.');
      if (existing) outbox.delete(existing.id);
      queue(owner, recordId, kind, payload);
    },
    async draft<T>(owner: string, recordId: string, kind: string): Promise<T | null> { return drafts.has(key(owner, recordId, kind)) ? copy(drafts.get(key(owner, recordId, kind)) as T) : null; },
    async saveDraft(owner: string, recordId: string, kind: string, value: unknown) { if (owned(owner, recordId)) drafts.set(key(owner, recordId, kind), copy(value)); },
    async claim(owner: string, id: string) {
      const row = outbox.get(id);
      if (!row || row.owner !== owner || row.state !== 'pending' || row.nextAttempt > now()) return false;
      row.state = 'sending'; row.attempts += 1;
      return true;
    },
    async fail(owner: string, id: string, blocked: boolean, error: string, nextAttempt: number) {
      const row = outbox.get(id);
      if (row?.owner === owner) Object.assign(row, { state: blocked ? 'blocked' : 'pending', error, nextAttempt });
    },
    async retryBlocked(owner: string, id: string) {
      const row = outbox.get(id);
      if (row?.owner === owner && row.state === 'blocked' && row.kind === 'upload') Object.assign(row, { state: 'pending', error: null, nextAttempt: 0 });
    },
    async update(owner: string, id: string, changes: Changes) { const row = owned(owner, id); if (row) apply(row, changes); },
    async acknowledge(owner: string, id: string, recordId: string, changes: Changes, clearDraftKind?: string) {
      const row = owned(owner, recordId);
      if (row) apply(row, changes);
      if (outbox.get(id)?.owner === owner) outbox.delete(id);
      if (clearDraftKind) drafts.delete(key(owner, recordId, clearDraftKind));
    },
  };
  return store as OfflineStore;
}
