import { StyleSheet, Text, View } from "react-native";
import { ui } from "./ui-styles";
import type { StudentActivity } from "./student-api";
import { evolution, groupByPeriod, trend } from "./student-grades";

const number = (value: number) => String(value).replace(".", ",");
const shortDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

function result(activity: StudentActivity & { percent: number | null }) {
  if (activity.requiresManualReview) return "Aguardando revisão do professor";
  if (activity.score === null) return "Sem resultado disponível";
  return `Resultado: ${activity.score} / ${activity.maxScore}${
    activity.percent === null ? "" : ` (${number(activity.percent)}%)`
  }`;
}

export default function StudentGrades({ activities }: { activities: StudentActivity[] }) {
  const periods = groupByPeriod(activities),
    points = evolution(activities).slice(-8),
    change = trend(periods);
  if (!activities.length)
    return (
      <>
        <Text style={ui.title}>Minhas notas</Text>
        <Text style={ui.small}>Nenhuma atividade disponível.</Text>
      </>
    );
  return (
    <>
      <Text style={ui.title}>Minha evolução</Text>
      {points.length < 2 ? (
        <Text style={ui.small}>
          A evolução aparece quando houver pelo menos duas avaliações com nota.
        </Text>
      ) : (
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
      )}
      {change && (
        <Text style={ui.text}>
          {change.difference === 0
            ? `Sua média no ${change.current} ficou igual à do ${change.previous}.`
            : `Sua média no ${change.current} ficou ${number(Math.abs(change.difference))} pontos ${
                change.difference > 0 ? "acima" : "abaixo"
              } da do ${change.previous}.`}
        </Text>
      )}
      <Text style={ui.title}>Notas por período</Text>
      {periods.map((period) => (
        <View key={period.key}>
          <Text style={styles.period}>{period.label}</Text>
          <Text style={ui.small}>
            {period.average === null ? "Sem notas neste período" : `Média: ${number(period.average)}%`}
          </Text>
          {period.activities.map((activity) => (
            <View key={activity.id} style={ui.card}>
              <Text style={ui.cardTitle}>{activity.title}</Text>
              <Text style={ui.small}>
                {activity.schoolName} · {activity.className}
                {activity.scheduledAt ? ` · ${shortDate(new Date(activity.scheduledAt))}` : ""}
              </Text>
              <Text style={ui.text}>{result(activity)}</Text>
            </View>
          ))}
        </View>
      ))}
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
