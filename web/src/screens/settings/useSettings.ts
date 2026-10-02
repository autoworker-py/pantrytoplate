import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Settings } from '../../lib/types';
import { errorText, useToast } from '../../ui/kit';

/** The person's settings, and saving a change to them, said out loud when the target moves. */
export function useSettings() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await api.getFresh<{ settings: Settings }>('/api/settings');
      setS(d.settings);
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Could not load your settings.'));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function save(update: Partial<Settings> & Record<string, unknown>, message?: string) {
    try {
      const d = await api.patch<{ settings: Settings & { recalculated?: boolean } }>('/api/settings', update);
      setS(d.settings);
      if (d.settings.recalculated) toast(`Your target is now ${d.settings.dailyCalorieTarget.toLocaleString()} kcal a day.`);
      else if (message) toast(message);
      return true;
    } catch (e) {
      toast(errorText(e, 'Could not save that.'));
      return false;
    }
  }

  return { s, error, save, reload };
}
