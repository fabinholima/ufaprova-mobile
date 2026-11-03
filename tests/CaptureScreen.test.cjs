const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  React = require("react"),
  renderer = require("react-test-renderer"),
  load = require("./load-typescript.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
async function setup(
  t,
  { permission = { granted: true, canAskAgain: true }, takePictureAsync, onConfirm, gallery = async () => ({ canceled: true }) } = {},
) {
  let cameraProps,
    lifecycle,
    asked = 0,
    settings = 0;
  const refresh = async () => permission,
    request = async () => {
      asked++;
      return permission;
    };
  const Camera = React.forwardRef((props, ref) => {
    cameraProps = props;
    React.useImperativeHandle(ref, () => ({ takePictureAsync }), []);
    return React.createElement("CameraView", props);
  });
  const { default: Screen } = load(path.join(__dirname, "../CaptureScreen.tsx"), {
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      AppState: {
        currentState: "active",
        addEventListener: (event, fn) => {
          lifecycle = fn;
          return { remove() {} };
        },
      },
      Image: "Image",
      Linking: {
        openSettings: async () => {
          settings++;
        },
      },
      Pressable: "Pressable",
      StyleSheet: { create: (x) => x, absoluteFill: {} },
      Text: "Text",
      View: "View",
    },
    "expo-image-picker": { launchImageLibraryAsync: (options) => gallery(options) },
    "expo-camera": {
      CameraView: Camera,
      useCameraPermissions: () => [permission, request, refresh],
    },
  });
  let component;
  await renderer.act(async () => {
    component = renderer.create(
      React.createElement(Screen, {
        applicationId: "application-id",
        school: { id: "s", name: "Escola" },
        assessment: { id: "a", title: "Prova" },
        schoolClass: { id: "c", name: "Turma" },
        onConfirm: onConfirm || (() => {}),
        onBack: () => {},
      }),
    );
  });
  t.after(() => renderer.act(() => component.unmount()));
  return {
    component,
    get camera() {
      return cameraProps;
    },
    get asked() {
      return asked;
    },
    get settings() {
      return settings;
    },
    press: async (label) =>
      renderer.act(async () => {
        component.root
          .findAllByType("Pressable")
          .find((n) => text(n) === label)
          .props.onPress();
      }),
    lifecycle: (state) => renderer.act(() => lifecycle(state)),
  };
}
test("camera waits for readiness, prevents duplicate capture and preserves the photo after a save failure", async (t) => {
  let resolve,
    captures = 0,
    saves = 0,
    sheet;
  const pending = new Promise((r) => (resolve = r));
  const h = await setup(t, {
    takePictureAsync: async () => {
      captures++;
      return pending;
    },
    onConfirm: async (value) => {
      saves++;
      sheet = value;
      if (saves === 1) throw Error("Sem espaço no aparelho");
    },
  });
  assert(
    h.component.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === "Fotografar folha de respostas").props.disabled,
  );
  await renderer.act(async () => h.camera.onCameraReady());
  await h.press("Ligar lanterna");
  assert.equal(h.camera.enableTorch, true);
  await h.press("Fotografar folha");
  await renderer.act(async () =>
    h.component.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === "Fotografar folha de respostas")
      .props.onPress(),
  );
  assert.equal(captures, 1);
  await renderer.act(async () =>
    resolve({ uri: "file:///test-card.jpg", width: 900, height: 1200 }),
  );
  assert(text(h.component.root).includes("Usar esta foto"));
  await h.press("Usar esta foto");
  assert(text(h.component.root).includes("Sem espaço no aparelho"));
  assert.equal(h.component.root.findByType("Image").props.source.uri, "file:///test-card.jpg");
  await h.press("Usar esta foto");
  assert.equal(saves, 2);
  assert.equal(sheet.applicationId, "application-id");
  assert.equal(sheet.assessmentId, "a");
  assert.equal(sheet.classId, "c");
});
test("a permanently denied camera permission offers settings and never attempts capture", async (t) => {
  let captures = 0;
  const h = await setup(t, {
    permission: { granted: false, canAskAgain: false },
    takePictureAsync: async () => {
      captures++;
    },
  });
  await h.press("Abrir configurações");
  assert.equal(h.settings, 1);
  assert.equal(h.asked, 0);
  assert.equal(captures, 0);
});
test("backgrounding the app releases the camera and requires readiness again on return", async (t) => {
  const h = await setup(t, { takePictureAsync: async () => ({ uri: "file:///photo.jpg" }) });
  await renderer.act(async () => h.camera.onCameraReady());
  await h.lifecycle("background");
  assert.equal(h.component.root.findAllByType("CameraView").length, 0);
  await h.lifecycle("active");
  assert(
    h.component.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === "Fotografar folha de respostas").props.disabled,
  );
});

test("a photo from the gallery goes through the same review and confirmation, even without camera permission", async (t) => {
  const sheets = [], requested = [];
  const h = await setup(t, {
    permission: { granted: false, canAskAgain: true },
    gallery: async (options) => { requested.push(options); return { canceled: false, assets: [{ uri: "file:///gallery.jpg", width: 3000, height: 4000 }] }; },
    onConfirm: (sheet) => { sheets.push(sheet); },
  });
  const press = async (label) => {
    const button = h.component.root.findAll((node) => node.type === "Pressable" && text(node).includes(label))[0];
    assert(button, `Missing ${label}`);
    await renderer.act(async () => button.props.onPress());
  };
  await press("Escolher foto da galeria");
  assert.deepEqual(requested[0].mediaTypes, ["images"]);
  assert.match(text(h.component.root), /Confira se a folha inteira/);
  assert.equal(sheets.length, 0, "escolher não envia sozinho");
  await press("Usar esta foto");
  assert.equal(sheets[0].photo.uri, "file:///gallery.jpg");
  assert.equal(sheets[0].applicationId, "application-id");
});
