import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { initialAnswers, matchesContext } from './scan-contract';
import type { Candidate, Label } from './scan-contract';
import type { LocalRecord, OfflineStore, Operation } from './offline-store';
import { isManual } from './manual-contract';
import ManualReviewScreen from './ManualReviewScreen';
import { ui } from './ui-styles';
export function localStatus(record: LocalRecord, operations: Operation[]): string {
  const upload = operations.find(op => op.recordId === record.id && op.kind === 'upload');
  if (upload?.state === 'blocked') return 'Envio precisa de revisão';
  if (!record.remoteId) return upload?.state === 'sending' ? 'Enviando foto…' : 'Salva no aparelho • Aguardando envio';
  if (operations.some(op => op.recordId === record.id && op.state !== 'blocked')) return 'Correção aguardando sincronização';
  return record.scan?.status === 'completed' ? record.grade?.requiresManualReview ? 'Discursivas pendentes' : 'Correção sincronizada' : record.scan?.status === 'review' ? 'Confira as marcações' : record.scan?.status === 'failed' ? 'Falha na leitura' : 'Aguardando leitura no servidor';
}
export default function RecordScreen({ record, operations, store, connected, onSaved, onRefresh, onNext, onBack, onRetry }: {
  record: LocalRecord; operations: Operation[]; store: OfflineStore; connected: boolean;
  onSaved: () => Promise<void>; onRefresh: () => Promise<void>; onNext: () => void; onBack: () => void; onRetry: () => Promise<void>;
}) {
  const [candidateId, setCandidateId] = useState('');
  const [answers, setAnswers] = useState<Record<number, Label[]>>({});
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const scan = record.scan;
  const context = { assessmentId: record.sheet.assessmentId, classId: record.sheet.classId, assessmentTitle: record.sheet.assessmentTitle, className: record.sheet.className };
  const candidates = scan?.candidates.filter(candidate => matchesContext(candidate, context)) ?? [];
  const selected = candidates.find(candidate => candidate.id === candidateId);
  const identified = scan?.candidates.find(candidate => candidate.id === scan.applicationStudentId);
  const confirmation = operations.find(op => op.recordId === record.id && op.kind === 'confirm');
  const manual = operations.find(op => op.recordId === record.id && op.kind === 'manual');
  const waiting = !!confirmation && confirmation.state !== 'blocked';
  useEffect(() => {
    if (scan?.status !== 'review') return;
    let active = true;
    void store.draft<{ candidateId: string; answers: Record<number, Label[]> }>(record.owner, record.id, 'objective').then(draft => {
      if (!active) return;
      const candidate = candidates.find(candidate => candidate.id === (draft?.candidateId || scan.applicationStudentId));
      if (candidate) { setCandidateId(candidate.id); setAnswers(draft?.candidateId === candidate.id ? draft.answers : initialAnswers(candidate, scan.detectedAnswers, true)); }
      setReady(true);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
    // A cached refresh must not reset answers while the teacher is editing them.
  }, [store, record.owner, record.id, scan?.status]);
  function edit(candidate: Candidate, next: Record<number, Label[]>) {
    setCandidateId(candidate.id); setAnswers(next); setChecked(false);
    void store.saveDraft(record.owner, record.id, 'objective', { candidateId: candidate.id, answers: next }).catch(err => setError(err.message));
  }
  async function confirm() {
    if (!selected || !checked || lock.current || waiting || !ready) return;
    lock.current = true; setBusy(true); setError('');
    try { await store.enqueue(record.owner, record.id, 'confirm', { candidate: selected, answers }); await onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a revisão.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Text style={ui.title}>{localStatus(record, operations)}</Text>
    <Text style={ui.text}>{record.sheet.assessmentTitle}</Text>
    <Text style={ui.text}>{record.sheet.schoolName} • {record.sheet.className}</Text>
    <Image source={{ uri: record.imageDataUrl }} style={ui.preview} resizeMode="contain" accessibilityLabel="Folha salva neste aparelho" />
    <Text style={ui.small}>Foto e contexto salvos no aparelho.</Text>
    {record.remoteId && <Text selectable style={ui.small}>Leitura: {record.remoteId}</Text>}
    {!connected && <Text style={ui.text}>Sem conexão. As alterações salvas serão sincronizadas quando a internet voltar.</Text>}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {operations.filter(op => op.recordId === record.id && op.error).map(op => <Text key={op.id} style={ui.error}>{op.state === 'blocked' ? 'Sincronização bloqueada: ' : 'Tentaremos novamente: '}{op.error}</Text>)}
    {!!scan?.error && <Text style={ui.error}>{scan.error}</Text>}
    {identified && <View style={ui.card}><Text style={ui.cardTitle}>Aluno: {identified.studentName} • Versão {identified.versionCode}</Text>
      {!matchesContext(identified, context) && <Text style={ui.error}>O QR identifica outro contexto: {identified.assessmentTitle} • {identified.className}. Confira a folha; o servidor corrige usando o QR.</Text>}
    </View>}
    {scan?.status === 'completed' && <>
      <Text style={ui.success}>Resultado recebido do servidor.</Text>
      {record.grade?.score != null && record.grade.maxScore != null && <Text style={ui.title}>Nota {record.grade.score.toLocaleString('pt-BR')} de {record.grade.maxScore.toLocaleString('pt-BR')}{record.grade.requiresManualReview ? ' • Parcial' : ''}</Text>}
      {!record.submission && <Text style={ui.text}>Conecte-se para carregar as questões e a orientação de correção. Depois de carregadas, você poderá corrigir sem internet.</Text>}
      {record.submission && record.submission.questions.some(isManual) && <ManualReviewScreen
        key={`${record.submission.id}:${record.submission.revision}:${manual?.id || ''}`}
        record={record} store={store} operation={manual} onSaved={onSaved} onRefresh={onRefresh} />}
    </>}
    {scan?.status === 'review' && <>
      <Text style={ui.title}>Confira o aluno e as respostas</Text>
      {!candidates.length && <Text style={ui.error}>Nenhum aluno desta avaliação e turma está disponível para revisar. Atualize os dados e confira a aplicação no portal.</Text>}
      {candidates.map(candidate => <Pressable key={candidate.id} disabled={busy || waiting || !ready} accessibilityRole="radio" accessibilityState={{ selected: candidateId === candidate.id }}
        style={[ui.card, candidateId === candidate.id && ui.selected]} onPress={() => edit(candidate, initialAnswers(candidate, scan.detectedAnswers, candidate.id === scan.applicationStudentId))}>
        <Text style={ui.cardTitle}>{candidate.studentName} • Versão {candidate.versionCode}</Text><Text style={ui.small}>{candidate.registration ? `Matrícula ${candidate.registration}` : ''}</Text>
      </Pressable>)}
      {selected?.questions.filter(question => !isManual(question)).map(question => <View key={question.number} style={ui.card}>
        <Text style={ui.cardTitle}>Questão {question.number}</Text>
        <Text style={ui.small}>Confira a marcação na foto. Deixe sem seleção se a resposta estiver em branco.</Text>
        <View style={ui.options}>{question.labels.map(label => {
          const chosen = answers[question.number]?.includes(label) ?? false;
          return <Pressable key={label} disabled={busy || waiting} accessibilityRole="checkbox" accessibilityLabel={`Questão ${question.number}, alternativa ${label}`} accessibilityState={{ checked: chosen }} style={[ui.option, chosen && ui.selected]}
            onPress={() => edit(selected, { ...answers, [question.number]: chosen ? (answers[question.number] ?? []).filter(item => item !== label) : [...(answers[question.number] ?? []), label] })}><Text style={ui.cardTitle}>{label}</Text></Pressable>;
        })}</View>
        <Text style={ui.small}>{answers[question.number]?.length ? answers[question.number].join(', ') : 'Em branco'}</Text>
      </View>)}
      {selected && <>
        <Pressable disabled={busy || waiting} accessibilityRole="checkbox" accessibilityState={{ checked }} style={[ui.card, checked && ui.selected]} onPress={() => setChecked(value => !value)}><Text style={ui.cardTitle}>{checked ? '✓ ' : ''}Conferi o aluno, a versão e todas as respostas</Text></Pressable>
        <Pressable disabled={!checked || !ready || busy || waiting} style={[ui.primary, (!checked || !ready || busy || waiting) && ui.disabled]} onPress={confirm}><Text style={ui.primaryText}>Salvar revisão para sincronizar</Text></Pressable>
      </>}
    </>}
    <Pressable disabled={!connected || busy} style={[ui.secondary, (!connected || busy) && ui.disabled]} onPress={() => { void onRefresh().catch(err => setError(err.message)); }}><Text style={ui.buttonText}>Sincronizar e atualizar estado</Text></Pressable>
    {(scan?.status === 'review' || scan?.status === 'failed') && scan.imageAvailable && !confirmation && <Pressable disabled={!connected || busy} style={[ui.secondary, (!connected || busy) && ui.disabled]} onPress={() => { void onRetry().catch(err => setError(err.message)); }}><Text style={ui.buttonText}>Reprocessar foto no servidor</Text></Pressable>}
    <Pressable disabled={busy} style={ui.primary} onPress={onNext}><Text style={ui.primaryText}>Capturar próxima folha</Text></Pressable>
    <Pressable disabled={busy} style={ui.secondary} onPress={onBack}><Text style={ui.buttonText}>Voltar às digitalizações</Text></Pressable>
  </>;
}
