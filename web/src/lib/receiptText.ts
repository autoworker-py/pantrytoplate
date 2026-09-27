import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TextPiece } from './receipt';

/*
 * The photo and the reading, both on the phone. The photo comes from the
 * camera plugin; the text from Apple's recognition in the app's own
 * ReceiptText plugin (ios/App/App/ReceiptTextPlugin.swift), which deletes the
 * photo once it is read.
 */

const ReceiptText = registerPlugin<{ read(options: { path: string }): Promise<{ pieces: TextPiece[] }> }>('ReceiptText');

/** Receipts are read with Apple's text recognition, so only in the iPhone app. */
export const canReadReceipts = Capacitor.getPlatform() === 'ios';

/** A photo of the receipt; null when the person backs out. */
export async function photographReceipt(from: 'camera' | 'photos'): Promise<string | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: from === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
    });
    return photo.path ?? null;
  } catch (cause) {
    if (/cancel/i.test(cause instanceof Error ? cause.message : String(cause))) return null;
    throw cause;
  }
}

export async function readReceiptPhoto(path: string): Promise<TextPiece[]> {
  const { pieces } = await ReceiptText.read({ path });
  return pieces;
}
