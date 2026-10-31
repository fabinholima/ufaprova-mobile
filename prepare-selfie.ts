import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { CameraCapturedPicture } from "expo-camera";
import { selfieDataUrl, SELFIE_MAX_BYTES } from "./student-api";

// The API accepts profile photos up to 400 KB, so shrink the face picture and lower the quality until it fits.
export async function prepareSelfie(photo: CameraCapturedPicture): Promise<string> {
  for (const [side, compress] of [
    [640, 0.7],
    [480, 0.6],
    [360, 0.5],
  ] as const) {
    const context = ImageManipulator.manipulate(photo.uri);
    try {
      if (Math.max(photo.width, photo.height) > side)
        context.resize(photo.width >= photo.height ? { width: side } : { height: side });
      const image = await context.renderAsync();
      try {
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (((result.base64 || "").length * 3) / 4 <= SELFIE_MAX_BYTES) return selfieDataUrl(result.base64);
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  }
  throw Error("A foto ficou maior que 400 KB. Tente novamente.");
}
