import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ui } from "./ui-styles";
import type { SkillIndicator, StudentActivity, StudentResultDetail, SubjectSkills } from "./student-api";
import { countSummary, evolution, groupByPeriod, groupBySubject, percentOf, trend } from "./student-grades";

const number = (value: number) => String(value).replace(".", ",");
const shortDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
type Request = <T>(path: string) => Promise<T>;

const QUESTION_LABEL: Record<string, string> = {
  correct: "Correta",
  incorrect: "Incorreta",
  blank: "Em branco",
  invalid: "Marcação inválida",
  annulled: "Anulada",
  manual_graded: "Discursiva corrigida",
};

function result(activity: StudentActivity & { percent: number | null }) {
  if (activity.requiresManualReview) return "Aguardando revisão do professor";
  if (activity.score === null) return "Sem resultado disponível";
  return `Resultado: ${activity.score} / ${activity.maxScore}${
    activity.percent === null ? "" : ` (${number(activity.percent)}%)`
  }`;
}

function Skills({ skills, minimum }: { skills: SkillIndicator[]; minimum: number }) {
  if (!skills.length) return null;
  return (
    <>
      <Text style={styles.period}>Habilidades da BNCC</Text>
      <Text style={ui.small}>
        Acertos nas questões ligadas a cada habilidade. Com menos de {minimum} questões, o resultado ainda não permite
        conclusões.
      </Text>
      {skills.map((skill) => (
        <View key={skill.code} style={ui.card}>
          <Text style={ui.cardTitle}>{skill.code}</Text>
          {!!skill.description && <Text style={ui.small}>{skill.description}</Text>}
          <Text style={ui.text}>
            {skill.correct} de {skill.questions} questão(ões) · {number(skill.percent)}%
          </Text>
          {!skill.sufficientEvidence && <Text style={ui.small}>Poucas questões para avaliar esta habilidade.</Text>}
        </View>
      ))}
    </>
  );
}

function Detail({ detail, onBack }: { detail: StudentResultDetail; onBack: () => void }) {
  const summary = countSummary(detail);
  return (
    <>
      <Text style={ui.title}>{detail.title}</Text>
      <Text style={ui.small}>
        {[detail.subject, detail.className, detail.scheduledAt ? shortDate(new Date(detail.scheduledAt)) : null]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {!!summary && <Text style={ui.text}>{summary}</Text>}
      {detail.percent != null && <Text style={ui.text}>Aproveitamento: {number(detail.percent)}%</Text>}
      {detail.score != null && <Text style={ui.text}>Nota: {detail.score} de {detail.maxScore}</Text>}
      {detail.guidance && (
        <View style={[ui.card, ui.selected]}>
          <Text style={ui.cardTitle}>Orientação do professor</Text>
          <Text style={ui.text}>{detail.guidance.text}</Text>
        </View>
      )}
      <Text style={styles.period}>Questões</Text>
      {!detail.questions.length ? (
        <Text style={ui.small}>O professor liberou apenas o resumo desta avaliação.</Text>
      ) : (
        detail.questions.map((question) => (
          <View key={question.questionNumber} style={ui.card}>
            <Text style={ui.cardTitle}>
              Questão {question.questionNumber} · {QUESTION_LABEL[question.status] ?? question.status}
            </Text>
            {question.selectedLabels && (
              <Text style={ui.small}>
                Sua marcação: {question.selectedLabels.length ? question.selectedLabels.join(", ") : "nenhuma"}
              </Text>
            )}
            {question.correctLabels && <Text style={ui.small}>Gabarito: {question.correctLabels.join(", ")}</Text>}
          </View>
        ))
      )}
      <Skills skills={detail.skills} minimum={detail.minSkillEvidence} />
      <Pressable accessibilityRole="button" style={ui.secondary} onPress={onBack}>
        <Text style={ui.buttonText}>Voltar à disciplina</Text>
      </Pressable>
    </>
  );
}

function Evolution({ activities }: { activities: StudentActivity[] }) {
  const points = evolution(activities).slice(-8);
  if (points.length < 2)
    return <Text style={ui.small}>A evolução aparece quando houver pelo menos duas avaliações com nota.</Text>;
  return (
    <View style={ui.card}>
      <View style={styles.chart}>
        {points.map((point) => (
          <View
            key={point.id}
            style={styles.column}
            accessible
            accessibilityLabel={`${point.title}, ${shortDate(point.date)}: ${number(point.percent)}%`}
          >
            <Text style={styles.value}>{Math.round(point.percent)}%</Text>
            <View style={styles.track}>
              <View style={[styles.bar, { height: `${Math.max(point.percent, 2)}%` }]} />
            </View>
            <Text style={styles.date}>{shortDate(point.date)}</Text>
          </View>
        ))}
      </View>
      <Text style={ui.small}>Percentual de acerto nas últimas avaliações, da mais antiga para a mais recente.</Text>
    </View>
  );
}

// Tela inicial do aluno organizada por disciplina. Só aparecem resultados
// publicados pelo professor; não há comparação com colegas.
export default function StudentGrades({ activities, request }: { activities: StudentActivity[]; request?: Request }) {
  const subjects = groupBySubject(activities);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentResultDetail | null>(null);
  const [skills, setSkills] = useState<SubjectSkills[] | null>(null);
  const [error, setError] = useState("");
  const current = subjects.length === 1 ? subjects[0] : subjects.find((group) => group.subject === open);

  useEffect(() => {
    if (!request || !current || skills) return;
    // Uma API anterior sem esta rota não deve esconder as notas.
    request<SubjectSkills[]>("/api/student/skill-performance").then(setSkills, () => setSkills([]));
  }, [request, current, skills]);

  if (!activities.length)
    return (
      <>
        <Text style={ui.title}>Minhas notas</Text>
        <Text style={ui.small}>Nenhuma atividade disponível.</Text>
      </>
    );

  if (detail) return <Detail detail={detail} onBack={() => setDetail(null)} />;

  async function openResult(activity: StudentActivity) {
    if (!request || !activity.resultId) return;
    setError("");
    try {
      setDetail(await request<StudentResultDetail>(`/api/student/results/${activity.resultId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a avaliação.");
    }
  }

  if (!current)
    return (
      <>
        <Text style={ui.title}>Minhas disciplinas</Text>
        {subjects.map((group) => (
          <Pressable
            key={group.subject}
            accessibilityRole="button"
            style={ui.card}
            onPress={() => setOpen(group.subject)}
          >
            <Text style={ui.cardTitle}>{group.subject}</Text>
            <Text style={ui.small}>
              {group.activities.length} avaliação(ões)
              {group.average === null ? " · sem notas publicadas" : ` · média de acertos ${number(group.average)}%`}
            </Text>
          </Pressable>
        ))}
      </>
    );

  const periods = groupByPeriod(current.activities),
    change = trend(periods),
    subjectSkills = skills?.find((entry) => entry.subject === current.subject);
  return (
    <>
      <Text style={ui.title}>{current.subject}</Text>
      {current.average !== null && <Text style={ui.text}>Média de acertos: {number(current.average)}%</Text>}
      <Text style={styles.period}>Minha evolução</Text>
      <Evolution activities={current.activities} />
      {change && (
        <Text style={ui.text}>
          {change.difference === 0
            ? `Sua média no ${change.current} ficou igual à do ${change.previous}.`
            : `Sua média no ${change.current} ficou ${number(Math.abs(change.difference))} pontos ${
                change.difference > 0 ? "acima" : "abaixo"
              } da do ${change.previous}.`}
        </Text>
      )}
      {!!error && <Text style={ui.error}>{error}</Text>}
      <Text style={ui.title}>Notas por período</Text>
      {periods.map((period) => (
        <View key={period.key}>
          <Text style={styles.period}>{period.label}</Text>
          <Text style={ui.small}>
            {period.average === null ? "Sem notas neste período" : `Média: ${number(period.average)}%`}
          </Text>
          {period.activities.map((activity) => {
            const opens = !!request && !!activity.resultId && activity.resultStatus === "published";
            const summary = countSummary(activity);
            const body = (
              <>
                <Text style={ui.cardTitle}>{activity.title}</Text>
                <Text style={ui.small}>
                  {activity.schoolName} · {activity.className}
                  {activity.scheduledAt ? ` · ${shortDate(new Date(activity.scheduledAt))}` : ""}
                </Text>
                <Text style={ui.text}>{result({ ...activity, percent: percentOf(activity) })}</Text>
                {!!summary && <Text style={ui.small}>{summary}</Text>}
                {opens && <Text style={ui.linkText}>Ver questões e orientações</Text>}
              </>
            );
            return opens ? (
              <Pressable key={activity.id} accessibilityRole="button" style={ui.card} onPress={() => void openResult(activity)}>
                {body}
              </Pressable>
            ) : (
              <View key={activity.id} style={ui.card}>
                {body}
              </View>
            );
          })}
        </View>
      ))}
      {subjectSkills && <Skills skills={subjectSkills.skills} minimum={subjectSkills.minSkillEvidence} />}
      {subjects.length > 1 && (
        <Pressable accessibilityRole="button" style={ui.secondary} onPress={() => setOpen(null)}>
          <Text style={ui.buttonText}>Todas as disciplinas</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 160 },
  column: { flex: 1, alignItems: "center", height: "100%" },
  value: { color: "#0f172a", fontSize: 12, fontWeight: "700" },
  track: { flex: 1, width: "70%", justifyContent: "flex-end", marginVertical: 4 },
  bar: { backgroundColor: "#2563eb", borderRadius: 4, width: "100%" },
  date: { color: "#64748b", fontSize: 11 },
  period: { color: "#0f172a", fontSize: 18, fontWeight: "700", marginTop: 20 },
});
