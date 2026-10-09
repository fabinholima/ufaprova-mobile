const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
test("registration lets coordinators choose stages and only returns to login after successful verification request", async (t) => {
  let created = 0,
    sent,
    resolve;
  const pending = new Promise((r) => (resolve = r));
  const { default: Screen } = load(path.join(__dirname, "../EducatorRegistrationScreen.tsx"), {
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Pressable: "Pressable",
      SafeAreaView: "SafeAreaView",
      ScrollView: "ScrollView",
      Text: "Text",
      TextInput: "TextInput",
      View: "View",
    },
    "./ui-styles": { ui: {} },
    "./educator-registration": {
      registerEducator: async (url, form) => {
        sent = form;
        await pending;
        return { email: "coordinator@example.test", professionalRole: form.professionalRole };
      },
    },
  });
  let component;
  await renderer.act(async () => {
    component = renderer.create(
      React.createElement(Screen, {
        apiUrl: "https://api.example",
        onBack: () => {},
        onCreated: (email, role) => {
          assert.equal(email, "coordinator@example.test");
          assert.equal(role, "coordinator");
          created++;
        },
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  const button = (label) =>
    component.root.findAllByType("Pressable").find((n) => text(n) === label);
  await renderer.act(async () => button("Coordenador").props.onPress());
  assert(
    !component.root
      .findAllByType("TextInput")
      .some((n) => n.props.accessibilityLabel === "Disciplinas"),
  );
  await renderer.act(async () => button("Ensino Médio").props.onPress());
  assert.equal(button("✓ Ensino Médio").props.accessibilityState.checked, true);
  await renderer.act(async () => button("Criar minha conta").props.onPress());
  assert.equal(created, 0);
  assert.equal(sent.professionalRole, "coordinator");
  assert.deepEqual(sent.stages, ["Ensino Médio"]);
  assert.equal(component.root.findAllByType("ActivityIndicator").length, 1);
  await renderer.act(async () => resolve());
  assert.equal(created, 1);
});
