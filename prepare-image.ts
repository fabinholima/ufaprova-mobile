import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CameraCapturedPicture } from 'expo-camera';
import { jpegDataUrl } from './scan-api';

export async function prepareImage(photo: CameraCapturedPicture): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    // Limit transfer size while preserving the entire page and its aspect ratio.
    if (Math.max(photo.width, photo.height) > 2600) {
      context.resize(photo.width >= photo.height ? { width: 2600 } : { height: 2600 });
    }
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
      return jpegDataUrl(result.base64);
    } finally { image.release(); }
  } finally { context.release(); }
}
