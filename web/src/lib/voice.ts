import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/*
 * Hands-free cooking: "next", "back", "repeat" and "timer", heard on the phone
 * while cook mode has the microphone switched on.
 */

export type Command = 'next' | 'back' | 'repeat' | 'timer';

interface VoicePlugin {
  start(): Promise<{ listening: boolean; reason?: string; onDevice?: boolean }>;
  stop(): Promise<void>;
  addListener(event: 'command', listener: (data: { command: Command }) => void): Promise<PluginListenerHandle>;
}

const Voice = registerPlugin<VoicePlugin>('Voice');

export const voiceOnThisDevice = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

/** Start listening; the returned stop() switches it off again. */
export async function listen(onCommand: (command: Command) => void): Promise<{ ok: boolean; reason?: string; stop: () => Promise<void> }> {
  const handle = await Voice.addListener('command', (data) => onCommand(data.command));
  const started = await Voice.start().catch(() => ({ listening: false, reason: 'unavailable' }));
  const stop = async () => {
    await handle.remove();
    await Voice.stop().catch(() => undefined);
  };
  if (!started.listening) {
    await stop();
    return { ok: false, reason: started.reason, stop: async () => undefined };
  }
  return { ok: true, stop };
}

/** Read a step aloud, for "repeat". */
export function say(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
