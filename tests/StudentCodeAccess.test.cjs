const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
async function setup(t, fetchImpl) {
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  const calls = [],
    sessions = [];
  let error = "",
    email = 0;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
    return fetchImpl(url, JSON.parse(options.body));
  };
  const { default: Access } = load(path.join(__dirname, "../StudentCodeAccess.tsx"), {
    "react-native": { Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View" },
    "./ui-styles": { ui: {} },
  });
  const run = async (fn) => {
    error = "";
    try {
      await fn();
    } catch (e) {
      error = e.message;
    }
  };
  let component;
  await renderer.act(async () => {
    component = renderer.create(
      React.createElement(Access, {
        apiUrl: "https://api.example",
        busy: false,
        run,
        onSession: async (result) => sessions.push(result),
        onEmail: () => email++,
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  const type = (label, value) =>
    renderer.act(async () =>
      component.root
        .findAllByType("TextInput")
        .find((n) => n.props.accessibilityLabel === label)
        .props.onChangeText(value),
    );
  const press = (label) =>
    renderer.act(async () =>
      component.root.findAllByType("Pressable").find((n) => text(n) === label).props.onPress(),
    );
  return { component, calls, sessions, type, press, error: () => error, email: () => email };
}
const match = { studentName: "Ana Souza", schoolName: "Escola Azul", classes: [{ className: "6º A" }] };

test("first access: the student checks the code, confirms the data and creates the password", async (t) => {
  const { component, calls, sessions, type, press, error } = await setup(t, (url) =>
    Response.json({ data: url.endsWith("/inspect") ? { ...match, passwordReset: false } : { token: "new-session" } }),
  );
  await press("Primeiro acesso ou esqueci a senha");
  await type("Código do aluno", "ufa-1a2b3c4d");
  await press("Continuar");
  assert.equal(calls[0].url, "https://api.example/api/auth/student/first-access/inspect");
  assert.deepEqual(calls[0].body, { code: "UFA-1A2B3C4D" });
  assert.equal(calls[0].headers["x-client"], "mobile");
  assert.equal(calls[0].headers.authorization, undefined);
  assert(text(component.root).includes("Ana Souza"));
  assert(text(component.root).includes("Turmas: 6º A"));
  await press("Sou eu, continuar");
  await type("Nova senha (pelo menos 8 caracteres)", "curta");
  await type("Repita a senha", "curta");
  await press("Criar senha e entrar");
  assert.match(error(), /pelo menos 8/);
  await type("Nova senha (pelo menos 8 caracteres)", "senha-da-ana");
  await type("Repita a senha", "senha-da-anx");
  await press("Criar senha e entrar");
  assert.match(error(), /não são iguais/);
  assert.equal(calls.length, 1);
  await type("Repita a senha", "senha-da-ana");
  await press("Criar senha e entrar");
  assert.equal(calls[1].url, "https://api.example/api/auth/student/first-access");
  assert.deepEqual(calls[1].body, { code: "UFA-1A2B3C4D", password: "senha-da-ana" });
  assert.deepEqual(sessions, [{ token: "new-session" }]);
});

test("a renewed code shows that the old password stops working", async (t) => {
  const { component, type, press } = await setup(t, () => Response.json({ data: { ...match, passwordReset: true } }));
  await press("Primeiro acesso ou esqueci a senha");
  await type("Código do aluno", "UFA-1A2B3C4D");
  await press("Continuar");
  await press("Sou eu, continuar");
  assert(text(component.root).includes("A senha antiga deixa de valer"));
  assert(component.root.findAllByType("Pressable").some((n) => text(n) === "Salvar nova senha e entrar"));
});

test("not me goes back without saving anything", async (t) => {
  const { component, calls, type, press } = await setup(t, () => Response.json({ data: { ...match, passwordReset: false } }));
  await press("Primeiro acesso ou esqueci a senha");
  await type("Código do aluno", "UFA-1A2B3C4D");
  await press("Continuar");
  await press("Não sou eu");
  assert(text(component.root).includes("Nada foi gravado"));
  assert(!text(component.root).includes("Ana Souza"));
  assert.equal(calls.length, 1);
});

test("login with code and password; invalid codes never reach the API; errors stay visible", async (t) => {
  let ok = false;
  const { calls, sessions, type, press, error, email } = await setup(t, () =>
    ok ? Response.json({ data: { token: "session" } }) : Response.json({ error: "Código ou senha inválidos." }, { status: 401 }),
  );
  await type("Código do aluno", "ABCD");
  await press("Entrar");
  assert.match(error(), /UFA-XXXXXXXX/);
  assert.equal(calls.length, 0);
  await type("Código do aluno", "1a2b3c4d");
  await type("Senha", "errada");
  await press("Entrar");
  assert.equal(error(), "Código ou senha inválidos.");
  ok = true;
  await type("Senha", "senha-da-ana");
  await press("Entrar");
  assert.equal(calls[1].url, "https://api.example/api/auth/student/code-login");
  assert.deepEqual(calls[1].body, { code: "UFA-1A2B3C4D", password: "senha-da-ana" });
  assert.deepEqual(sessions, [{ token: "session" }]);
  await press("Entrar com e-mail");
  assert.equal(email(), 1);
});
