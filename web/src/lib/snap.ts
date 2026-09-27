import { Capacitor } from '@capacitor/core';
import { api } from './api';

/*
 * Snap a meal on the phone's side: the photo, taken or chosen and resized on
 * the phone, and the calls that read it and unlock Plus. The photo is handed
 * from Eaten to the snap screen in memory, never through the page history.
 */

export interface SnapStatus {
  plus: boolean;
  /** null with Plus */
  freeLeft: number | null;
  freeTotal: number;
  /** false when the server has no photo reader set up */
  available: boolean;
}

export interface MealPhoto {
  base64: string;
  mediaType: string;
  /** for showing it; empty for the development stand-in */
  dataUrl: string;
}

export interface ReadItem {
  id: string;
  name: string;
  grams: number;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  at: [number, number];
  note?: string;
}

let handed: MealPhoto | null = null;
export const handPhoto = (photo: MealPhoto) => { handed = photo; };
/** Reading does not consume it (React may render twice); the snap screen clears it once it is up. */
export const handedPhoto = () => handed;
export const clearHandedPhoto = () => { handed = null; };

/** A photo of the plate: the camera or the library, resized to 1280 px; null when the person backs out. */
export async function photographMeal(): Promise<MealPhoto | null> {
  // a browser has no camera here: development reads the server's sample plate
  if (!Capacitor.isNativePlatform()) return { base64: 'development-stand-in-'.repeat(8), mediaType: 'image/jpeg', dataUrl: '' };
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Base64,
      quality: 70,
      width: 1280,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: 'Snap a meal',
      promptLabelPicture: 'Take a photo',
      promptLabelPhoto: 'Choose from Photos',
    });
    if (!photo.base64String) return null;
    const mediaType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
    return { base64: photo.base64String, mediaType, dataUrl: `data:${mediaType};base64,${photo.base64String}` };
  } catch (cause) {
    if (/cancel/i.test(cause instanceof Error ? cause.message : String(cause))) return null;
    throw cause;
  }
}

export const snapStatus = () => api.getFresh<SnapStatus>('/api/snap/status');
// the server waits and retries when the reader is busy, so this can take a while
export const readMeal = (photo: MealPhoto) =>
  api.post<{ items: ReadItem[] } & SnapStatus>('/api/snap', { image: photo.base64, mediaType: photo.mediaType }, { timeoutMs: 100_000 });
export const redeemPlus = (code: string) => api.post<SnapStatus>('/api/snap/redeem', { code });
