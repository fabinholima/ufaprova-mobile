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
  if (activity.requiresManualReview || activity.score === null || activity.maxScore === null) return null;
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
