import { Pressable, Text, View } from "react-native";
import { answerKeyLine, answerKeyProblem } from "./application-contract";
import type { CorrectionApplication } from "./application-contract";
import type { LocalRecord } from "./offline-store";
import { applicationProgress, sortApplications } from "./teacher-dashboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BubbleProgress, EmptyState, Notice } from "./components";
import { space, tabular, useColors } from "./theme";
import { useUi } from "./ui-styles";

type Props = {
  schoolName: string | null;
  canChangeSchool: boolean;
  onChangeSchool: () => void;
  applications: CorrectionApplication[];
  records: LocalRecord[];
  attention: number;
  onOpenAttention: () => void;
  lastApplicationId: string | null;
  selectedId: string | null;
  onSelect: (application: CorrectionApplication) => void;
  onCapture: (application: CorrectionApplication) => void;
  onResults: (application: CorrectionApplication) => void;
  connected: boolean;
  busy: boolean;
  onOpenPortal: () => void;
};

// Painel da aba Corrigir: escola, pendências, "continuar de onde parou" e as
// aplicações com o progresso da correção.
export default function TeacherHome(props: Props) {
  const ui = useUi(), c = useColors();
  const { applications, records, selectedId } = props;
  const sorted = sortApplications(applications);
  const last = sorted.find((a) => a.id === props.lastApplicationId && a.status !== "closed");
  const progressLine = (a: CorrectionApplication) => {
    const p = applicationProgress(a, records);
    return { p, text: `${p.completed} de ${p.students} corrigidos`, waiting: p.waiting ? `${p.waiting} no aparelho aguardando envio` : "" };
  };
  const progress = (a: CorrectionApplication) => {
    const { p, text, waiting } = progressLine(a);
    return (
      <>
        <BubbleProgress completed={p.completed} waiting={p.waiting} students={a.students} label={waiting ? `${text}, ${waiting}` : text} />
        <Text style={[ui.small, { marginTop: space.sm }]}>
          <Text style={{ color: c.text, fontWeight: "700", ...tabular }}>{text}</Text>
          {!!waiting && <Text style={tabular}>{` · ${waiting}`}</Text>}
        </Text>
      </>
    );
  };
  const captureDisabled = (a: CorrectionApplication) => props.busy || !!answerKeyProblem(a);
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}>
        <Ionicons name="school-outline" size={18} color={c.textMuted} />
        <Text numberOfLines={1} style={[ui.small, { marginTop: 0, flex: 1, color: c.text, fontWeight: "600" }]}>
          {props.schoolName || "Nenhuma escola selecionada"}
        </Text>
        {props.canChangeSchool && (
          <Pressable accessibilityRole="button" onPress={props.onChangeSchool} hitSlop={8} style={({ pressed }) => [{ minHeight: 44, justifyContent: "center" }, pressed && ui.pressed]}>
            <Text style={ui.linkText}>Trocar escola</Text>
          </Pressable>
        )}
      </View>
      {props.attention > 0 && (
        <Notice tone="warning" icon="alert-circle" action={{ label: "Revisar", onPress: props.onOpenAttention }}>
          {props.attention} digitalização(ões) esperam sua revisão.
        </Notice>
      )}
      {last && (
        <View style={[ui.card, { borderColor: c.accent, borderWidth: 2, padding: space.lg - 1 }]}>
          <Text style={[ui.small, { marginTop: 0, color: c.accent, fontWeight: "600" }]}>Continuar de onde parou</Text>
          <Text style={[ui.cardTitle, { marginTop: space.xs }]}>{last.title}</Text>
          <Text style={ui.small}>{last.className}</Text>
          {progress(last)}
          <Pressable
            accessibilityRole="button"
            disabled={captureDisabled(last)}
            style={({ pressed }) => [ui.primary, captureDisabled(last) && ui.disabled, pressed && ui.pressed]}
            onPress={() => props.onCapture(last)}
          >
            <Text style={ui.primaryText}>Continuar captura</Text>
          </Pressable>
        </View>
      )}
      <Text accessibilityRole="header" style={ui.sectionTitle}>
        Aplicações{sorted.length ? <Text style={ui.count}>{`  ${sorted.length}`}</Text> : null}
      </Text>
      <Text style={ui.small}>Use o cartão com QR Code gerado no portal. Confira também a escola impressa no cartão.</Text>
      {!sorted.length && (
        <EmptyState
          icon="calendar"
          title="Nenhuma aplicação disponível"
          text="No portal, abra Turmas e alunos, agende a avaliação para a turma e gere os cartões individuais."
        >
          <Pressable style={ui.secondary} onPress={props.onOpenPortal}>
            <Text style={ui.buttonText}>Abrir portal para preparar os cartões</Text>
          </Pressable>
        </EmptyState>
      )}
      {sorted.map((a) => {
        const selected = a.id === selectedId;
        const problem = answerKeyProblem(a);
        const closed = a.status === "closed";
        // O cartão é um contêiner; só o topo seleciona, e as ações ficam dentro dele.
        return (
          <View key={a.id} style={[ui.card, { padding: 0, overflow: "hidden" }, selected && { borderColor: c.accent, borderWidth: 2 }]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => props.onSelect(a)}
              style={({ pressed }) => [{ padding: selected ? space.lg - 1 : space.lg }, pressed && { backgroundColor: c.surfaceMuted }]}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                <Text style={[ui.cardTitle, { flex: 1 }]}>{a.title}</Text>
                {closed && <Text style={[ui.small, { marginTop: 2, fontWeight: "600" }]}>Encerrada</Text>}
                <Ionicons name={selected ? "chevron-up" : "chevron-down"} size={20} color={c.textMuted} />
              </View>
              <Text style={ui.small}>{[a.subject, a.className].filter(Boolean).join(", ")}</Text>
              {progress(a)}
              {!!answerKeyLine(a) && <Text style={ui.small}>{answerKeyLine(a)}</Text>}
              {!!problem && <Notice tone="danger" icon="key">{problem}</Notice>}
            </Pressable>
            {selected && (
              <View style={{ paddingHorizontal: space.lg - 1, paddingBottom: space.lg - 1, borderTopWidth: 1, borderTopColor: c.border }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={props.busy || !!problem}
                  style={({ pressed }) => [ui.primary, (props.busy || !!problem) && ui.disabled, pressed && ui.pressed]}
                  onPress={() => props.onCapture(a)}
                >
                  <Text style={ui.primaryText}>Fotografar cartões</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!props.connected}
                  style={({ pressed }) => [ui.secondary, !props.connected && ui.disabled, pressed && ui.pressed]}
                  onPress={() => props.onResults(a)}
                >
                  <Text style={ui.buttonText}>Revisar e autorizar resultados</Text>
                </Pressable>
                {!props.connected && <Text style={[ui.small, { marginTop: space.sm }]}>A revisão e a autorização dos resultados exigem conexão.</Text>}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}
