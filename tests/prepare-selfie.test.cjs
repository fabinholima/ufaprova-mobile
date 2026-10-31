const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  load = require("./load-typescript.cjs");
function loadWith(sizes) {
  const calls = [];
  const manipulator = {
    manipulate: () => {
      const call = { released: 0 };
      calls.push(call);
      return {
        resize: (value) => (call.resize = value),
        renderAsync: async () => ({
          saveAsync: async (options) => {
            call.compress = options.compress;
            return { base64: Buffer.alloc(sizes[calls.length - 1]).toString("base64") };
          },
          release: () => call.released++,
        }),
        release: () => call.released++,
      };
    },
  };
  const { prepareSelfie } = load(path.join(__dirname, "../prepare-selfie.ts"), {
    "expo-image-manipulator": { ImageManipulator: manipulator, SaveFormat: { JPEG: "jpeg" } },
  });
  return { prepareSelfie, calls };
}
test("selfies shrink step by step until they fit the API limit and release native images", async () => {
  const { prepareSelfie, calls } = loadWith([500000, 300000]);
  const value = await prepareSelfie({ uri: "file:///a.jpg", width: 3000, height: 4000 });
  assert.match(value, /^data:image\/jpeg;base64,/);
  assert.deepEqual(calls.map((c) => [c.resize, c.compress]), [
    [{ height: 640 }, 0.7],
    [{ height: 480 }, 0.6],
  ]);
  assert(calls.every((c) => c.released === 2));
  await assert.rejects(
    loadWith([500000, 500000, 500000]).prepareSelfie({ uri: "x", width: 100, height: 100 }),
    /400 KB/,
  );
});
