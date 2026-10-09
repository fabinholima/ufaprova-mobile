const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  load = require("./load-typescript.cjs");
const { educatorRegistrationPayload, registerEducator } = load(
  path.join(__dirname, "../educator-registration.ts"),
);
const form = {
  professionalRole: "teacher",
  displayName: " Professor Teste ",
  email: " Teacher@example.test ",
  cpf: "123.456.789-09",
  password: "TestPassword123!",
  confirmPassword: "TestPassword123!",
  subjects: "Matemática, Ciências",
  grades: "6º ano, 7º ano",
  stages: [],
  schoolName: "Escola Teste",
  schoolType: "estadual",
  address: "Rua Teste, 1",
  city: "Campo Grande",
  state: "ms",
};
test("teacher signup includes validated profile and first school without selecting server permissions", () => {
  const p = educatorRegistrationPayload(form);
  assert.equal(p.email, "teacher@example.test");
  assert.equal(p.cpf, "12345678909");
  assert.equal(p.role, undefined);
  assert.equal(p.portalAdmin, undefined);
  assert.equal(p.confirmPassword, undefined);
  assert.deepEqual(p.educatorProfile.subjects, ["Matemática", "Ciências"]);
  assert.deepEqual(p.educatorProfile.grades, ["6º ano", "7º ano"]);
  assert.deepEqual(p.educatorProfile.stages, []);
  assert.equal(p.educatorProfile.school.state, "MS");
});
test("coordinator signup requires stages and does not reuse hidden teacher fields", () => {
  assert.throws(
    () => educatorRegistrationPayload({ ...form, professionalRole: "coordinator" }),
    /etapas/,
  );
  const p = educatorRegistrationPayload({
    ...form,
    professionalRole: "coordinator",
    stages: ["Ensino Médio"],
  });
  assert.deepEqual(p.educatorProfile.subjects, []);
  assert.deepEqual(p.educatorProfile.grades, []);
  assert.deepEqual(p.educatorProfile.stages, ["Ensino Médio"]);
});
test("invalid or mismatched credentials never send the signup request", async (t) => {
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw Error("unexpected request");
  };
  for (const change of [
    { confirmPassword: "wrong" },
    { password: "short", confirmPassword: "short" },
    { subjects: "" },
    { cpf: "123" },
    { city: "" },
    { state: "XX" },
  ])
    await assert.rejects(registerEducator("https://api.example", { ...form, ...change }));
  assert.equal(calls, 0);
});
test("signup requires email verification and preserves clear API errors", async (t) => {
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.example/api/auth/register");
    assert.equal(options.headers["x-client"], "mobile");
    assert.equal(options.headers.origin, undefined);
    return Response.json({ data: { verificationRequired: true } });
  };
  assert.deepEqual(await registerEducator("https://api.example/", form), {
    email: "teacher@example.test",
    professionalRole: "teacher",
  });
  global.fetch = async () => Response.json({ error: "E-mail já cadastrado" }, { status: 409 });
  await assert.rejects(registerEducator("https://api.example", form), /já cadastrado/);
  global.fetch = async () => Response.json({ data: { token: "unexpected" } });
  await assert.rejects(registerEducator("https://api.example", form), /não confirmou/);
});
