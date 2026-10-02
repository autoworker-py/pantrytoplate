import { useAuth } from '../../lib/auth';
import { describeBody } from '../../components/BodyInputs';
import { BackButton, Page } from '../../ui/kit';
import { formatWater } from '../eaten/DiaryParts';
import { NavRow, Row } from './sheets';
import { useSettings } from './useSettings';
import './settings.css';

/*
 * Settings, in sections: what the person is aiming for first, then the rest.
 * Each section opens a page of its own, so no one page is long.
 */
export default function SettingsHome() {
  const { user } = useAuth();
  const { s, error, save } = useSettings();
  const diet = s?.dietTags.length ? s.dietTags.map((t) => t[0]!.toUpperCase() + t.slice(1)).join(', ') : 'Anything';

  return (
    <Page left={<BackButton />} title="Settings">
      {error ? <div className="banner error">{error}</div> : null}
      {!s ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : (
        <>
          <div className="account-card">
            <span className="grow">
              <span className="t">{user?.email ?? s.email}</span>
              <span className="s">{user?.plus ? 'Pantry2Plate Pro' : 'Free'}</span>
            </span>
            {user?.plus ? <span className="pro-pill">Pro</span> : null}
          </div>

          <div className="group settings-group">
            <NavRow to="/settings/goals" title="Goals" value={`${s.dailyCalorieTarget.toLocaleString()} kcal`} />
            <NavRow to="/settings/body" title="Body & weight" value={s.body.weightKg ? describeBody(s.unitSystem, null, s.body.weightKg) : 'Not set'} />
            <NavRow to="/settings/fasting" title="Fasting" value={s.fasting?.plan ?? 'Off'} />
            <NavRow to="/settings/diet" title="Diet" value={diet} />
            <NavRow to="/settings/water" title="Water" value={formatWater(s.waterGoalMl ?? 2500, s.unitSystem)} />
          </div>

          <div className="group settings-group">
            <NavRow to="/settings/pantry" title="Pantry & reminders" />
            <Row title="Units">
              <div className="mini-seg">
                {(['metric', 'imperial'] as const).map((u) => (
                  <button key={u} type="button" className={s.unitSystem === u ? 'on' : ''} onClick={() => void save({ unitSystem: u })}>
                    {u === 'metric' ? 'Metric' : 'Imperial'}
                  </button>
                ))}
              </div>
            </Row>
            <NavRow to="/settings/data" title="Your data" />
            <NavRow to="/settings/about" title="About" />
            <NavRow to="/settings/account" title="Account" />
          </div>
        </>
      )}
    </Page>
  );
}
