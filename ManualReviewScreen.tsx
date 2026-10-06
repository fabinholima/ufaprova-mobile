import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { initialManualDraft, isManual, manualPayload } from './manual-contract';
import type { ManualDraft, RichBlock } from './manual-contract';
import type { LocalRecord, OfflineStore, Operation } from './offline-store';
import { ui } from './ui-styles';
function RichContent({ blocks }: { blocks: RichBlock[] }) {
  return <>{blocks.map((block, index) => {
    const image = block.dataUrl || block.svgDataUrl;
    if (image) return <View key={index}><Image source={{ uri: image }} style={{ height: 180, width: '100%' }} resizeMode="contain" accessibilityLabel={block.alt || block.caption || 'Ilustração da questão'} />{!!block.caption && <Text style={ui.small}>{block.caption}</Text>}</View>;
    const content = block.text || block.tex || block.formula || block.equation || block.items?.join('\n') || block.caption || block.alt || '';
    return content ? <Text key={index} style={ui.text}>{content}</Text> : null;
  })}</>;
}
export default function ManualReviewScreen({ record, store, operation, onSaved, onRefresh }: {
  record: LocalRecord; store: OfflineStore; operation?: Operation; onSaved: () => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const submission = record.submission!;
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const writeTail = useRef<Promise<void>>(Promise.resolve());
  const savedRevision = draft?.revision;
  const conflict = savedRevision != null && (savedRevision !== submission.revision || draft?.submissionId !== submission.id);
  const waiting = !!operation && operation.state !== 'blocked';
  useEffect(() => {
    let active = true;
    void store.draft<ManualDraft>(record.owner, record.id, 'manual').then(value => { if (active) setDraft(value || initialManualDraft(submission)); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [store, record.owner, record.id, submission.id, submission.revision]);
  function edit(next: ManualDraft) {
    setDraft(next); setChecked(false); setNotice('');
    writeTail.current = writeTail.current.catch(() => {}).then(() => store.saveDraft(record.owner, record.id, 'manual', next));
    void writeTail.current.then(() => setNotice('Rascunho salvo no aparelho.')).catch(err => setError(err instanceof Error ? err.message : 'Não foi possível salvar o rascunho.'));
  }
  async function save() {
    if (!draft || !checked || busy || lock.current || waiting || conflict) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const payload = manualPayload(submission, draft);
      await writeTail.current;
      await store.saveDraft(record.owner, record.id, 'manual', draft);
      await store.enqueue(record.owner, record.id, 'manual', { ...payload, submissionId: submission.id });
      setNotice('Correção salva no aparelho e aguardando sincronização.');
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a correção.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Text style={ui.title}>Correção de discursivas</Text>
    <Text style={ui.text}>{submission.candidate.name} • {submission.candidate.class || record.sheet.className}</Text>
    {operation && <Text style={operation.state === 'blocked' ? ui.error : ui.text}>{operation.state === 'blocked' ? `Sincronização precisa de revisão: ${operation.error}` : 'Esta correção está aguardando sincronização. As notas enviadas ficam preservadas até a confirmação do servidor.'}</Text>}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!notice && <Text style={ui.small}>{notice}</Text>}
    {conflict && <>
      <Text style={ui.error}>O resultado no servidor mudou desde este rascunho. Compare as notas salvas abaixo antes de enviar sua correção.</Text>
      <Pressable disabled={busy || waiting} style={ui.secondary} onPress={() => { if (draft) { edit({ ...draft, revision: submission.revision, submissionId: submission.id }); setChecked(false); } }}><Text style={ui.buttonText}>Conferi as alterações; usar versão atual</Text></Pressable>
    </>}
    {submission.questions.filter(isManual).map(question => {
      const item = submission.result.items.find(item => item.questionNumber === question.number);
      const response = submission.responses.find(response => response.questionNumber === question.number);
      return <View key={question.number} style={ui.card}>
        <Text style={ui.cardTitle}>Questão {question.number} • Até {question.points.toLocaleString('pt-BR')} pontos</Text>
        <RichContent blocks={question.statement} />
        {response?.text ? <><Text style={ui.small}>Resposta do aluno</Text><Text style={ui.text}>{response.text}</Text></> : <Text style={ui.small}>Confira a resposta na prova do aluno ou na foto, se estiver visível. A folha de alternativas não contém a resposta discursiva.</Text>}
        {question.guide.length > 0 && <><Text style={ui.small}>Orientação de correção</Text><RichContent blocks={question.guide} /></>}
        <Text style={ui.small}>Nota no servidor: {item?.awardedPoints == null ? 'Pendente' : item.awardedPoints.toLocaleString('pt-BR')}{item?.feedback ? ` • ${item.feedback}` : ''}</Text>
        <TextInput accessibilityLabel={`Nota da questão ${question.number}`} placeholder="Nota, incluindo zero" keyboardType="decimal-pad" editable={!!draft && !busy && !waiting}
          value={draft?.points[question.number] ?? ''} style={ui.input} onChangeText={value => draft && edit({ ...draft, points: { ...draft.points, [question.number]: value } })} />
        <TextInput accessibilityLabel={`Comentário da questão ${question.number}`} placeholder="Comentário para o aluno (opcional)" multiline maxLength={2000} editable={!!draft && !busy && !waiting}
          value={draft?.feedback[question.number] ?? ''} style={ui.input} onChangeText={value => draft && edit({ ...draft, feedback: { ...draft.feedback, [question.number]: value } })} />
      </View>;
    })}
    <Pressable disabled={!draft || busy || waiting || conflict} accessibilityRole="checkbox" accessibilityState={{ checked }} style={[ui.card, checked && ui.selected]} onPress={() => setChecked(value => !value)}>
      <Text style={ui.cardTitle}>{checked ? '✓ ' : ''}Conferi o aluno e todas as notas discursivas</Text>
    </Pressable>
    <Pressable disabled={!draft || !checked || busy || waiting || conflict} style={[ui.primary, (!draft || !checked || busy || waiting || conflict) && ui.disabled]} onPress={save}><Text style={ui.primaryText}>Salvar correção para sincronizar</Text></Pressable>
    {operation?.state === 'blocked' && <Pressable disabled={busy} style={ui.secondary} onPress={() => { void onRefresh().catch(err => setError(err.message)); }}><Text style={ui.buttonText}>Atualizar resultado do servidor</Text></Pressable>}
  </>;
}
