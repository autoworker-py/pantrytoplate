import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { clockTime, fastingState } from '../lib/fasting';
import type { Settings } from '../lib/types';

/**
 * A quiet line in any sheet that logs food: during a fast, logging still works,
 * but the person is reminded what it does to the fast before they confirm.
 */
export function FastingReminder({ style }: { style?: React.CSSProperties }) {
  const [fasting, setFasting] = useState<Settings['fasting'] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ settings: Settings }>('/api/settings').then((d) => { if (live) setFasting(d.settings.fasting ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!fasting?.plan || !fasting.start) return null;
  const state = fastingState(fasting.plan, fasting.start);
  if (state.phase !== 'fasting') return null;
  return (
    <div className="banner" role="note" style={style}>
      <strong>You’re fasting</strong> until {clockTime(state.until)}. Logging this breaks the fast.
    </div>
  );
}
