import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import type { CameraCapturedPicture } from 'expo-camera';
import CaptureScreen from './CaptureScreen';
import { Chip, EmptyState, Notice, ProgressBar } from './components';
import {
  STATUS_LABEL, aiPicks, canAddPages, canEditTranscription, canGrade, draftPages, failedJob, gradingInput, isReceived, needsTeacher, runningJob, totalOf,
} from './essay-contract';
import type { EssayApplication, EssayEntry, EssayQueueItem } from './essay-contract';
import type { ScanClient } from './scan-api';
import { useUi } from './ui-styles';

type Client = Pick<ScanClient, 'essayApplications' | 'essayQueue' | 'essayEntry' | 'essayAction' | 'addEssayPage' | 'removeEssayPage' | 'essayPageImage'>;
type Mode = 'applications' | 'queue' | 'entry' | 'capture' | 'publish';
type Filter = 'todo' | 'missing' | 'all';
const FILTERS: { key: Filter; label: string; match: (item: EssayQueueItem) => boolean }[] = [
  { key: 'todo', label: 'Para corrigir', match: (item) => needsTeacher(item.status) },
  { key: 'missing', label: 'Sem entrega', match: (item) => item.status === 'pending' || item.status === 'returned' },
  { key: 'all', label: 'Todas', match: () => true },
];
const score = (value: number | null, max: number | null) => value == null ? '' : `${value}${max ? ` de ${max}` : ''}`;

// Correção de redações pelo celular. Exige conexão: nada fica no aparelho.
// backRef: o botão voltar do Android sobe um nível dentro desta tela.
export default function EssayScreen({ client, connected, prepare, backRef, onOpenPortal }: {
  client: Client; connected: boolean; prepare: (photo: CameraCapturedPicture) => Promise<string>;
  backRef?: MutableRefObject<(() => boolean) | null>; onOpenPortal: () => void;
}) {
  const ui = useUi();
  const [mode, setMode] = useState<Mode>('applications');
  const [apps, setApps] = useState<EssayApplication[] | null>(null);
  const [app, setApp] = useState<EssayApplication | null>(null);
  const [queue, setQueue] = useState<EssayQueueItem[]>([]);
  const [filter, setFilter] = useState<Filter>('todo');
  const [entry, setEntry] = useState<EssayEntry | null>(null);
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const [comments, setComments] = useState('');
  const [annulment, setAnnulment] = useState('');
  const [basedOn, setBasedOn] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [page, setPage] = useState<{ id: string; uri: string; headers: Record<string, string> } | null>(null);
  const [sessionPages, setSessionPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Devolve se a tarefa deu certo; o erro fica na tela.
  async function run(task: () => Promise<void>): Promise<boolean> {
    if (!connected) { setError('Conecte-se para corrigir redações.'); return false; }
    setBusy(true); setError('');
    try { await task(); return true; }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível continuar.'); return false; }
    finally { setBusy(false); }
  }
  const loadApps = useCallback(() => run(async () => setApps(await client.essayApplications())), [client, connected]);
  useEffect(() => { void loadApps(); }, [loadApps]);

  function show(next: EssayEntry) {
    setEntry(next); setPage(null);
    const saved = next.teacherGrading;
    setPicked(Object.fromEntries((saved?.scores ?? []).map((item) => [item.criterionId, item.score])));
    setComments(saved?.comments ?? ''); setAnnulment(saved?.annulmentReason ?? ''); setBasedOn(null);
    setTranscription(next.transcription?.text ?? '');
  }
  const openApp = (item: EssayApplication) => run(async () => {
    const items = await client.essayQueue(item.id);
    setApp(item); setQueue(items); setNotice('');
    setFilter(items.some(FILTERS[0].match) ? 'todo' : 'all'); setMode('queue');
  });
  const openEntry = (id: string) => run(async () => { show(await client.essayEntry(id)); setNotice(''); setMode('entry'); });
  const refreshQueue = async () => { if (app) setQueue(await client.essayQueue(app.id)); };
  // Ações que devolvem a produção atualizada; a fila acompanha o novo estado.
  const act = (action: Parameters<Client['essayAction']>[1], body?: object, done?: string) => run(async () => {
    if (!entry) return;
    show(await client.essayAction(entry.id, action, body));
    setNotice(done ?? '');
    await refreshQueue().catch(() => {});
  });

  function back(): boolean {
    if (mode === 'capture' || mode === 'publish') { setMode('entry'); return true; }
    if (mode === 'entry') { setMode('queue'); setNotice(''); void refreshQueue().catch(() => {}); return true; }
    if (mode === 'queue') { setMode('applications'); setNotice(''); void loadApps(); return true; }
    return false;
  }
  if (backRef) backRef.current = back;

  const errorLine = !!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>;
  const offline = !connected && <Notice tone="warning" icon="cloud-offline">A correção de redações exige conexão. Nada fica salvo no aparelho.</Notice>;
  const backButton = (label: string) => <Pressable accessibilityRole="button" disabled={busy} style={[ui.secondary, busy && ui.disabled]} onPress={back}><Text style={ui.buttonText}>{label}</Text></Pressable>;

  if (mode === 'capture' && entry) return <CaptureScreen
    school={{ id: entry.applicationId, name: entry.className }} assessment={{ id: entry.applicationId, title: entry.prompt.title }} schoolClass={{ id: entry.id, name: entry.studentName }}
    instructions="Fotografe uma página por vez, na ordem. Enquadre a folha inteira, com todas as linhas visíveis, sem sombras e com o celular paralelo ao papel."
    confirmLabel="Enviar esta página" backLabel={sessionPages ? 'Concluir páginas' : 'Voltar'}
    header={sessionPages > 0 ? <Notice tone="success" icon="checkmark-circle">{sessionPages} página(s) enviada(s). Fotografe a próxima ou conclua.</Notice> : undefined}
    onBack={() => { void openEntry(entry.id); }}
    onConfirm={async (sheet) => {
      if (!connected) throw new Error('Sem conexão: a página não foi enviada. Conecte-se e fotografe de novo.');
      await client.addEssayPage(entry.id, await prepare(sheet.photo));
      setSessionPages((n) => n + 1);
    }} />;

  if (mode === 'applications') return <View>
    <Text style={ui.title}>Redações</Text>
    <Text style={ui.small}>Fotografe as folhas entregues e corrija por competência. Temas e aplicações são criados no portal.</Text>
    {offline}{errorLine}
    {busy && <ActivityIndicator style={{ marginTop: 16 }} accessibilityLabel="Carregando redações" />}
    {apps && !apps.length && <EmptyState icon="create" title="Nenhuma redação aplicada" text="No portal, abra Redação, escolha um tema e aplique para a turma.">
      <Pressable style={ui.secondary} onPress={onOpenPortal}><Text style={ui.buttonText}>Abrir portal</Text></Pressable>
    </EmptyState>}
    {apps?.map((item) => <Pressable key={item.id} accessibilityRole="button" disabled={busy} style={ui.card} onPress={() => { void openApp(item); }}>
      <Text style={ui.cardTitle}>{item.title}</Text>
      <Text style={ui.small}>{[item.className, item.rubricName].filter(Boolean).join(' · ')}</Text>
      <ProgressBar value={item.publishedCount} max={item.studentsCount} label={`${item.publishedCount} de ${item.studentsCount} publicadas`} />
      <Text style={ui.small}>{item.submittedCount} de {item.studentsCount} entregues · {item.publishedCount} publicada(s){item.awaitingApprovalCount ? ` · ${item.awaitingApprovalCount} pronta(s) para publicar` : ''}</Text>
    </Pressable>)}
    {apps && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void loadApps(); }}><Text style={ui.buttonText}>Atualizar lista</Text></Pressable>}
  </View>;

  if (mode === 'queue' && app) {
    const shown = queue.filter(FILTERS.find((f) => f.key === filter)!.match);
    return <View>
      <Text style={ui.title}>{app.title}</Text>
      <Text style={ui.text}>{app.className}</Text>
      {offline}{errorLine}
      <View style={ui.options}>{FILTERS.map((f) => <Chip key={f.key} label={`${f.label} (${queue.filter(f.match).length})`} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}</View>
      {!shown.length && <EmptyState icon="checkmark-done" title="Nada nesta lista" text="Escolha outro filtro para ver os demais alunos." />}
      {shown.map((item) => <Pressable key={item.id} accessibilityRole="button" disabled={busy} style={ui.card} onPress={() => { void openEntry(item.id); }}>
        <Text style={ui.cardTitle}>{item.studentNumber != null ? `${item.studentNumber}. ` : ''}{item.studentName}</Text>
        <Text style={ui.small}>{STATUS_LABEL[item.status]}{item.teacherTotal != null ? ` · nota ${score(item.teacherTotal, item.maxScore)}` : item.aiTotal != null ? ` · IA sugeriu ${score(item.aiTotal, item.maxScore)}` : ''}</Text>
      </Pressable>)}
      {busy && <ActivityIndicator style={{ marginTop: 16 }} accessibilityLabel="Carregando" />}
      {backButton('Voltar para redações')}
    </View>;
  }

  if (!entry) return <View>{errorLine}{backButton('Voltar')}</View>;

  const rubric = entry.rubric;
  const annulled = !!annulment;
  const { total, partial } = totalOf(rubric, picked, annulled);
  const next = queue.find((item) => item.id !== entry.id && needsTeacher(item.status) && item.status !== 'draft');
  const input = () => gradingInput(entry, picked, { comments, annulmentReason: annulment, basedOnGradingId: basedOn });

  if (mode === 'publish') return <View>
    <Text style={ui.title}>Publicar nota</Text>
    <Text style={ui.text}>{entry.studentName} verá a nota {score(entry.teacherGrading?.total ?? null, entry.teacherGrading?.maxScore ?? rubric?.maxScore ?? null)}, a nota de cada competência e os comentários. Para mudar depois, reabra a correção.</Text>
    {errorLine}
    <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { void act('publish', { confirm: true }, 'Nota publicada ao aluno.').then((ok) => { if (ok) setMode('entry'); }); }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>Confirmar e publicar</Text>}
    </Pressable>
    {backButton('Voltar sem publicar')}
  </View>;

  const pages = draftPages(entry);
  const received = isReceived(entry);
  const files = entry.submission?.files ?? [];
  const job = runningJob(entry), failed = failedJob(entry);
  const gradable = canGrade(entry);
  const togglePage = (id: string) => {
    if (page?.id === id) { setPage(null); return; }
    void client.essayPageImage(id).then((source) => setPage({ id, ...source })).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível abrir a página.'));
  };
  return <View>
    <Text style={ui.title}>{entry.studentName}</Text>
    <Text style={ui.text}>{entry.prompt.title} · {entry.className}</Text>
    <Text style={ui.small}>{STATUS_LABEL[entry.status]}</Text>
    {offline}
    {!!notice && <Notice tone="success">{notice}</Notice>}
    {entry.yearLocked && <Notice tone="warning">O ano letivo desta turma está encerrado. A produção só pode ser consultada.</Notice>}

    {files.length > 0 && <View style={ui.card}>
      <Text style={ui.cardTitle}>{received ? 'Páginas recebidas' : 'Páginas enviadas'} ({files.length})</Text>
      {files.map((file, index) => <View key={file.id}>
        {file.mimeType.startsWith('image/')
          ? <Pressable accessibilityRole="button" style={ui.passwordToggle} onPress={() => togglePage(file.id)}><Text style={ui.linkText}>{page?.id === file.id ? `Ocultar página ${index + 1}` : `Ver página ${index + 1}`}</Text></Pressable>
          : <Text style={ui.small}>Página {index + 1}: PDF (abra no portal)</Text>}
        {page?.id === file.id && <Image source={{ uri: page.uri, headers: page.headers }} style={ui.preview} resizeMode="contain" accessibilityLabel={`Página ${index + 1} da redação`} />}
        {pages.some((p) => p.id === file.id) && <Pressable accessibilityRole="button" disabled={busy} style={ui.passwordToggle} onPress={() => { void run(async () => { await client.removeEssayPage(entry.id, file.id); show(await client.essayEntry(entry.id)); }); }}><Text style={ui.linkText}>Remover página {index + 1}</Text></Pressable>}
      </View>)}
    </View>}
    {entry.submission?.mode === 'typed' && received && <View style={ui.card}><Text style={ui.cardTitle}>Texto digitado pelo aluno</Text><Text style={ui.text}>{entry.submission.typedText}</Text></View>}

    {canAddPages(entry) && <>
      <Pressable accessibilityRole="button" disabled={busy || !connected} style={[pages.length ? ui.secondary : ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { setSessionPages(0); setError(''); setMode('capture'); }}>
        <Text style={pages.length ? ui.buttonText : ui.primaryText}>{pages.length ? 'Fotografar mais páginas' : 'Fotografar a redação'}</Text>
      </Pressable>
      {pages.length > 0 && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { void act('receive', undefined, 'Recebimento registrado.'); }}>
        <Text style={ui.primaryText}>Registrar recebimento ({pages.length} página{pages.length > 1 ? 's' : ''})</Text>
      </Pressable>}
      {(entry.status === 'pending' || entry.status === 'draft') && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void act('absent', { absent: true }, 'Ausência registrada.'); }}><Text style={ui.buttonText}>Marcar ausência</Text></Pressable>}
    </>}
    {entry.status === 'absent' && !entry.yearLocked && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void act('absent', { absent: false }, 'Ausência desfeita.'); }}><Text style={ui.buttonText}>Desfazer ausência</Text></Pressable>}

    {job && <Notice icon="hourglass">{job.kind === 'ocr' ? 'A transcrição automática está em andamento.' : 'A sugestão da IA está em andamento.'} Atualize em alguns instantes.</Notice>}
    {!job && failed && <Notice tone="warning">{failed.kind === 'ocr' ? 'A transcrição automática falhou.' : 'A sugestão da IA falhou.'}{failed.error ? ` ${failed.error}` : ''}</Notice>}

    {received && entry.submission?.mode !== 'typed' && <View style={ui.card}>
      <Text style={ui.cardTitle}>Transcrição</Text>
      {entry.transcription?.needsReview && <Text style={ui.error}>Transcrição automática com trechos incertos: confira com as páginas.</Text>}
      {canEditTranscription(entry) ? <>
        <TextInput style={[ui.input, { minHeight: 160, textAlignVertical: 'top' }]} multiline accessibilityLabel="Transcrição da redação" placeholder="Digite o texto da redação, se quiser corrigir a partir dele." value={transcription} onChangeText={setTranscription} />
        <Pressable accessibilityRole="button" disabled={busy || !connected || !transcription.trim() || transcription === (entry.transcription?.text ?? '')} style={[ui.secondary, (busy || !connected || !transcription.trim() || transcription === (entry.transcription?.text ?? '')) && ui.disabled]} onPress={() => { void act('transcription', { text: transcription }, 'Transcrição salva.'); }}><Text style={ui.buttonText}>Salvar transcrição</Text></Pressable>
        {entry.aiAvailable && !job && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void act('ocr', undefined, 'Transcrição automática pedida.'); }}><Text style={ui.buttonText}>{entry.transcription ? 'Transcrever de novo com IA' : 'Transcrever com IA'}</Text></Pressable>}
      </> : <Text style={ui.text}>{entry.transcription?.text || 'Sem transcrição.'}</Text>}
    </View>}

    {received && rubric && <View style={ui.card}>
      <Text style={ui.cardTitle}>Correção · {rubric.name}</Text>
      {entry.aiGrading && gradable && <>
        <Text style={ui.small}>A IA sugeriu {score(entry.aiGrading.total, entry.aiGrading.maxScore)}. A nota é sempre sua.</Text>
        <Pressable accessibilityRole="button" disabled={busy} style={ui.passwordToggle} onPress={() => { setPicked((current) => ({ ...current, ...aiPicks(entry) })); setBasedOn(entry.aiGrading!.id); }}><Text style={ui.linkText}>Usar as notas sugeridas</Text></Pressable>
      </>}
      {entry.aiAvailable && !entry.aiGrading && gradable && !job && <Pressable accessibilityRole="button" disabled={busy || !connected} style={ui.passwordToggle} onPress={() => { void act('ai-grading', undefined, 'Sugestão da IA pedida.'); }}><Text style={ui.linkText}>Pedir sugestão da IA</Text></Pressable>}
      {rubric.criteria.map((criterion) => {
        const value = picked[criterion.id] ?? null;
        const ai = entry.aiGrading?.scores.find((item) => item.criterionId === criterion.id)?.score;
        const level = criterion.levels.find((l) => l.score === value);
        return <View key={criterion.id} style={{ marginTop: 16 }}>
          <Text style={ui.cardTitle}>Competência {criterion.numeral}{value != null ? ` · ${value}` : ''}</Text>
          {!!criterion.title && <Text style={ui.small}>{criterion.title}</Text>}
          {ai != null && <Text style={ui.small}>Sugestão da IA: {ai}</Text>}
          {gradable && !annulled ? <View style={ui.options}>
            {(criterion.levels.length ? criterion.levels.map((l) => l.score) : [0, criterion.maxScore]).map((option) =>
              <Chip key={option} label={String(option)} selected={value === option} onPress={() => setPicked((current) => ({ ...current, [criterion.id]: value === option ? null : option }))} />)}
          </View> : null}
          {!!level?.descriptor && <Text style={ui.small}>{level.descriptor}</Text>}
        </View>;
      })}
      {gradable && rubric.annulmentReasons.length > 0 && <>
        <Text style={[ui.cardTitle, { marginTop: 16 }]}>Anulação (nota zero)</Text>
        <View style={ui.options}>{rubric.annulmentReasons.map((reason) => <Chip key={reason.id} label={reason.label} selected={annulment === reason.id} onPress={() => setAnnulment((current) => current === reason.id ? '' : reason.id)} />)}</View>
      </>}
      {gradable ? <TextInput style={[ui.input, { minHeight: 100, textAlignVertical: 'top' }]} multiline accessibilityLabel="Comentário ao aluno" placeholder="Comentário geral ao aluno (opcional)" value={comments} onChangeText={setComments} />
        : !!entry.teacherGrading?.comments && <Text style={ui.text}>{entry.teacherGrading.comments}</Text>}
      <Text style={[ui.cardTitle, { marginTop: 16 }]}>{gradable ? (total != null ? `Total: ${total} de ${rubric.maxScore}` : `Parcial: ${partial} de ${rubric.maxScore}`) : `Total: ${score(entry.teacherGrading?.total ?? null, rubric.maxScore) || 'sem nota'}`}</Text>
      {gradable && total == null && <Text style={ui.small}>Escolha o nível de todas as competências para finalizar.</Text>}
    </View>}

    {gradable && rubric && <>
      <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void act('grading', input(), 'Rascunho da correção salvo.'); }}><Text style={ui.buttonText}>Salvar rascunho</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !connected || total == null} style={[ui.primary, (busy || !connected || total == null) && ui.disabled]} onPress={() => { void act('grading/finalize', input(), 'Correção finalizada. Publique quando quiser.'); }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>Finalizar correção</Text>}
      </Pressable>
    </>}
    {entry.status === 'awaiting_approval' && !entry.yearLocked && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { setError(''); setMode('publish'); }}><Text style={ui.primaryText}>Publicar nota ao aluno</Text></Pressable>}
    {(entry.status === 'awaiting_approval' || entry.status === 'published') && !entry.yearLocked && <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void act('grading/reopen', undefined, entry.status === 'published' ? 'Correção reaberta. A nota saiu da área do aluno até nova publicação.' : 'Correção reaberta.'); }}><Text style={ui.buttonText}>Reabrir correção</Text></Pressable>}
    {entry.status === 'published' && <Text style={ui.small}>Reabrir retira a nota da área do aluno até você publicar de novo.</Text>}

    {errorLine}
    {busy && <ActivityIndicator style={{ marginTop: 16 }} accessibilityLabel="Salvando" />}
    <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.secondary, (busy || !connected) && ui.disabled]} onPress={() => { void openEntry(entry.id); }}><Text style={ui.buttonText}>Atualizar</Text></Pressable>
    {next && <Pressable accessibilityRole="button" disabled={busy} style={ui.secondary} onPress={() => { void openEntry(next.id); }}><Text style={ui.buttonText}>Próxima para corrigir: {next.studentName}</Text></Pressable>}
    {backButton('Voltar para a turma')}
  </View>;
}
