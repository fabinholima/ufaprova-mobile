import type { CapturedSheet } from './CaptureScreen';
import type { Candidate, Grade, Label, Scan } from './scan-contract';
import type { ManualDraft, ManualPayload, Submission } from './manual-contract';
type Param = string | number | null;
export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Param[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]>;
  withExclusiveTransactionAsync(task: (db: Database) => Promise<void>): Promise<void>;
}
export type LocalRecord = {
  id: string; owner: string; sheet: CapturedSheet; imageDataUrl: string;
  remoteId: string | null; scan: Scan | null; grade: Grade | null; submission: Submission | null;
  createdAt: number;
};
export type QueuedManual = ManualPayload & { submissionId: string };
export type Confirmation = { candidate: Candidate; answers: Record<number, Label[]> };
export type Operation = { id: string; owner: string; recordId: string; kind: 'upload' | 'confirm' | 'manual'; payload: Confirmation | QueuedManual | null; state: 'pending' | 'sending' | 'blocked'; attempts: number; nextAttempt: number; error: string | null };
export const offlineSchema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS mobile_cache(owner TEXT NOT NULL, key TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(owner,key));
CREATE TABLE IF NOT EXISTS local_records(id TEXT PRIMARY KEY,owner TEXT NOT NULL,sheet TEXT NOT NULL,image_data TEXT NOT NULL,remote_id TEXT,scan TEXT,grade TEXT,submission TEXT,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS local_records_owner ON local_records(owner,created_at);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,owner TEXT NOT NULL,record_id TEXT NOT NULL REFERENCES local_records(id) ON DELETE CASCADE,kind TEXT NOT NULL,payload TEXT,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,error TEXT,created_at INTEGER NOT NULL,UNIQUE(owner,record_id,kind));
CREATE TABLE IF NOT EXISTS local_drafts(owner TEXT NOT NULL,record_id TEXT NOT NULL REFERENCES local_records(id) ON DELETE CASCADE,kind TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(owner,record_id,kind));
PRAGMA user_version=1;
`;
const decode = <T>(value: string | null): T | null => value == null ? null : JSON.parse(value) as T;
function record(row: any): LocalRecord { return { id: row.id, owner: row.owner, sheet: JSON.parse(row.sheet), imageDataUrl: row.image_data, remoteId: row.remote_id, scan: decode(row.scan), grade: decode(row.grade), submission: decode(row.submission), createdAt: row.created_at }; }
function operation(row: any): Operation { return { id: row.id, owner: row.owner, recordId: row.record_id, kind: row.kind, payload: decode(row.payload), state: row.state, attempts: row.attempts, nextAttempt: row.next_attempt, error: row.error }; }
export function createOfflineStore(db: Database, uuid: () => string, now = Date.now) {
  const methods = {
    async initialize() { const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'); if ((version?.user_version ?? 0) > 1) throw new Error('Os dados locais exigem uma versão mais recente do aplicativo.'); await db.execAsync(offlineSchema); await db.runAsync("UPDATE outbox SET state='pending' WHERE state='sending'"); },
    async cache<T>(owner: string, key: string): Promise<T | null> { const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM mobile_cache WHERE owner=? AND key=?', owner, key); return row ? JSON.parse(row.json) : null; },
    async putCache(owner: string, key: string, value: unknown) { await db.runAsync('INSERT INTO mobile_cache(owner,key,json) VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET json=excluded.json', owner, key, JSON.stringify(value)); },
    async create(owner: string, sheet: CapturedSheet, imageDataUrl: string): Promise<string> {
      const id = uuid();
      const savedSheet = { ...sheet, photo: { uri: `local:${id}`, width: sheet.photo.width, height: sheet.photo.height } };
      await db.withExclusiveTransactionAsync(async tx => {
        await tx.runAsync('INSERT INTO local_records(id,owner,sheet,image_data,created_at) VALUES(?,?,?,?,?)', id, owner, JSON.stringify(savedSheet), imageDataUrl, now());
        await tx.runAsync('INSERT INTO outbox(id,owner,record_id,kind,created_at) VALUES(?,?,?,?,?)', uuid(), owner, id, 'upload', now());
      });
      return id;
    },
    async list(owner: string): Promise<LocalRecord[]> { return (await db.getAllAsync('SELECT * FROM local_records WHERE owner=? ORDER BY created_at DESC', owner)).map(record); },
    async get(owner: string, id: string): Promise<LocalRecord | null> { const row = await db.getFirstAsync('SELECT * FROM local_records WHERE owner=? AND id=?', owner, id); return row ? record(row) : null; },
    async operations(owner: string): Promise<Operation[]> { return (await db.getAllAsync('SELECT * FROM outbox WHERE owner=? ORDER BY created_at,id', owner)).map(operation); },
    async enqueue(owner: string, recordId: string, kind: 'confirm' | 'manual', payload: Confirmation | QueuedManual): Promise<void> {
      await db.withExclusiveTransactionAsync(async tx => {
        if (!await tx.getFirstAsync('SELECT id FROM local_records WHERE id=? AND owner=?', recordId, owner)) throw new Error('Digitalização local não encontrada para esta conta.');
        const existing = await tx.getFirstAsync<{ state: string }>('SELECT state FROM outbox WHERE owner=? AND record_id=? AND kind=?', owner, recordId, kind);
        if (existing && existing.state !== 'blocked') throw new Error('Esta correção já está aguardando sincronização.');
        await tx.runAsync("DELETE FROM outbox WHERE owner=? AND record_id=? AND kind=? AND state='blocked'", owner, recordId, kind);
        await tx.runAsync('INSERT INTO outbox(id,owner,record_id,kind,payload,created_at) VALUES(?,?,?,?,?,?)', uuid(), owner, recordId, kind, JSON.stringify(payload), now());
      });
    },
    async draft<T = ManualDraft>(owner: string, recordId: string, kind: string): Promise<T | null> { const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM local_drafts WHERE owner=? AND record_id=? AND kind=?', owner, recordId, kind); return row ? JSON.parse(row.json) : null; },
    async saveDraft(owner: string, recordId: string, kind: string, value: unknown) { await db.runAsync('INSERT INTO local_drafts(owner,record_id,kind,json) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM local_records WHERE id=? AND owner=?) ON CONFLICT(owner,record_id,kind) DO UPDATE SET json=excluded.json', owner, recordId, kind, JSON.stringify(value), recordId, owner); },
    async claim(owner: string, id: string): Promise<boolean> { return (await db.runAsync("UPDATE outbox SET state='sending',attempts=attempts+1 WHERE owner=? AND id=? AND state='pending' AND next_attempt<=?", owner, id, now())).changes === 1; },
    async fail(owner: string, id: string, blocked: boolean, error: string, nextAttempt: number) { await db.runAsync("UPDATE outbox SET state=?,error=?,next_attempt=? WHERE owner=? AND id=?", blocked ? 'blocked' : 'pending', error, nextAttempt, owner, id); },
    async retryBlocked(owner: string, id: string) { await db.runAsync("UPDATE outbox SET state='pending',error=NULL,next_attempt=0 WHERE owner=? AND id=? AND state='blocked' AND kind='upload'", owner, id); },
    async update(owner: string, id: string, changes: Partial<Pick<LocalRecord, 'remoteId' | 'scan' | 'grade' | 'submission'>>) {
      const columns = { remoteId: 'remote_id', scan: 'scan', grade: 'grade', submission: 'submission' };
      const keys = Object.keys(changes) as (keyof typeof columns)[];
      if (!keys.length) return;
      await db.runAsync(`UPDATE local_records SET ${keys.map(key => `${columns[key]}=?`).join(',')} WHERE owner=? AND id=?`, ...keys.map(key => key === 'remoteId' ? changes[key] ?? null : changes[key] == null ? null : JSON.stringify(changes[key])), owner, id);
    },
    async acknowledge(owner: string, id: string, recordId: string, changes: Partial<Pick<LocalRecord, 'remoteId' | 'scan' | 'grade' | 'submission'>>, clearDraftKind?: string) {
      await db.withExclusiveTransactionAsync(async tx => {
        for (const [key, value] of Object.entries(changes)) {
          const column = ({ remoteId: 'remote_id', scan: 'scan', grade: 'grade', submission: 'submission' } as Record<string, string>)[key];
          if (!column) throw new Error('Campo local inválido.');
          await tx.runAsync(`UPDATE local_records SET ${column}=? WHERE owner=? AND id=?`, key === 'remoteId' ? value as string : value == null ? null : JSON.stringify(value), owner, recordId);
        }
        await tx.runAsync('DELETE FROM outbox WHERE owner=? AND id=?', owner, id);
        if (clearDraftKind) await tx.runAsync('DELETE FROM local_drafts WHERE owner=? AND record_id=? AND kind=?', owner, recordId, clearDraftKind);
      });
    },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const writers = new Set(['initialize', 'putCache', 'create', 'enqueue', 'saveDraft', 'claim', 'fail', 'retryBlocked', 'update', 'acknowledge']);
  return new Proxy(methods, { get(target, key) {
    const value = Reflect.get(target, key);
    if (!writers.has(String(key))) return value;
    return (...args: unknown[]) => { const result = tail.then(() => value.apply(target, args)); tail = result.catch(() => {}); return result; };
  } });
}
export type OfflineStore = ReturnType<typeof createOfflineStore>;
