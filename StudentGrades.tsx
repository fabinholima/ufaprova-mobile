import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUi } from "./ui-styles";
import { useColors, radius, space } from "./theme";
import type { Palette } from "./theme";
import type { SkillIndicator, StudentActivity, StudentResultDetail, SubjectSkills } from "./student-api";
import {
  BAND_LABEL,
  SKILL_GOAL,
  countSummary,
  evolution,
  groupByPeriod,
  groupBySubject,
  percentOf,
  skillBand,
  skillsToReinforce,
  studentSummary,
  trend,
} from "./student-grades";
import type { SkillBand } from "./student-grades";

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

const bandColor = (c: Palette, band: SkillBand) =>
  ({ consolidated: c.success, adequate: c.accent, developing: c.warning, intervention: c.danger })[band];

// Uma barra por habilidade, com a meta mínima (Adequado, 60%) marcada. Só
// entra em "para reforçar" o que tem questões suficientes para concluir algo.
function Skills({ skills, minimum }: { skills: SkillIndicator[]; minimum: number }) {
  const ui = useUi(),
    c = useColors();
  if (!skills.length) return null;
  const reinforce = skillsToReinforce(skills);
  return (
    <>
      <Text style={[styles.period, { color: c.text }]}>Habilidades da BNCC</Text>
      <Text style={ui.small}>
        Acertos nas questões ligadas a cada habilidade. A linha marca a meta de {SKILL_GOAL}%. Com menos de {minimum}{" "}
        questões, o resultado ainda não permite conclusões.
      </Text>
      {reinforce.length > 0 && (
        <View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
          <Ionicons name="flag" size={18} color={c.warning} />
          <Text style={{ color: c.warning, flex: 1, fontSize: 14, lineHeight: 20 }}>
            Para reforçar: {reinforce.map((skill) => `${skill.code} (${number(skill.percent)}%)`).join(", ")}
          </Text>
        </View>
      )}
      {skills.map((skill) => {
        const band = skillBand(skill.percent),
          color = skill.sufficientEvidence ? bandColor(c, band) : c.textMuted;
        return (
          <View key={skill.code} style={ui.card}>
            <View style={styles.skillHead}>
              <Text style={[ui.cardTitle, { flexShrink: 1 }]}>{skill.code}</Text>
              {skill.sufficientEvidence && <Text style={[styles.band, { color }]}>{BAND_LABEL[band]}</Text>}
            </View>
            {!!skill.description && <Text style={ui.small}>{skill.description}</Text>}
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(skill.percent) }}
              style={[styles.skillTrack, { backgroundColor: c.surfaceMuted }]}
            >
              <View style={{ width: `${Math.min(100, skill.percent)}%`, height: "100%", backgroundColor: color, borderRadius: radius.pill }} />
              <View style={[styles.goal, { left: `${SKILL_GOAL}%`, backgroundColor: c.text }]} />
            </View>
            <Text style={ui.text}>
              {skill.correct} de {skill.questions} questão(ões) · {number(skill.percent)}%
            </Text>
            {!skill.sufficientEvidence && <Text style={ui.small}>Poucas questões para avaliar esta habilidade.</Text>}
          </View>
        );
      })}
    </>
  );
}

// Resumo do topo: última nota, média do período e tendência.
function Summary({ activities }: { activities: StudentActivity[] }) {
  const ui = useUi(),
    c = useColors();
  const { last, period, difference, pending } = studentSummary(activities);
  if (!last && !pending) return null;
  const up = difference !== null && difference > 0,
    down = difference !== null && difference < 0;
  const trendColor = up ? c.success : down ? c.danger : c.textMuted;
  return (
    <View style={[ui.card, styles.summary]}>
      <View style={styles.tile}>
        <Text style={[styles.tileLabel, { color: c.textMuted }]}>Última nota</Text>
        <Text style={[styles.big, { color: c.text }]}>{last ? `${number(Math.round(last.percent))}%` : "—"}</Text>
        {!!last && (
          <Text numberOfLines={2} style={[styles.tileNote, { color: c.textMuted }]}>
            {last.title} · {shortDate(last.date)}
          </Text>
        )}
      </View>
      <View style={[styles.tile, styles.tileBorder, { borderColor: c.border }]}>
        <Text style={[styles.tileLabel, { color: c.textMuted }]}>Média do período</Text>
        <Text style={[styles.big, { color: c.text }]}>{period ? `${number(Math.round(period.average))}%` : "—"}</Text>
        {!!period && (
          <Text numberOfLines={2} style={[styles.tileNote, { color: c.textMuted }]}>
            {period.label.split(" · ")[0]}
          </Text>
        )}
      </View>
      <View style={[styles.tile, styles.tileBorder, { borderColor: c.border }]}>
        <Text style={[styles.tileLabel, { color: c.textMuted }]}>Tendência</Text>
        <View style={styles.trendRow}>
          <Ionicons name={up ? "trending-up" : down ? "trending-down" : "remove"} size={22} color={trendColor} />
          <Text style={[styles.big, { color: trendColor, fontSize: 20 }]}>
            {difference === null ? "—" : `${up ? "+" : ""}${number(difference)}`}
          </Text>
        </View>
        <Text numberOfLines={2} style={[styles.tileNote, { color: c.textMuted }]}>
          {difference === null ? "Precisa de dois períodos" : "pontos vs. anterior"}
        </Text>
      </View>
      {pending > 0 && (
        <Text style={[ui.small, styles.pending]}>{pending} avaliação(ões) aguardando revisão do professor.</Text>
      )}
    </View>
  );
}

function Detail({ detail, onBack }: { detail: StudentResultDetail; onBack: () => void }) {
  const ui = useUi(),
    c = useColors();
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
      <Text style={[styles.period, { color: c.text }]}>Questões</Text>
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

const CHART_HEIGHT = 150;

// Gráfico de linha feito com Views (sem biblioteca nativa): pontos em
// percentual da largura e segmentos girados entre eles. A linha tracejada é a
// meta mínima usada pela instituição.
function Evolution({ activities }: { activities: StudentActivity[] }) {
  const ui = useUi(),
    c = useColors();
  const [width, setWidth] = useState(0);
  const points = evolution(activities).slice(-8);
  if (points.length < 2)
    return <Text style={ui.small}>A evolução aparece quando houver pelo menos duas avaliações com nota.</Text>;
  const step = 100 / points.length,
    xOf = (index: number) => step * index + step / 2,
    yOf = (percent: number) => CHART_HEIGHT - (Math.min(100, Math.max(0, percent)) / 100) * CHART_HEIGHT;
  return (
    <View style={ui.card}>
      <View style={styles.chart} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {[0, 50, 100].map((line) => (
          <View key={line} style={[styles.grid, { top: yOf(line), borderColor: c.border }]} />
        ))}
        <View style={[styles.grid, styles.goalLine, { top: yOf(SKILL_GOAL), borderColor: c.warning }]} />
        <Text style={[styles.goalLabel, { top: yOf(SKILL_GOAL) - 16, color: c.warning }]}>meta {SKILL_GOAL}%</Text>
        {width > 0 &&
          points.slice(1).map((point, index) => {
            const x1 = (xOf(index) / 100) * width,
              y1 = yOf(points[index].percent),
              x2 = (xOf(index + 1) / 100) * width,
              y2 = yOf(point.percent);
            const length = Math.hypot(x2 - x1, y2 - y1);
            return (
              <View
                key={`line-${point.id}`}
                style={{
                  position: "absolute",
                  left: (x1 + x2) / 2 - length / 2,
                  top: (y1 + y2) / 2 - 1.5,
                  width: length,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: c.accent,
                  transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
                }}
              />
            );
          })}
        {points.map((point, index) => (
          <View
            key={point.id}
            accessible
            accessibilityLabel={`${point.title}, ${shortDate(point.date)}: ${number(point.percent)}%`}
            style={[styles.point, { left: `${xOf(index)}%`, top: yOf(point.percent) - 6, borderColor: c.accent, backgroundColor: c.surface }]}
          >
            <Text style={[styles.value, { color: c.text }]}>{Math.round(point.percent)}%</Text>
          </View>
        ))}
      </View>
      <View style={styles.dates}>
        {points.map((point) => (
          <Text key={point.id} style={[styles.date, { color: c.textMuted }]}>
            {shortDate(point.date)}
          </Text>
        ))}
      </View>
      <Text style={ui.small}>Percentual de acerto nas últimas avaliações, da mais antiga para a mais recente.</Text>
    </View>
  );
}

// Tela inicial do aluno organizada por disciplina. Só aparecem resultados
// publicados pelo professor; não há comparação com colegas.
export default function StudentGrades({ activities, request }: { activities: StudentActivity[]; request?: Request }) {
  const ui = useUi(),
    c = useColors();
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
        <Summary activities={activities} />
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
      {subjects.length === 1 && <Summary activities={activities} />}
      <Text style={ui.title}>{current.subject}</Text>
      {current.average !== null && <Text style={ui.text}>Média de acertos: {number(current.average)}%</Text>}
      <Text style={[styles.period, { color: c.text }]}>Minha evolução</Text>
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
          <Text style={[styles.period, { color: c.text }]}>{period.label}</Text>
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
  chart: { height: CHART_HEIGHT, marginTop: 24, marginBottom: 4 },
  grid: { position: "absolute", left: 0, right: 0, borderTopWidth: 1 },
  goalLine: { borderStyle: "dashed" },
  goalLabel: { position: "absolute", right: 0, fontSize: 11, fontWeight: "600" },
  point: { position: "absolute", width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 3, alignItems: "center" },
  value: { position: "absolute", bottom: 12, width: 44, textAlign: "center", fontSize: 12, fontWeight: "700" },
  dates: { flexDirection: "row", marginTop: 6 },
  date: { flex: 1, textAlign: "center", fontSize: 11 },
  period: { fontSize: 18, fontWeight: "700", marginTop: 20 },
  summary: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 0 },
  tile: { flex: 1, paddingHorizontal: space.md, minWidth: 0 },
  tileBorder: { borderLeftWidth: 1 },
  tileLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  big: { fontSize: 26, fontWeight: "800", marginTop: 4 },
  tileNote: { fontSize: 12, marginTop: 2 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, minHeight: 34 },
  pending: { width: "100%", paddingHorizontal: space.md, marginTop: space.sm },
  notice: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", borderRadius: radius.md, padding: space.md, marginTop: space.md },
  skillHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  band: { fontSize: 12, fontWeight: "700" },
  skillTrack: { height: 10, borderRadius: radius.pill, marginTop: space.sm, marginBottom: 4, overflow: "visible" },
  goal: { position: "absolute", top: -3, width: 2, height: 16, marginLeft: -1 },
});
