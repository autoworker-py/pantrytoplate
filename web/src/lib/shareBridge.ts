import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { formatAmount } from './format';

/*
 * What the app's extensions share with it, through the App Group: the session
 * the share sheet and the shopping widget sign in with, handed over whenever
 * it changes, and the list the widget shows, handed over whenever it loads or
 * changes. A tap on the widget comes back as a route to open.
 */
const ShareBridge = registerPlugin<{
  setSession(options: { token: string; apiUrl: string }): Promise<void>;
  clearSession(): Promise<void>;
  setShopping(options: { items: Array<{ name: string; amount: string }> }): Promise<void>;
  addListener(event: 'route', listener: (data: { path: string }) => void): Promise<PluginListenerHandle>;
}>('ShareBridge');

export function shareSession(token: string | null) {
  if (!Capacitor.isNativePlatform()) return;
  const apiUrl = import.meta.env.VITE_API_URL ?? '';
  void (token ? ShareBridge.setSession({ token, apiUrl }) : ShareBridge.clearSession()).catch(() => undefined);
}

/** What is left to get, for the Home Screen widget. */
export function shareShopping(items: Array<{ name: string; quantityNeeded: number; unit: string; isChecked: boolean }>) {
  if (!Capacitor.isNativePlatform()) return;
  const left = items.filter((i) => !i.isChecked).map((i) => ({ name: i.name, amount: formatAmount(i.quantityNeeded, i.unit) }));
  void ShareBridge.setShopping({ items: left }).catch(() => undefined);
}

/** Pages a widget asks to open; returns a function that stops listening. */
export function onNativeRoute(open: (path: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const handle = ShareBridge.addListener('route', ({ path }) => open(path));
  return () => void handle.then((h) => h.remove()).catch(() => undefined);
}
