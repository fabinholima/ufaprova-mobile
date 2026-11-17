const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));

async function setup(t, request) {
  const { default: DeleteAccount } = load(path.join(__dirname, "../DeleteAccount.tsx"), {
    "react-native": { Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View" },
    "./ui-styles": { ui: {} },
  });
  const calls = [];
  let deleted = 0,
    component;
  await renderer.act(async () => {
    component = renderer.create(
      React.createElement(DeleteAccount, {
        request: async (p, input) => {
          calls.push({ path: p, input });
          return request(p, input);
        },
        onDeleted: async () => void deleted++,
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  const button = (label) => component.root.findAllByType("Pressable").find((n) => text(n) === label);
  const press = (label) => renderer.act(async () => button(label).props.onPress());
  const type = (label, value) =>
    renderer.act(async () =>
      component.root
        .findAllByType("TextInput")
        .find((n) => n.props.accessibilityLabel === label)
        .props.onChangeText(value),
    );
  return { component, calls, button, press, type, deleted: () => deleted };
}

test("deleting the account needs EXCLUIR, sends the password and clears the device", async (t) => {
  const { calls, button, press, type, deleted } = await setup(t, async () => ({ deleted: true }));
  await press("Excluir minha conta");
  assert.equal(button("Excluir conta definitivamente").props.disabled, true);
  await type("Senha atual", "minha-senha");
  await type("Digite EXCLUIR para confirmar", "excluir");
  assert.equal(button("Excluir conta definitivamente").props.disabled, false);
  await press("Excluir conta definitivamente");
  assert.deepEqual(calls, [{ path: "/api/account/delete", input: { confirm: "excluir", password: "minha-senha" } }]);
  assert.equal(deleted(), 1);
});

test("API errors stay visible and nothing is cleared; cancel closes the form", async (t) => {
  const { component, calls, press, type, deleted } = await setup(t, async () => {
    throw Error('Você é o único administrador de "Escola A".');
  });
  await press("Excluir minha conta");
  await type("Digite EXCLUIR para confirmar", "EXCLUIR");
  await press("Excluir conta definitivamente");
  assert.deepEqual(calls[0].input, { confirm: "EXCLUIR" }, "Google-only accounts send no password");
  assert(text(component.root).includes("único administrador"));
  assert.equal(deleted(), 0);
  await press("Cancelar");
  assert(!text(component.root).includes("único administrador"));
  assert.equal(component.root.findAllByType("TextInput").length, 0);
});
