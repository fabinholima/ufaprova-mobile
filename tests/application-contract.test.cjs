const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  load = require("./load-typescript.cjs");
const { parseApplications } = load(path.join(__dirname, "../application-contract.ts"));
const entry = {
  id: "10000000-0000-4000-8000-000000000001",
  assessmentId: "20000000-0000-4000-8000-000000000001",
  classId: "30000000-0000-4000-8000-000000000001",
  title: "Prova",
  className: "Turma",
  status: "scheduled",
  students: 2,
  completed: 2,
};
test("only applications with enrolled students can be selected; cancelled applications are hidden", () => {
  assert.equal(
    parseApplications([entry, { ...entry, status: "cancelled" }, { ...entry, students: 0 }]).length,
    1,
  );
  assert.throws(() => parseApplications([{ ...entry, assessmentId: undefined }]));
  assert.throws(() => parseApplications([{ ...entry, status: "unknown" }]));
});
