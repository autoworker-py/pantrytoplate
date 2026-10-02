import { Capacitor, registerPlugin } from '@capacitor/core';

/*
 * The share sheet signs in as the app does: the app hands its session to the
 * share extension through the App Group whenever it changes.
 */
const ShareBridge = registerPlugin<{ setSession(options: { token: string; apiUrl: string }): Promise<void>; clearSession(): Promise<void> }>('ShareBridge');

export function shareSession(token: string | null) {
  if (!Capacitor.isNativePlatform()) return;
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  void (token ? ShareBridge.setSession({ token, apiUrl }) : ShareBridge.clearSession()).catch(() => undefined);
}
