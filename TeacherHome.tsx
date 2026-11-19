import { Pressable, Text, View } from "react-native";
import { answerKeyLine, answerKeyProblem } from "./application-contract";
import type { CorrectionApplication } from "./application-contract";
import type { LocalRecord } from "./offline-store";
import { applicationProgress, sortApplications } from "./teacher-dashboard";
import { EmptyState, Notice, ProgressBar } from "./components";
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
  const ui = useUi();
  const { applications, records, selectedId } = props;
  const sorted = sortApplications(applications);
  const last = sorted.find((a) => a.id === props.lastApplicationId && a.status !== "closed");
  const progressLine = (a: CorrectionApplication) => {
    const p = applicationProgress(a, records);
    return { p, text: `${p.completed} de ${p.students} corrigidos${p.waiting ? ` · ${p.waiting} no aparelho aguardando envio` : ""}` };
  };
  return (
    <>
      <View style={[ui.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <View style={{ flex: 1 }}>
          <Text style={ui.small}>Escola</Text>
          <Text style={ui.cardTitle}>{props.schoolName || "Nenhuma escola selecionada"}</Text>
        </View>
        {props.canChangeSchool && (
          <Pressable accessibilityRole="button" onPress={props.onChangeSchool} style={ui.passwordToggle}>
            <Text style={ui.linkText}>Trocar escola</Text>
          </Pressable>
        )}
      </View>
      {props.attention > 0 && (
        <Notice tone="warning" icon="alert-circle">
          {props.attention} digitalização(ões) esperam sua revisão.
        </Notice>
      )}
      {props.attention > 0 && (
        <Pressable accessibilityRole="button" style={ui.secondary} onPress={props.onOpenAttention}>
          <Text style={ui.buttonText}>Revisar pendências ({props.attention})</Text>
        </Pressable>
      )}
      {last && (
        <View style={[ui.card, ui.selected]}>
          <Text style={ui.small}>Continuar de onde parou</Text>
          <Text style={ui.cardTitle}>{last.title}</Text>
          <Text style={ui.small}>{last.className}</Text>
          <ProgressBar value={progressLine(last).p.completed} max={last.students} label={progressLine(last).text} />
          <Text style={ui.small}>{progressLine(last).text}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={props.busy || !!answerKeyProblem(last)}
            style={[ui.primary, (props.busy || !!answerKeyProblem(last)) && ui.disabled]}
            onPress={() => props.onCapture(last)}
          >
            <Text style={ui.primaryText}>Continuar captura</Text>
          </Pressable>
        </View>
      )}
      <Text style={ui.title}>Aplicações</Text>
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
        const { p, text } = progressLine(a);
        const problem = answerKeyProblem(a);
        return (
          <View key={a.id}>
            <Pressable accessibilityRole="radio" accessibilityState={{ selected }} style={[ui.card, selected && ui.selected]} onPress={() => props.onSelect(a)}>
              <Text style={ui.cardTitle}>{a.title}</Text>
              <Text style={ui.small}>{[a.subject, a.className, a.status === "closed" ? "Encerrada" : null].filter(Boolean).join(" · ")}</Text>
              <ProgressBar value={p.completed} max={a.students} label={text} />
              <Text style={ui.small}>{text}</Text>
              {!!answerKeyLine(a) && <Text style={ui.small}>{answerKeyLine(a)}</Text>}
              {!!problem && <Text style={ui.error}>{problem}</Text>}
            </Pressable>
            {selected && (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={props.busy || !!problem}
                  style={[ui.primary, (props.busy || !!problem) && ui.disabled]}
                  onPress={() => props.onCapture(a)}
                >
                  <Text style={ui.primaryText}>Fotografar cartões</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!props.connected}
                  style={[ui.secondary, !props.connected && ui.disabled]}
                  onPress={() => props.onResults(a)}
                >
                  <Text style={ui.buttonText}>Revisar e autorizar resultados</Text>
                </Pressable>
                {!props.connected && <Text style={ui.small}>A revisão e a autorização dos resultados exigem conexão.</Text>}
              </>
            )}
          </View>
        );
      })}
    </>
  );
}
