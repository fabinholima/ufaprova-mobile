const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
async function setup(t, { permission = { granted: true, canAskAgain: true }, fetchImpl, prepareSelfie } = {}) {
  const previous = global.fetch;
  t.after(() => (global.fetch = previous));
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return fetchImpl ? fetchImpl(url, options) : Response.json({ data: { id: "s1" } });
  };
  let cameraProps,
    asked = 0,
    saved = 0,
    back = 0;
  const Camera = React.forwardRef((props, ref) => {
    cameraProps = props;
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: "file:///selfie.jpg", width: 3000, height: 4000 }),
    }));
    return React.createElement("CameraView", props);
  });
  const { default: Screen } = load(path.join(__dirname, "../StudentPhotoScreen.tsx"), {
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      Image: "Image",
      Linking: { openSettings: async () => {} },
      Pressable: "Pressable",
      StyleSheet: { create: (x) => x, absoluteFill: {} },
      Text: "Text",
      View: "View",
    },
    "expo-camera": {
      CameraView: Camera,
      useCameraPermissions: () => [permission, async () => (asked++, permission)],
    },
    "./ui-styles": { ui: {} },
    "./prepare-selfie": {
      prepareSelfie: prepareSelfie || (async () => "data:image/jpeg;base64,aGVsbG8="),
    },
  });
  let component;
  await renderer.act(async () => {
    component = renderer.create(
      React.createElement(Screen, {
        apiUrl: "https://api.example",
        token: "student-token",
        profile: { id: "s1", name: "Aluno Silva", registration: "1", selfieDataUrl: null },
        onSaved: () => saved++,
        onBack: () => back++,
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  const press = (label) =>
    renderer.act(async () =>
      component.root.findAllByType("Pressable").find((n) => text(n) === label).props.onPress(),
    );
  return { component, calls, press, camera: () => cameraProps, counts: () => ({ asked, saved, back }) };
}
test("student takes a front-camera photo, reviews it and sends it to the linked record", async (t) => {
  const { component, calls, press, camera, counts } = await setup(t);
  assert.equal(camera().facing, "front");
  await renderer.act(async () => camera().onCameraReady());
  await press("Tirar foto");
  assert.equal(component.root.findByType("Image").props.source.uri, "file:///selfie.jpg");
  assert.equal(calls.length, 0);
  await press("Usar esta foto");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example/api/student/profile");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer student-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    studentId: "s1",
    selfieDataUrl: "data:image/jpeg;base64,aGVsbG8=",
  });
  assert.equal(counts().saved, 1);
});
test("rejected uploads and oversized photos stay on screen with the reason and can be retaken", async (t) => {
  const { component, press, camera, counts } = await setup(t, {
    fetchImpl: () =>
      Response.json({ error: "Cadastro não vinculado à sua conta." }, { status: 403 }),
  });
  await renderer.act(async () => camera().onCameraReady());
  await press("Tirar foto");
  await press("Usar esta foto");
  assert(text(component.root).includes("Cadastro não vinculado"));
  assert.equal(counts().saved, 0);
  await press("Tirar outra foto");
  assert.equal(component.root.findAllByType("Image").length, 0);

  const other = await setup(t, {
    prepareSelfie: async () => {
      throw Error("A foto ficou maior que 400 KB. Tente novamente.");
    },
  });
  await renderer.act(async () => other.camera().onCameraReady());
  await other.press("Tirar foto");
  await other.press("Usar esta foto");
  assert(text(other.component.root).includes("400 KB"));
  assert.equal(other.calls.length, 0);
});
test("camera permission is requested before showing the camera", async (t) => {
  const { component, press, counts } = await setup(t, {
    permission: { granted: false, canAskAgain: true },
  });
  assert.equal(component.root.findAllByType("CameraView").length, 0);
  await press("Permitir câmera");
  assert.equal(counts().asked, 1);
});
