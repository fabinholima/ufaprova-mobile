import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import {
  ACTION_LABEL, ITEM_LABEL, OUTCOME_LABEL, PROCESSING_LABEL, PUBLICATION_LABEL, REASON_LABEL, RELEASE_LABEL,
  authorizable, countLine, followupPending, parseQuestionList, pendingLine,
} from './results-contract';
import FollowupForm from './FollowupForm';
import type { AnnulledPolicy, ApplicationResults, AuthorizeResponse, ReleasePolicy, ResultDetail, StudentResult } from './results-contract';
import type { ScanClient } from './scan-api';
import { ui } from './ui-styles';

type Client = Pick<ScanClient, 'applicationResults' | 'resultDetail' | 'authorize' | 'saveResultSettings' | 'scanImage' | 'saveFollowup'>;
type Mode = 'list' | 'confirm' | 'detail' | 'settings' | 'followup';

// Revisão e autorização do lançamento. Somente com conexão: os resultados
// não são guardados no aparelho.
export default function ResultsScreen({ client, applicationId, connected, newId, onReviewScan, onBack }: {
  client: Client; applicationId: string; connected: boolean; newId: () => string;
  onReviewScan?: (scanId: string) => boolean; onBack: () => void;
}) {
  const [data, setData] = useState<ApplicationResults | null>(null);
  const [view, setView] = useState<Mode>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ResultDetail | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [outcome, setOutcome] = useState<AuthorizeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // O mesmo ID acompanha novas tentativas do mesmo lote: repetir após falha
  // de conexão não gera outro lançamento.
  const batch = useRef<{ key: string; id: string } | null>(null);

  const load = useCallback(async (): Promise<ApplicationResults | null> => {
    if (!connected) { setError('Conecte-se para consultar e autorizar resultados.'); return null; }
    setBusy(true); setError('');
    try {
      const next = await client.applicationResults(applicationId);
      setData(next);
      setSelected((current) => new Set([...current].filter((id) => next.students.some((s) => s.resultId === id && authorizable(s)))));
      return next;
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os resultados.'); return null; }
    finally { setBusy(false); }
  }, [client, applicationId, connected]);
  useEffect(() => { void load(); }, [load]);

  const students = data?.students ?? [];
  const ready = students.filter(authorizable);
  const chosen = ready.filter((s) => selected.has(s.resultId!));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function authorize() {
    if (!data || !chosen.length) return;
    const items = chosen.map((s) => ({ resultId: s.resultId!, versionId: s.currentVersionId! }));
    const key = JSON.stringify(items);
    if (batch.current?.key !== key) batch.current = { key, id: newId() };
    setBusy(true); setError('');
    try {
      const response = await client.authorize(data.application.id, items, batch.current.id);
      batch.current = null;
      setOutcome(response); setSelected(new Set()); setView('list');
      const next = await load();
      // Baixo rendimento abre a opção de justificar, sem bloquear a publicação.
      const published = new Set(response.items.filter((item) => item.outcome === 'published').map((item) => item.resultId));
      const low = next?.students.filter((s) => s.resultId && published.has(s.resultId) && followupPending(s)).length ?? 0;
      setNotice(low ? `${low} resultado(s) publicado(s) abaixo do mínimo esperado. Registre a justificativa agora ou depois, em Detalhes.` : '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível autorizar.'); }
    finally { setBusy(false); }
  }

  async function openDetail(student: StudentResult) {
    if (!student.resultId) return;
    setBusy(true); setError(''); setPhoto(null);
    try { setDetail(await client.resultDetail(student.resultId)); setNotice(''); setView('detail'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir o resultado.'); }
    finally { setBusy(false); }
  }

  const header = data && <>
    <Text style={ui.title}>{data.application.title}</Text>
    <Text style={ui.text}>{[data.application.className, data.application.subject].filter(Boolean).join(' · ')}</Text>
    <Text style={ui.small}>{data.application.questionCounts.length ? `${data.application.questionCounts.join(' ou ')} questões` : 'Sem versões geradas'}{data.application.minExpectedPercent != null ? ` · mínimo esperado ${data.application.minExpectedPercent}%` : ''}</Text>
  </>;

  if (view === 'confirm') return <View>
    {header}
    <Text style={ui.title}>Autorizar lançamento</Text>
    <Text style={ui.text}>Os resultados abaixo ficarão visíveis para {chosen.length === 1 ? 'o aluno' : `${chosen.length} alunos`}. Resultados já publicados serão substituídos por esta versão, e a anterior fica no histórico.</Text>
    {chosen.map((s) => <View key={s.resultId} style={ui.card}><Text style={ui.cardTitle}>{s.studentName}</Text><Text style={ui.small}>{countLine(s.counts, s.percent)}</Text>{s.score != null && <Text style={ui.small}>Nota {s.score} de {s.maxScore}</Text>}</View>)}
    {!!error && <Text style={ui.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { void authorize(); }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>Confirmar e publicar</Text>}
    </Pressable>
    <Pressable style={ui.secondary} disabled={busy} onPress={() => setView('list')}><Text style={ui.buttonText}>Voltar sem publicar</Text></Pressable>
  </View>;

  if (view === 'followup' && detail) return <FollowupForm current={detail.followups[0] ?? null} connected={connected} newId={newId}
    onCancel={() => setView('detail')}
    onSave={async (input, mutationId) => {
      const followups = await client.saveFollowup(detail.id, input, mutationId);
      setDetail({ ...detail, followups }); setView('detail');
      setNotice(input.reasons.length ? 'Justificativa registrada.' : 'Acompanhamento salvo como pendente.');
      await load();
    }} />;

  if (view === 'detail' && detail) {
    const current = detail.versions.find((v) => v.id === detail.currentVersionId) ?? detail.versions[0];
    const reviewable = detail.scans.find((s) => s.status === 'review');
    return <View>
      <Text style={ui.title}>{detail.studentName}</Text>
      <Text style={ui.text}>{PROCESSING_LABEL[detail.processingStatus]} · {PUBLICATION_LABEL[detail.publicationStatus]}</Text>
      {current && <>
        <Text style={ui.small}>Versão {current.version} · {countLine(current.counts, current.percent)}</Text>
        {current.score != null && <Text style={ui.small}>Nota {current.score} de {current.maxScore}</Text>}
        {current.items.map((item) => {
          const pending = item.status === 'review_pending' || item.status === 'manual_pending';
          return <View key={item.questionNumber} style={[ui.card, pending && ui.selected]}>
            <Text style={ui.cardTitle}>Questão {item.questionNumber} · {ITEM_LABEL[item.status] ?? item.status}</Text>
            {item.selectedLabels && <Text style={ui.small}>Lido: {item.selectedLabels.length ? item.selectedLabels.join(', ') : 'nenhuma marcação'}{item.answerStatus === 'uncertain' ? ' (sem confiança suficiente)' : ''}</Text>}
            {item.correctLabels && <Text style={ui.small}>Gabarito: {item.correctLabels.join(', ') || 'ausente'}</Text>}
          </View>;
        })}
      </>}
      {reviewable && <>
        <Text style={ui.text}>Há um cartão aguardando revisão. Confira as marcações na foto e confirme a leitura antes de autorizar.</Text>
        {onReviewScan && <Pressable style={ui.secondary} onPress={() => { if (!onReviewScan(reviewable.id)) setError('Este cartão foi enviado por outro aparelho. Revise a leitura no portal.'); }}><Text style={ui.buttonText}>Revisar leitura deste cartão</Text></Pressable>}
      </>}
      {detail.scans.filter((s) => s.imageAvailable).map((s) => <Pressable key={s.id} style={ui.secondary} onPress={() => { void client.scanImage(s.id).then(setPhoto).catch((err) => setError(err.message)); }}>
        <Text style={ui.buttonText}>Ver foto do cartão ({s.status === 'review' ? 'em revisão' : s.status === 'completed' ? 'lido' : s.status}){s.duplicateOfScanId ? ' · duplicado' : ''}</Text>
      </Pressable>)}
      {photo && <Image source={photo} style={ui.preview} resizeMode="contain" accessibilityLabel="Foto original do cartão" />}
      {(detail.belowExpected || detail.followups.length > 0) && <>
        <Text style={ui.title}>Acompanhamento pedagógico</Text>
        {detail.belowExpected && <Text style={ui.text}>Abaixo do mínimo esperado{detail.minExpectedPercent != null ? ` (${detail.minExpectedPercent}%)` : ''}.{detail.followups[0]?.status === 'justified' ? '' : ' Justificativa pendente.'}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={ui.success}>{notice}</Text>}
        {detail.followups.map((f, index) => <View key={f.id} style={[ui.card, index === 0 && ui.selected]}>
          <Text style={ui.cardTitle}>{index === 0 ? 'Situação atual' : 'Registro anterior'} · {f.status === 'justified' ? 'Justificado' : 'Pendente'}</Text>
          <Text style={ui.small}>{new Date(f.createdAt).toLocaleString('pt-BR')}{f.createdByName ? ` · ${f.createdByName}` : ''}{f.resultVersion ? ` · versão ${f.resultVersion}` : ''}</Text>
          {f.reasons.length > 0 && <Text style={ui.small}>Motivos: {f.reasons.map((r) => r === 'other' && f.otherReason ? `${REASON_LABEL.other}: ${f.otherReason}` : REASON_LABEL[r]).join('; ')}</Text>}
          {f.actions.length > 0 && <Text style={ui.small}>Ações: {f.actions.map((a) => ACTION_LABEL[a]).join('; ')}</Text>}
          {!!f.internalNote && <Text style={ui.small}>Observação interna: {f.internalNote}</Text>}
          {!!f.studentGuidance && <Text style={ui.small}>Orientação {f.studentGuidancePublished ? 'publicada' : 'não publicada'}: {f.studentGuidance}</Text>}
        </View>)}
        <Pressable accessibilityRole="button" disabled={!connected} style={[ui.secondary, !connected && ui.disabled]} onPress={() => { setNotice(''); setView('followup'); }}>
          <Text style={ui.buttonText}>{detail.followups.length ? 'Atualizar acompanhamento' : 'Registrar justificativa'}</Text>
        </Pressable>
      </>}
      {!detail.belowExpected && !detail.followups.length && <Pressable style={ui.secondary} disabled={!connected} onPress={() => { setNotice(''); setView('followup'); }}><Text style={ui.buttonText}>Registrar acompanhamento</Text></Pressable>}
      {detail.changes.length > 0 && <>
        <Text style={ui.title}>Alterações registradas</Text>
        {detail.changes.map((c, index) => <Text key={index} style={ui.small}>Questão {c.questionNumber}: {ITEM_LABEL[c.previousStatus ?? ''] ?? '—'} → {ITEM_LABEL[c.newStatus] ?? c.newStatus} (versão {c.toVersion}{c.changedByName ? `, ${c.changedByName}` : ''})</Text>)}
      </>}
      <Text style={ui.title}>Publicações</Text>
      {!detail.publications.length && <Text style={ui.small}>Ainda não publicado ao aluno.</Text>}
      {detail.publications.map((p) => <Text key={p.id} style={ui.small}>Versão {p.version} · {p.authorizerName} · {new Date(p.authorizedAt).toLocaleString('pt-BR')}{p.supersededAt ? ' · substituída' : ' · em vigor'}</Text>)}
      {!!error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={ui.secondary} onPress={() => { setView('list'); setDetail(null); setPhoto(null); setError(''); }}><Text style={ui.buttonText}>Voltar à lista</Text></Pressable>
    </View>;
  }

  if (view === 'settings' && data) return <SettingsForm client={client} data={data} connected={connected}
    onDone={async (message) => { setView('list'); setError(''); setOutcome(null); setNotice(message ?? ''); await load(); }} />;

  const pendingCount = students.filter((s) => s.resultId && !s.publishable).length;
  const lowPending = students.filter(followupPending).length;
  const republish = students.filter((s) => s.publicationStatus === 'republish_required').length;
  return <View>
    {header}
    {busy && !data && <ActivityIndicator accessibilityLabel="Carregando resultados" />}
    {data && <Text style={ui.small}>{ready.length} pronto(s) para autorizar · {pendingCount} com pendência · {students.filter((s) => s.published).length} publicado(s){republish ? ` · ${republish} precisa(m) de nova autorização` : ''}{lowPending ? ` · ${lowPending} justificativa(s) pendente(s)` : ''}</Text>}
    {outcome && <Text accessibilityLiveRegion="polite" style={ui.success}>{summarizeOutcome(outcome)}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={ui.success}>{notice}</Text>}
    {!!error && <Text style={ui.error}>{error}</Text>}
    {ready.length > 0 && <Pressable style={ui.secondary} onPress={() => setSelected(selected.size === ready.length ? new Set() : new Set(ready.map((s) => s.resultId!)))}>
      <Text style={ui.buttonText}>{selected.size === ready.length ? 'Desmarcar todos' : `Selecionar todos os prontos (${ready.length})`}</Text>
    </Pressable>}
    {students.map((s) => {
      const canSelect = authorizable(s);
      const pending = pendingLine(s);
      return <View key={s.applicationStudentId} style={[ui.card, canSelect && selected.has(s.resultId!) && ui.selected]}>
        <Text style={ui.cardTitle}>{s.number != null ? `${s.number}. ` : ''}{s.studentName}</Text>
        <Text style={ui.small}>{PROCESSING_LABEL[s.processingStatus]} · {PUBLICATION_LABEL[s.publicationStatus]}</Text>
        {s.counts && <Text style={ui.small}>{countLine(s.counts, s.percent)}</Text>}
        {pending && <Text style={ui.error}>{pending}</Text>}
        {s.belowExpected && <Text style={followupPending(s) ? ui.error : ui.small}>Abaixo do mínimo esperado · {followupPending(s) ? 'justificativa pendente' : 'justificativa registrada'}</Text>}
        <View style={ui.options}>
          {canSelect && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(s.resultId!) }} style={ui.option} onPress={() => toggle(s.resultId!)}>
            <Text style={ui.buttonText}>{selected.has(s.resultId!) ? '✓ Selecionado' : 'Selecionar'}</Text>
          </Pressable>}
          {s.resultId && <Pressable style={ui.option} onPress={() => { void openDetail(s); }}><Text style={ui.buttonText}>Detalhes</Text></Pressable>}
        </View>
      </View>;
    })}
    <Pressable accessibilityRole="button" disabled={!chosen.length || busy || !connected} style={[ui.primary, (!chosen.length || busy || !connected) && ui.disabled]} onPress={() => { setOutcome(null); setNotice(''); setError(''); setView('confirm'); }}>
      <Text style={ui.primaryText}>Autorizar lançamento ({chosen.length})</Text>
    </Pressable>
    <Pressable style={ui.secondary} disabled={busy || !connected} onPress={() => { void load(); }}><Text style={ui.buttonText}>{busy ? 'Atualizando…' : 'Atualizar resultados'}</Text></Pressable>
    {data && <Pressable style={ui.secondary} onPress={() => setView('settings')}><Text style={ui.buttonText}>Regras da avaliação</Text></Pressable>}
    <Pressable style={ui.secondary} onPress={onBack}><Text style={ui.buttonText}>Voltar</Text></Pressable>
  </View>;
}

function summarizeOutcome(response: AuthorizeResponse): string {
  const counts = new Map<string, number>();
  for (const item of response.items) counts.set(item.outcome, (counts.get(item.outcome) ?? 0) + 1);
  return [...counts].map(([outcome, total]) => `${total} ${OUTCOME_LABEL[outcome as keyof typeof OUTCOME_LABEL]}`).join(' · ');
}

function SettingsForm({ client, data, connected, onDone }: {
  client: Pick<ScanClient, 'saveResultSettings'>; data: ApplicationResults; connected: boolean; onDone: (message?: string) => Promise<void>;
}) {
  const settings = data.application.settings;
  const [minimum, setMinimum] = useState(settings.minExpectedPercent == null ? '' : String(settings.minExpectedPercent));
  const [release, setRelease] = useState<ReleasePolicy>(settings.releasePolicy);
  const [annulled, setAnnulled] = useState(settings.annulledQuestions.join(', '));
  const [policy, setPolicy] = useState<AnnulledPolicy | null>(settings.annulledPolicy);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function values() {
    const minExpectedPercent = minimum.trim() === '' ? null : Number(minimum.replace(',', '.'));
    if (minExpectedPercent != null && !(minExpectedPercent >= 0 && minExpectedPercent <= 100)) throw new Error('O mínimo esperado deve estar entre 0 e 100.');
    const annulledQuestions = parseQuestionList(annulled);
    if (annulledQuestions.length && !policy) throw new Error('Escolha como as questões anuladas serão pontuadas.');
    return { minExpectedPercent, releasePolicy: release, annulledQuestions, annulledPolicy: annulledQuestions.length ? policy : null };
  }
  const ruleChanged = () => {
    try { const v = values(); return JSON.stringify(v.annulledQuestions) !== JSON.stringify(settings.annulledQuestions) || v.annulledPolicy !== settings.annulledPolicy; }
    catch { return false; }
  };

  async function save() {
    setError('');
    let next;
    try { next = values(); } catch (err) { setError((err as Error).message); return; }
    // Mudar anulações recalcula a turma inteira: pede confirmação explícita.
    if (ruleChanged() && !confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      const saved = await client.saveResultSettings(data.application.id, next);
      await onDone(saved.recalculated ? `${saved.recalculated} resultado(s) recalculado(s). Confira e autorize novamente os que já estavam publicados.` : undefined);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar as regras.'); setConfirming(false); }
    finally { setBusy(false); }
  }

  return <View>
    <Text style={ui.title}>Regras da avaliação</Text>
    <Text style={ui.text}>Mínimo esperado (%)</Text>
    <TextInput style={ui.input} accessibilityLabel="Mínimo esperado em porcentagem" keyboardType="decimal-pad" placeholder={data.application.minExpectedPercent != null ? `Padrão: ${data.application.minExpectedPercent}` : 'Sem mínimo definido'} value={minimum} onChangeText={setMinimum} />
    <Text style={ui.text}>O que o aluno vê em cada questão</Text>
    {(Object.keys(RELEASE_LABEL) as ReleasePolicy[]).map((key) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: release === key }} style={[ui.card, release === key && ui.selected]} onPress={() => setRelease(key)}><Text style={ui.cardTitle}>{RELEASE_LABEL[key]}</Text></Pressable>)}
    <Text style={ui.text}>Questões anuladas</Text>
    <TextInput style={ui.input} accessibilityLabel="Questões anuladas" placeholder="Ex.: 3, 7" value={annulled} onChangeText={(value) => { setAnnulled(value); setConfirming(false); }} />
    {annulled.trim() !== '' && <View style={ui.options}>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: policy === 'exclude' }} style={[ui.option, policy === 'exclude' && ui.selected]} onPress={() => { setPolicy('exclude'); setConfirming(false); }}><Text style={ui.buttonText}>Retirar da contagem</Text></Pressable>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: policy === 'award_full' }} style={[ui.option, policy === 'award_full' && ui.selected]} onPress={() => { setPolicy('award_full'); setConfirming(false); }}><Text style={ui.buttonText}>Considerar correta para todos</Text></Pressable>
    </View>}
    {confirming && <Text style={ui.error}>Alterar anulações recalcula todos os resultados desta aplicação. Os já publicados continuam visíveis na versão anterior até você autorizar de novo. Toque em salvar outra vez para confirmar.</Text>}
    {!!error && <Text style={ui.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { void save(); }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>{confirming ? 'Confirmar e recalcular' : 'Salvar regras'}</Text>}
    </Pressable>
    <Pressable style={ui.secondary} disabled={busy} onPress={() => { void onDone(); }}><Text style={ui.buttonText}>Cancelar</Text></Pressable>
  </View>;
}
