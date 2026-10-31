const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const { groupByPeriod, evolution, trend, percentOf, periodOf } = load(
  path.join(__dirname, "../student-grades.ts"),
);
const activity = (id, scheduledAt, score, maxScore = "10", requiresManualReview = false) => ({
  id,
  title: `Prova ${id}`,
  className: "6º A",
  schoolName: "Escola",
  score,
  maxScore,
  requiresManualReview,
  scheduledAt,
});
const sample = [
  activity("a", "2026-02-10T12:00:00", "6"),
  activity("b", "2026-03-20T12:00:00", "8"),
  activity("c", "2026-05-05T12:00:00", "9"),
  activity("d", "2026-06-15T12:00:00", "4", "10", true),
  activity("e", null, "7"),
  activity("f", "2026-04-01T12:00:00", null, null),
];

test("activities are grouped by calendar quarter of the application date, newest first", () => {
  assert.equal(periodOf(new Date(2026, 6, 1)).label, "3º período · jul–set 2026");
  const periods = groupByPeriod(sample);
  assert.deepEqual(
    periods.map((p) => [p.label, p.activities.map((a) => a.id), p.average]),
    [
      ["2º período · abr–jun 2026", ["d", "c", "f"], 90],
      ["1º período · jan–mar 2026", ["b", "a"], 70],
      ["Sem data de aplicação", ["e"], 70],
    ],
  );
});

test("pending manual review and missing scores never count toward averages or evolution", () => {
  assert.equal(percentOf(sample[3]), null);
  assert.equal(percentOf(sample[5]), null);
  assert.equal(percentOf(activity("z", null, "5", "0")), null);
  assert.deepEqual(
    evolution(sample).map((p) => [p.id, p.percent]),
    [
      ["a", 60],
      ["b", 80],
      ["c", 90],
    ],
  );
  assert.deepEqual(trend(groupByPeriod(sample)), {
    current: "2º período · abr–jun 2026",
    previous: "1º período · jan–mar 2026",
    difference: 20,
  });
  assert.equal(trend(groupByPeriod([sample[0]])), null);
});

test("student sees the evolution chart, the trend and grades under each period", async (t) => {
  const { default: Grades } = load(path.join(__dirname, "../StudentGrades.tsx"), {
    "react-native": { StyleSheet: { create: (x) => x }, Text: "Text", View: "View" },
    "./ui-styles": { ui: {} },
  });
  let component;
  await renderer.act(async () => {
    component = renderer.create(React.createElement(Grades, { activities: sample }));
  });
  t.after(() => renderer.act(() => component.unmount()));
  const all = text(component.root);
  assert.equal(component.root.findAll((n) => n.props.accessibilityLabel?.endsWith("%")).length, 3);
  assert(all.includes("20 pontos acima"));
  assert(all.includes("Média: 90%"));
  assert(all.includes("Resultado: 8 / 10 (80%)"));
  assert(all.includes("Aguardando revisão do professor"));
  assert(!all.includes("4 / 10"));
  await renderer.act(async () => component.update(React.createElement(Grades, { activities: [sample[0]] })));
  assert(text(component.root).includes("pelo menos duas avaliações"));
});
