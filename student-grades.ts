import type { StudentActivity } from "./student-api";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type GradedActivity = StudentActivity & { percent: number | null };
export type GradePeriod = {
  key: string;
  label: string;
  average: number | null;
  activities: GradedActivity[];
};
export type EvolutionPoint = { id: string; title: string; date: Date; percent: number };

export function percentOf(activity: StudentActivity) {
  if (activity.requiresManualReview) return null;
  // Percentual de acertos calculado no servidor sobre as questões válidas.
  if (typeof activity.percent === "number") return activity.percent;
  if (activity.score === null || activity.maxScore === null) return null;
  const score = Number(activity.score),
    max = Number(activity.maxScore);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((score / max) * 1000) / 10;
}

function dateOf(activity: StudentActivity) {
  const date = activity.scheduledAt ? new Date(activity.scheduledAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// Periods follow the application date in quarters of the calendar year; no school calendar is stored.
export function periodOf(date: Date | null) {
  if (!date) return { key: "sem-data", label: "Sem data de aplicação" };
  const year = date.getFullYear(),
    index = Math.floor(date.getMonth() / 3);
  return {
    key: `${year}-${index + 1}`,
    label: `${index + 1}º período · ${MONTHS[index * 3]}–${MONTHS[index * 3 + 2]} ${year}`,
  };
}

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null;
}

export function groupByPeriod(activities: StudentActivity[]): GradePeriod[] {
  const periods = new Map<string, GradePeriod & { time: number }>();
  for (const activity of activities) {
    const date = dateOf(activity),
      { key, label } = periodOf(date);
    const period = periods.get(key) || { key, label, average: null, activities: [], time: -Infinity };
    period.activities.push({ ...activity, percent: percentOf(activity) });
    if (date) period.time = Math.max(period.time, date.getTime());
    periods.set(key, period);
  }
  return [...periods.values()]
    .sort((a, b) => b.time - a.time)
    .map(({ time: _time, ...period }) => ({
      ...period,
      activities: period.activities.sort(
        (a, b) => (dateOf(b)?.getTime() ?? -Infinity) - (dateOf(a)?.getTime() ?? -Infinity),
      ),
      average: average(
        period.activities.flatMap((item) => (item.percent === null ? [] : [item.percent])),
      ),
    }));
}

export function evolution(activities: StudentActivity[]): EvolutionPoint[] {
  return activities
    .flatMap((activity) => {
      const date = dateOf(activity),
        percent = percentOf(activity);
      return date && percent !== null ? [{ id: activity.id, title: activity.title, date, percent }] : [];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Compares the two most recent dated periods that have results.
export function trend(periods: GradePeriod[]) {
  const [current, previous] = periods.filter((p) => p.key !== "sem-data" && p.average !== null);
  if (!current || !previous) return null;
  return {
    current: current.label,
    previous: previous.label,
    difference: Math.round((current.average! - previous.average!) * 10) / 10,
  };
}

export const NO_SUBJECT = "Sem disciplina";
export type SubjectGroup = { subject: string; average: number | null; graded: number; activities: StudentActivity[] };

// Tela inicial do aluno: uma entrada por disciplina, em ordem alfabética.
export function groupBySubject(activities: StudentActivity[]): SubjectGroup[] {
  const groups = new Map<string, StudentActivity[]>();
  for (const activity of activities) {
    const subject = activity.subject?.trim() || NO_SUBJECT;
    groups.set(subject, [...(groups.get(subject) ?? []), activity]);
  }
  return [...groups]
    .map(([subject, items]) => {
      const percents = items.flatMap((item) => {
        const value = percentOf(item);
        return value === null ? [] : [value];
      });
      return { subject, average: average(percents), graded: percents.length, activities: items };
    })
    .sort((a, b) => (a.subject === NO_SUBJECT ? 1 : b.subject === NO_SUBJECT ? -1 : a.subject.localeCompare(b.subject, "pt-BR")));
}

export function countSummary(activity: StudentActivity): string | null {
  if (activity.correctCount == null || activity.validCount == null) return null;
  const parts = [
    `${activity.correctCount} acerto(s) de ${activity.validCount}`,
    `${activity.incorrectCount ?? 0} erro(s)`,
    `${activity.blankCount ?? 0} em branco`,
  ];
  if (activity.invalidCount) parts.push(`${activity.invalidCount} com marcação inválida`);
  if (activity.annulledCount) parts.push(`${activity.annulledCount} anulada(s)`);
  return parts.join(" · ");
}
