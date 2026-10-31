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
    linked = [];
  let error = "";
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
    return fetchImpl(url);
  };
  const { default: Join } = load(path.join(__dirname, "../StudentCodeJoin.tsx"), {
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
      React.createElement(Join, {
        apiUrl: "https://api.example",
        token: "student-token",
        busy: false,
        run,
        onLinked: async (claim) => linked.push(claim),
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  const type = (value) =>
    renderer.act(async () => component.root.findByType("TextInput").props.onChangeText(value));
  const press = (label) =>
    renderer.act(async () =>
      component.root.findAllByType("Pressable").find((n) => text(n) === label).props.onPress(),
    );
  return { component, calls, linked, type, press, error: () => error };
}
test("student checks the personal code, confirms the name and links the account at once", async (t) => {
  const { component, calls, linked, type, press } = await setup(t, (url) =>
    Response.json({
      data: url.endsWith("/inspect")
        ? { studentName: "Ana Souza", schoolName: "Escola Azul", classes: [{ className: "6º A" }] }
        : { studentId: "s1", classes: [{ className: "6º A", schoolName: "Escola Azul" }] },
    }),
  );
  await type("ufa-1a2b3c4d");
  await press("Conferir código");
  assert.equal(calls[0].url, "https://api.example/api/student/access-code/inspect");
  assert.deepEqual(calls[0].body, { code: "UFA-1A2B3C4D" });
  assert.equal(calls[0].headers.authorization, "Bearer student-token");
  assert(text(component.root).includes("Ana Souza"));
  assert(text(component.root).includes("Turmas: 6º A"));
  assert.equal(linked.length, 0);
  await press("Sou eu, vincular minha conta");
  assert.equal(calls[1].url, "https://api.example/api/student/access-code/claim");
  assert.deepEqual(calls[1].body, { code: "UFA-1A2B3C4D" });
  assert.equal(linked[0].studentId, "s1");
  assert(!text(component.root).includes("Ana Souza"));
});
test("invalid formats never reach the API and server refusals stay visible", async (t) => {
  let status = 404;
  const { calls, type, press, error } = await setup(t, () =>
    Response.json({ error: status === 404 ? "Código não encontrado." : "Este recurso é exclusivo de professores e gestores." }, { status }),
  );
  await type("ABCD-EFGH");
  await press("Conferir código");
  assert.equal(calls.length, 0);
  assert.match(error(), /UFA-XXXXXXXX/);
  await type("UFA-1A2B3C4D");
  await press("Conferir código");
  assert.match(error(), /não encontrado/);
  status = 403;
  await press("Conferir código");
  assert.match(error(), /ainda não aceita o código do aluno/);
});
