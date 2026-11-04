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
        crop: (value) => (call.crop = value),
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
test("selfies are cropped to a square around the face, shrunk to 320 px and compressed until small", async () => {
  const { prepareSelfie, calls } = loadWith([90000, 50000]);
  const value = await prepareSelfie({ uri: "file:///a.jpg", width: 3000, height: 4000 });
  assert.match(value, /^data:image\/jpeg;base64,/);
  assert.deepEqual(calls.map((c) => [c.crop, c.resize, c.compress]), [
    [{ originX: 225, originY: 625, width: 2550, height: 2550 }, { width: 320, height: 320 }, 0.7],
    [{ originX: 225, originY: 625, width: 2550, height: 2550 }, { width: 320, height: 320 }, 0.5],
  ]);
  assert(calls.every((c) => c.released === 2));
  const small = loadWith([10]);
  await small.prepareSelfie({ uri: "x", width: 200, height: 300 });
  assert.equal(small.calls[0].resize, undefined, "a crop already under 320 px is not enlarged");
  await assert.rejects(
    loadWith([200000, 200000, 200000]).prepareSelfie({ uri: "x", width: 100, height: 100 }),
    /100 KB/,
  );
});

test("the crop stays inside landscape and small pictures", () => {
  const { faceCrop } = load(path.join(__dirname, "../prepare-selfie.ts"), {
    "expo-image-manipulator": { ImageManipulator: {}, SaveFormat: {} },
  });
  assert.deepEqual(faceCrop(4000, 3000), { originX: 725, originY: 150, width: 2550, height: 2550 });
  assert.deepEqual(faceCrop(100, 100), { originX: 8, originY: 5, width: 85, height: 85 });
});
