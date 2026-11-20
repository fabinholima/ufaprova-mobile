import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { EmptyState, Loading, Notice, ProgressBar } from "./components";
import { parseStudentEssay, parseStudentEssays, studentStatus } from "./essay-contract";
import type { StudentEssay, StudentEssayDetail } from "./essay-contract";
import { useUi } from "./ui-styles";

type Request = <T>(path: string) => Promise<T>;
const date = (value: string | null) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "");

// Redações do aluno: propostas da turma e a correção publicada pelo professor.
// Escrever e enviar continua no portal.
export default function StudentEssays({ request, onOpenPortal }: { request: Request; onOpenPortal: () => void }) {
  const ui = useUi();
  const [essays, setEssays] = useState<StudentEssay[] | null>(null);
  const [detail, setDetail] = useState<StudentEssayDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setEssays(parseStudentEssays(await request<unknown>("/api/student/essays")));
    } catch (e) {
      // Uma API sem redações não deve parecer erro do aluno.
      const status = (e as { status?: number }).status;
      if (status === 404) setEssays([]);
      else setError(e instanceof Error ? e.message : "Não foi possível carregar as redações.");
    } finally {
      setBusy(false);
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(item: StudentEssay) {
    setBusy(true);
    setError("");
    try {
      setDetail(parseStudentEssay(await request<unknown>(`/api/student/essays/${item.id}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a redação.");
    } finally {
      setBusy(false);
    }
  }

  if (detail) {
    const result = detail.result;
    return (
      <View>
        <Text style={ui.title}>{detail.prompt.title}</Text>
        <Text style={ui.text}>{[detail.className, detail.teacherName].filter(Boolean).join(" · ")}</Text>
        {!!detail.prompt.theme && <Text style={ui.small}>Tema: {detail.prompt.theme}</Text>}
        {!result && <Notice>{studentStatus(detail.status)}. {detail.canWrite ? "Escreva ou envie a sua redação pelo portal." : "A nota aparece aqui quando o professor publicar a correção."}</Notice>}
        {result && (
          <>
            <View style={ui.card}>
              <Text style={ui.small}>Nota</Text>
              <Text style={ui.title}>
                {result.total ?? "—"}
                {result.maxScore ? ` de ${result.maxScore}` : ""}
              </Text>
              {!!result.annulmentReason && <Text style={ui.error}>Redação anulada: {result.annulmentReason}</Text>}
            </View>
            {result.criteria.map((c) => (
              <View key={c.id} style={ui.card}>
                <Text style={ui.cardTitle}>
                  Competência {c.numeral} · {c.score ?? "—"} de {c.maxScore}
                </Text>
                {!!c.title && <Text style={ui.small}>{c.title}</Text>}
                {c.score != null && <ProgressBar value={c.score} max={c.maxScore} label={`${c.score} de ${c.maxScore}`} />}
                {!!c.level && <Text style={ui.text}>{c.level}</Text>}
                {!!c.feedback && <Text style={ui.text}>{c.feedback}</Text>}
              </View>
            ))}
            {[
              ["Comentário do professor", result.comments],
              ["Pontos fortes", result.strengths],
              ["O que melhorar", result.improvements],
              ["Sugestões de reescrita", result.rewriteSuggestions],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <View key={label} style={ui.card}>
                  <Text style={ui.cardTitle}>{label}</Text>
                  <Text style={ui.text}>{value}</Text>
                </View>
              ))}
          </>
        )}
        {detail.canWrite && (
          <Pressable accessibilityRole="button" style={ui.secondary} onPress={onOpenPortal}>
            <Text style={ui.buttonText}>Abrir portal para escrever</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" style={ui.secondary} onPress={() => setDetail(null)}>
          <Text style={ui.buttonText}>Voltar para redações</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View>
      {busy && <Loading label="Carregando redações" />}
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {essays && !essays.length && (
        <EmptyState icon="create" title="Nenhuma redação ainda" text="As propostas de redação das suas turmas aparecem aqui." />
      )}
      {essays?.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" disabled={busy} style={ui.card} onPress={() => void open(item)}>
          <Text style={ui.cardTitle}>{item.title}</Text>
          <Text style={ui.small}>{[item.className, item.dueAt ? `entrega até ${date(item.dueAt)}` : date(item.appliedOn)].filter(Boolean).join(" · ")}</Text>
          <Text style={ui.small}>
            {item.total != null ? `Nota ${item.total}${item.maxScore ? ` de ${item.maxScore}` : ""}` : studentStatus(item.submissionStatus)}
          </Text>
        </Pressable>
      ))}
      {essays && (
        <Pressable accessibilityRole="button" disabled={busy} style={ui.secondary} onPress={() => void load()}>
          <Text style={ui.buttonText}>Atualizar</Text>
        </Pressable>
      )}
    </View>
  );
}
