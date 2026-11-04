import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { CameraCapturedPicture } from "expo-camera";
import { selfieDataUrl, SELFIE_MAX_BYTES } from "./student-api";

// The portal shows the photo at 96 px at most: keep a 320 px square around the face guide
// (centered horizontally, slightly above the middle) and lower the quality until it is small.
export const SELFIE_SIDE = 320;
const TARGET_BYTES = 60000;

export function faceCrop(width: number, height: number) {
  const side = Math.round(Math.min(width, height) * 0.85);
  const clamp = (value: number, max: number) => Math.max(0, Math.min(Math.round(value), max));
  return {
    originX: clamp(width / 2 - side / 2, width - side),
    originY: clamp(height * 0.475 - side / 2, height - side),
    width: side,
    height: side,
  };
}

export async function prepareSelfie(photo: CameraCapturedPicture): Promise<string> {
  const crop = faceCrop(photo.width, photo.height);
  for (const [side, compress, limit] of [
    [SELFIE_SIDE, 0.7, TARGET_BYTES],
    [SELFIE_SIDE, 0.5, TARGET_BYTES],
    [240, 0.5, SELFIE_MAX_BYTES],
  ] as const) {
    const context = ImageManipulator.manipulate(photo.uri);
    try {
      context.crop(crop);
      if (crop.width > side) context.resize({ width: side, height: side });
      const image = await context.renderAsync();
      try {
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (((result.base64 || "").length * 3) / 4 <= limit) return selfieDataUrl(result.base64);
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  }
  throw Error("A foto ficou maior que 100 KB. Tente novamente.");
}
