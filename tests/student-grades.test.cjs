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

test("home is organized by subject and a published evaluation opens questions, skills and guidance", async (t) => {
  const { groupBySubject, countSummary } = load(path.join(__dirname, "../student-grades.ts"));
  const published = (id, subject, percent, extra = {}) => ({
    ...activity(id, "2026-05-05T12:00:00", "2", "3"), subject, resultId: `r-${id}`, resultStatus: "published",
    percent, validCount: 3, correctCount: 2, incorrectCount: 1, blankCount: 0, invalidCount: 0, annulledCount: 0, ...extra,
  });
  const list = [
    published("q1", "Química", 66.67),
    published("q2", "Química", 100, { scheduledAt: "2026-06-05T12:00:00", correctCount: 3, incorrectCount: 0 }),
    published("f1", "Física", 50),
    { ...activity("p", "2026-06-10T12:00:00", null, null, true), subject: "Física", resultStatus: "in_correction" },
  ];
  assert.deepEqual(groupBySubject(list).map((g) => [g.subject, g.activities.length, g.average]), [["Física", 2, 50], ["Química", 2, 83.3]]);
  assert.equal(countSummary(list[0]), "2 acerto(s) de 3 · 1 erro(s) · 0 em branco");
  const requests = [];
  const detail = {
    ...list[0], releasePolicy: "answers_and_key", minSkillEvidence: 3,
    questions: [{ questionNumber: 1, status: "incorrect", selectedLabels: ["A"], correctLabels: ["B"] }],
    skills: [{ code: "EM13CNT101", description: "Analisar transformações", questions: 2, correct: 1, percent: 50, sufficientEvidence: false }],
    guidance: { text: "Refaça a lista 3.", publishedAt: "2026-05-06T12:00:00Z" },
  };
  const request = async (url) => {
    requests.push(url);
    if (url === "/api/student/skill-performance") return [{ subject: "Química", assessments: 2, minSkillEvidence: 3, skills: [{ code: "EM13CNT101", description: null, questions: 4, correct: 3, percent: 75, sufficientEvidence: true }] }];
    if (url === "/api/student/results/r-q1") return detail;
    throw Error(url);
  };
  const { default: Grades } = load(path.join(__dirname, "../StudentGrades.tsx"), {
    "react-native": { StyleSheet: { create: (x) => x }, Text: "Text", View: "View", Pressable: "Pressable" },
    "./ui-styles": { ui: {} },
  });
  let component;
  await renderer.act(async () => { component = renderer.create(React.createElement(Grades, { activities: list, request })); });
  t.after(() => renderer.act(() => component.unmount()));
  const press = async (label) => {
    const node = component.root.findAll((n) => n.type === "Pressable" && text(n).includes(label))[0];
    assert(node, `Missing ${label}`);
    await renderer.act(async () => node.props.onPress());
  };
  let all = text(component.root);
  assert(all.includes("Minhas disciplinas"));
  assert(all.includes("Física2 avaliação(ões) · média de acertos 50%"));
  assert(all.includes("média de acertos 83,3%"));
  assert(!all.includes("Prova q1"), "avaliações só aparecem dentro da disciplina");
  await press("Química");
  all = text(component.root);
  assert(all.includes("Média de acertos: 83,3%"));
  assert(all.includes("2 acerto(s) de 3 · 1 erro(s) · 0 em branco"));
  assert(all.includes("3 de 4 questão(ões) · 75%"));
  assert(!all.includes("Poucas questões"));
  await press("Prova q1");
  all = text(component.root);
  assert.deepEqual(requests, ["/api/student/skill-performance", "/api/student/results/r-q1"]);
  assert(all.includes("Orientação do professorRefaça a lista 3."));
  assert(all.includes("Questão 1 · Incorreta"));
  assert(all.includes("Sua marcação: A"));
  assert(all.includes("Gabarito: B"));
  assert(all.includes("1 de 2 questão(ões) · 50%"));
  assert(all.includes("Poucas questões para avaliar esta habilidade."));
  await press("Voltar à disciplina");
  await press("Todas as disciplinas");
  await press("Física");
  all = text(component.root);
  assert(all.includes("Aguardando revisão do professor"));
  assert.equal(component.root.findAll((n) => n.type === "Pressable" && text(n).includes("Prova p")).length, 0, "resultado em correção não abre detalhe");
});

test("summary-only policy explains that questions were not released", async (t) => {
  const { default: Grades } = load(path.join(__dirname, "../StudentGrades.tsx"), {
    "react-native": { StyleSheet: { create: (x) => x }, Text: "Text", View: "View", Pressable: "Pressable" },
    "./ui-styles": { ui: {} },
  });
  const item = { ...activity("s", "2026-05-05T12:00:00", "2", "3"), subject: "Química", resultId: "r-s", resultStatus: "published", percent: 66.67 };
  const request = async (url) => url.endsWith("skill-performance") ? [] : { ...item, releasePolicy: "summary", questions: [], skills: [], minSkillEvidence: 3, guidance: null };
  let component;
  await renderer.act(async () => { component = renderer.create(React.createElement(Grades, { activities: [item], request })); });
  t.after(() => renderer.act(() => component.unmount()));
  await renderer.act(async () => component.root.findAll((n) => n.type === "Pressable")[0].props.onPress());
  assert(text(component.root).includes("O professor liberou apenas o resumo desta avaliação."));
  assert(!text(component.root).includes("Orientação do professor"));
});
