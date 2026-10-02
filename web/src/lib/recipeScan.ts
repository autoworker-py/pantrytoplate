import { Capacitor } from '@capacitor/core';

/*
 * A photo of a recipe card or page, sharp enough for handwriting: up to 1,400
 * pixels on the long side, not squared like a plate photo.
 */
const LONG_SIDE = 1400;

export async function photographRecipe(): Promise<{ base64: string; mediaType: string } | null> {
  if (!Capacitor.isNativePlatform()) return pickInBrowser();
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Base64,
      quality: 80,
      width: LONG_SIDE,
      height: LONG_SIDE,
      correctOrientation: true,
    });
    return photo.base64String ? { base64: photo.base64String, mediaType: photo.format === 'png' ? 'image/png' : 'image/jpeg' } : null;
  } catch {
    // cancelled
    return null;
  }
}

/** On the website: a file, scaled down the same way. */
function pickInBrowser(): Promise<{ base64: string; mediaType: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, LONG_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '', mediaType: 'image/jpeg' });
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}
