process.env.EXPO_PUBLIC_PUSH_ANDROID = "on";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));

test("student turns on grade notices, opens the result from a notice and stops them on logout", async (t) => {
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  const posts = [];
  let granted = false,
    listener = null;
  global.fetch = async (url, options) => {
    if (options.body) posts.push([url.replace("https://api.example", ""), JSON.parse(options.body)]);
    const route = url.replace("https://api.example", "");
    const data =
      route === "/api/auth/me"
        ? { role: "student", user: { id: "u", displayName: "Ana", email: "a@example.test" } }
        : route === "/api/class-join-requests/me"
          ? [{ id: "j", status: "approved", className: "6º A", schoolName: "Escola" }]
          : route === "/api/student/activities"
            ? [{ id: "a1", title: "Prova 1", subject: "Química", className: "6º A", schoolName: "Escola", score: "8", maxScore: "10",
                requiresManualReview: false, scheduledAt: "2026-05-05T12:00:00", resultId: "r1", resultStatus: "published", percent: 80 }]
            : route === "/api/student/results/r1"
              ? { id: "a1", title: "Prova 1", subject: "Química", className: "6º A", schoolName: "Escola", score: "8", maxScore: "10",
                  requiresManualReview: false, percent: 80, releasePolicy: "summary", questions: [], skills: [], minSkillEvidence: 3, guidance: null }
              : route === "/api/student/profile" || route === "/api/student/skill-performance"
                ? []
                : { ok: true };
    return Response.json({ data });
  };
  const notifications = {
    setNotificationHandler: () => {},
    AndroidImportance: { HIGH: 4 },
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
    requestPermissionsAsync: async () => ((granted = true), { granted: true, canAskAgain: true }),
    getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[ana]" }),
    getLastNotificationResponseAsync: async () => null,
    clearLastNotificationResponseAsync: async () => {},
    addNotificationResponseReceivedListener: (fn) => ((listener = fn), { remove() {} }),
  };
  const rn = { ActivityIndicator: "ActivityIndicator", AppState: { currentState: "active" }, Image: "Image", Linking: { openURL: async () => {}, openSettings: async () => {} },
    Platform: { OS: "android" }, Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View" };
  const { default: Screen } = load(path.join(__dirname, "../StudentScreen.tsx"), {
    "react-native": rn,
    "expo-notifications": notifications,
    "expo-secure-store": { getItemAsync: async (k) => (k.includes("session") ? JSON.stringify({ apiUrl: "https://api.example", token: "t" }) : "1"), setItemAsync: async () => {}, deleteItemAsync: async () => {} },
    "./ui-styles": { ui: {}, useUi: () => ({ small: {} }) },
    "./StudentInviteScanner": () => null,
    "./StudentPhotoScreen": () => null,
    "./google-login": { startGoogleLogin: async () => {}, checkGoogleLogin: async () => false },
  });
  let component;
  await renderer.act(async () => {
    component = renderer.create(React.createElement(Screen, { apiUrl: "https://api.example", onBack: () => {} }));
  });
  t.after(() => renderer.act(() => component.unmount()));
  const press = (label) => renderer.act(async () => component.root.findAllByType("Pressable").find((n) => text(n) === label).props.onPress());

  // Sem permissão ainda: nada é registrado até o aluno pedir.
  assert(text(component.root).includes("Aviso de nota nova"));
  assert.equal(posts.filter(([url]) => url.startsWith("/api/push")).length, 0);
  await press("Ativar avisos");
  assert.deepEqual(posts.at(-1), ["/api/push/devices", { token: "ExponentPushToken[ana]", platform: "android" }]);
  assert(text(component.root).includes("Pronto: você recebe um aviso"));
  assert(!component.root.findAllByType("Pressable").some((n) => text(n) === "Ativar avisos"));

  // Tocar no aviso abre a avaliação.
  await press("Perfil");
  await renderer.act(async () => listener({ notification: { request: { content: { data: { type: "result", resultId: "r1" } } } } }));
  assert(text(component.root).includes("O professor liberou apenas o resumo desta avaliação."));

  await press("Voltar à disciplina");
  await press("Perfil");
  assert(text(component.root).includes("Ativado neste celular"));
  await press("Sair");
  assert(posts.some(([url, body]) => url === "/api/push/devices/remove" && body.token === "ExponentPushToken[ana]"));
  assert(posts.findIndex(([url]) => url === "/api/push/devices/remove") < posts.findIndex(([url]) => url === "/api/auth/logout"));
});
