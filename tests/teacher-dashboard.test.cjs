const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), load = require('./load-typescript.cjs');
const { needsAttention, applicationProgress, sortApplications } = load(path.join(__dirname, '../teacher-dashboard.ts'));
const record = (id, extra = {}) => ({ id, owner: 'o', sheet: { applicationId: 'a1' }, imageDataUrl: '', remoteId: 'r', scan: null, grade: null, submission: null, createdAt: 0, ...extra });
test('records that wait for the teacher: blocked upload, marks to check, failed reading, pending essay questions', () => {
  const op = (recordId, state) => ({ id: 'x', owner: 'o', recordId, kind: 'upload', payload: null, state, attempts: 0, nextAttempt: 0, error: null });
  assert.equal(needsAttention(record('1', { remoteId: null }), [op('1', 'blocked')]), true);
  assert.equal(needsAttention(record('2', { scan: { status: 'review' } }), []), true);
  assert.equal(needsAttention(record('3', { scan: { status: 'failed' } }), []), true);
  assert.equal(needsAttention(record('4', { scan: { status: 'completed' }, grade: { requiresManualReview: true } }), []), true);
  assert.equal(needsAttention(record('5', { scan: { status: 'completed' }, grade: { requiresManualReview: false } }), []), false);
  assert.equal(needsAttention(record('6', { scan: { status: 'review' } }), [op('6', 'pending')]), false, 'an answer already queued is not pending');
});
test('progress counts graded cards and photos still on the device', () => {
  const app = { id: 'a1', students: 30, completed: 12, status: 'open' };
  assert.deepEqual(applicationProgress(app, [record('1', { remoteId: null }), record('2', { remoteId: null }), record('3'), record('4', { remoteId: null, sheet: { applicationId: 'other' } })]), { completed: 12, students: 30, waiting: 2, percent: 40 });
  assert.equal(applicationProgress({ ...app, completed: 40 }, []).completed, 30);
});
test('open applications first, then the next scheduled, closed last', () => {
  const list = [
    { id: '1', title: 'C', status: 'closed' },
    { id: '2', title: 'B', status: 'scheduled', scheduledAt: '2026-12-10' },
    { id: '3', title: 'A', status: 'scheduled', scheduledAt: '2026-12-01' },
    { id: '4', title: 'D', status: 'open' },
  ];
  assert.deepEqual(sortApplications(list).map(a => a.id), ['4', '3', '2', '1']);
});
