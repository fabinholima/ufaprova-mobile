import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ACTION_LABEL, REASON_LABEL } from './results-contract';
import type { Followup, FollowupInput, LowPerformanceReason, PedagogicalAction } from './results-contract';
import { ui } from './ui-styles';

// Justificativa de baixo rendimento registrada pelo professor. O sistema não
// sugere motivos: todos começam desmarcados, inclusive ao atualizar.
export default function FollowupForm({ current, connected, newId, onSave, onCancel }: {
  current: Followup | null; connected: boolean; newId: () => string;
  onSave: (input: FollowupInput, clientMutationId: string) => Promise<void>; onCancel: () => void;
}) {
  const [reasons, setReasons] = useState<LowPerformanceReason[]>([]);
  const [otherReason, setOtherReason] = useState('');
  const [actions, setActions] = useState<PedagogicalAction[]>(current?.actions ?? []);
  const [internalNote, setInternalNote] = useState('');
  const [guidance, setGuidance] = useState(current?.studentGuidance ?? '');
  const [publish, setPublish] = useState(current?.studentGuidancePublished ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Repetir após falha de conexão reutiliza o ID: o servidor não duplica a entrada.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  async function save() {
    setError('');
    if (reasons.includes('other') && !otherReason.trim()) { setError('Descreva o outro motivo.'); return; }
    if (publish && !guidance.trim()) { setError('Escreva a orientação antes de publicá-la ao aluno.'); return; }
    const input: FollowupInput = {
      reasons, actions, publishGuidance: publish,
      ...(reasons.includes('other') ? { otherReason: otherReason.trim() } : {}),
      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
      ...(guidance.trim() ? { studentGuidance: guidance.trim() } : {}),
    };
    const key = JSON.stringify(input);
    if (attempt.current?.key !== key) attempt.current = { key, id: newId() };
    setBusy(true);
    try { await onSave(input, attempt.current.id); attempt.current = null; }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o acompanhamento.'); }
    finally { setBusy(false); }
  }

  return <View>
    <Text style={ui.title}>Acompanhamento pedagógico</Text>
    <Text style={ui.text}>Motivos observados por você. Sem motivo marcado, o registro fica como justificativa pendente.</Text>
    {(Object.keys(REASON_LABEL) as LowPerformanceReason[]).map((key) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: reasons.includes(key) }}
      style={[ui.card, reasons.includes(key) && ui.selected]} onPress={() => setReasons((list) => toggle(list, key))}>
      <Text style={ui.cardTitle}>{reasons.includes(key) ? '✓ ' : ''}{REASON_LABEL[key]}</Text>
    </Pressable>)}
    {reasons.includes('other') && <TextInput style={ui.input} accessibilityLabel="Descrição do outro motivo" placeholder="Descreva o motivo" value={otherReason} onChangeText={setOtherReason} maxLength={1000} />}
    <Text style={ui.text}>Ações pedagógicas</Text>
    <View style={ui.options}>
      {(Object.keys(ACTION_LABEL) as PedagogicalAction[]).map((key) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: actions.includes(key) }}
        style={[ui.option, actions.includes(key) && ui.selected]} onPress={() => setActions((list) => toggle(list, key))}>
        <Text style={ui.buttonText}>{actions.includes(key) ? '✓ ' : ''}{ACTION_LABEL[key]}</Text>
      </Pressable>)}
    </View>
    <Text style={ui.text}>Observação interna (o aluno não vê)</Text>
    <TextInput style={ui.input} accessibilityLabel="Observação interna" multiline value={internalNote} onChangeText={setInternalNote} maxLength={4000} />
    <Text style={ui.text}>Orientação para o aluno</Text>
    <TextInput style={ui.input} accessibilityLabel="Orientação para o aluno" multiline placeholder="Ex.: refaça a lista 3 e procure o plantão de quinta." value={guidance} onChangeText={setGuidance} maxLength={4000} />
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: publish }} style={[ui.card, publish && ui.selected]} onPress={() => setPublish((value) => !value)}>
      <Text style={ui.cardTitle}>{publish ? '✓ Publicar orientação ao aluno' : 'Não publicar a orientação ao aluno'}</Text>
      <Text style={ui.small}>O aluno vê somente esta orientação, quando o resultado estiver publicado. Motivos, ações e observação interna não são exibidos.</Text>
    </Pressable>
    {!!error && <Text style={ui.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || !connected} style={[ui.primary, (busy || !connected) && ui.disabled]} onPress={() => { void save(); }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>{reasons.length ? 'Salvar justificativa' : 'Salvar como pendente'}</Text>}
    </Pressable>
    <Pressable style={ui.secondary} disabled={busy} onPress={onCancel}><Text style={ui.buttonText}>Cancelar</Text></Pressable>
  </View>;
}
