import { Capacitor } from '@capacitor/core';
import { api } from './api';
import type { Grade } from './types';

/*
 * Snap a meal on the phone's side: the photo, taken or chosen and made into an
 * exact 768 by 768 square on the phone, and the calls that read it and unlock
 * Plus. The photo is handed from Eaten to the snap screen in memory, never
 * through the page history.
 */

/** Every photo is read at exactly this size, so each read costs the same. */
export const PHOTO_SIDE = 768;


export interface SnapStatus {
  plus: boolean;
  /** null with Plus */
  freeLeft: number | null;
  freeTotal: number;
  /** false when the server has no photo reader set up */
  available: boolean;
  /** photos a short ad can still earn today, once the free ones are gone; 0 with Pro */
  adPhotosLeft?: number;
}

export interface MealPhoto {
  /** the 768 by 768 square that is read, as a JPEG */
  base64: string;
  mediaType: string;
  /** the photo as taken, for showing; empty for the development stand-in */
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
  /** grams, sodium in milligrams; null when the reader didn't say */
  fiber?: number | null;
  sugar?: number | null;
  satFat?: number | null;
  sodium?: number | null;
  /** Nutri-Score points per 100 g and the letter, from the server; null when it can't be graded */
  points?: number | null;
  grade?: Grade | null;
  note?: string;
}

/**
 * The plate's grade: each item's points averaged by its calories, the way the
 * diary grades a meal (server/src/services/healthScore.ts, mixedGrade).
 */
export function plateGrade(items: Array<{ points?: number | null; calories: number }>): Grade | null {
  let sum = 0;
  let total = 0;
  for (const item of items) {
    if (item.points == null || item.calories <= 0) continue;
    sum += item.points * item.calories;
    total += item.calories;
  }
  if (total === 0) return null;
  const points = Math.round(sum / total);
  return points <= -1 ? 'A' : points <= 2 ? 'B' : points <= 10 ? 'C' : points <= 18 ? 'D' : 'E';
}

let handed: MealPhoto | null = null;
export const handPhoto = (photo: MealPhoto) => { handed = photo; };
/** Reading does not consume it (React may render twice); the snap screen clears it once it is up. */
export const handedPhoto = () => handed;
export const clearHandedPhoto = () => { handed = null; };

/**
 * The whole photo, scaled to fit a 768 by 768 square and centred on black, so
 * nothing at the edges of the plate is cropped away and nothing is stretched.
 */
async function squared(source?: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIDE;
  canvas.height = PHOTO_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This phone could not get the photo ready.');
  context.fillStyle = '#000';
  context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
  if (source) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(PHOTO_SIDE / image.naturalWidth, PHOTO_SIDE / image.naturalHeight);
    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);
    const x = Math.floor((PHOTO_SIDE - w) / 2);
    const y = Math.floor((PHOTO_SIDE - h) / 2);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, x, y, w, h);
  }
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
}

/** A photo of the plate: the camera or the library, made into the square that is read; null when the person backs out. */
export async function photographMeal(): Promise<MealPhoto | null> {
  // a browser has no camera here: development sends a blank square and reads the server's sample plate
  if (!Capacitor.isNativePlatform()) return { base64: await squared(), mediaType: 'image/jpeg', dataUrl: '' };
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Base64,
      // the camera scales it down to fit 768 first, so the phone never holds the full-size photo
      quality: 90,
      width: PHOTO_SIDE,
      height: PHOTO_SIDE,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: 'Snap a meal',
      promptLabelPicture: 'Take a photo',
      promptLabelPhoto: 'Choose from Photos',
    });
    if (!photo.base64String) return null;
    const dataUrl = `data:image/${photo.format === 'png' ? 'png' : 'jpeg'};base64,${photo.base64String}`;
    return { base64: await squared(dataUrl), mediaType: 'image/jpeg', dataUrl };
  } catch (cause) {
    if (/cancel/i.test(cause instanceof Error ? cause.message : String(cause))) return null;
    throw cause;
  }
}

export const snapStatus = () => api.getFresh<SnapStatus>('/api/snap/status');
// the server waits and retries when the reader is busy, so this can take a while
export const readMeal = (photo: MealPhoto, hint = '') =>
  api.post<{ items: ReadItem[] } & SnapStatus>(
    '/api/snap',
    { image: photo.base64, mediaType: photo.mediaType, ...(hint.trim() ? { hint: hint.trim() } : {}) },
    { timeoutMs: 100_000 },
  );
export const redeemPlus = (code: string) => api.post<SnapStatus>('/api/snap/redeem', { code });
/** After an ad was watched through: one more photo. */
export const earnAdPhoto = () => api.post<SnapStatus>('/api/snap/reward', {});
