import { useState } from 'react';
import type { MealSlot } from '../../lib/types';
import { FoodThumb } from '../../fridge/Fridge';
import { Icon } from '../../ui/Icon';
import './snap.css';

/*
 * Snap a meal: a photo of the plate, read by an AI model on the server, back
 * as foods with portions, calories and macros to check before logging. Photo
 * estimates are rough (oil and sauces hide), so every number is editable and
 * the screen says so.
 */

export interface SnapItem {
  id: string;
  name: string;
  /** a catalogue food, for its drawing and its nutrition */
  foodName: string;
  grams: number;
  /** how it reads to a person: "about 1 cup" */
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** said when the model is unsure: hidden fats, sauces */
  note?: string;
}

/** Stands in for the photo in design review: a plate under the kitchen light. */
export function PlateArt() {
  return (
    <svg className="plate-art" viewBox="0 0 320 210" aria-hidden="true">
      <defs>
        <radialGradient id="pa-rim" cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="#fbf8f2" /><stop offset=".7" stopColor="#e7e1d6" /><stop offset="1" stopColor="#c9c1b3" /></radialGradient>
        <radialGradient id="pa-well" cx="50%" cy="40%" r="65%"><stop offset="0" stopColor="#f4efe6" /><stop offset="1" stopColor="#ddd5c7" /></radialGradient>
        <radialGradient id="pa-rice" cx="45%" cy="30%" r="70%"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#f1ece2" /><stop offset="1" stopColor="#d9d1c3" /></radialGradient>
        <linearGradient id="pa-chicken" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b57a" /><stop offset=".55" stopColor="#c9874a" /><stop offset="1" stopColor="#9c6232" /></linearGradient>
        <radialGradient id="pa-floret" cx="40%" cy="30%" r="70%"><stop offset="0" stopColor="#8fc46a" /><stop offset=".6" stopColor="#4f8a39" /><stop offset="1" stopColor="#2f5e24" /></radialGradient>
        <linearGradient id="pa-lemon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1a6" /><stop offset="1" stopColor="#f2c53d" /></linearGradient>
      </defs>
      <ellipse cx="160" cy="118" rx="156" ry="88" fill="rgba(0,0,0,.35)" transform="translate(0 8)" />
      <ellipse cx="160" cy="112" rx="152" ry="88" fill="url(#pa-rim)" />
      <ellipse cx="160" cy="110" rx="118" ry="66" fill="url(#pa-well)" />
      {/* rice */}
      <ellipse cx="112" cy="96" rx="58" ry="32" fill="url(#pa-rice)" />
      {Array.from({ length: 34 }, (_, i) => (
        <ellipse key={i} cx={70 + ((i * 23) % 84)} cy={80 + ((i * 11) % 30)} rx="3.2" ry="1.4" fill="rgba(180,168,150,.55)" transform={`rotate(${(i * 37) % 180} ${70 + ((i * 23) % 84)} ${80 + ((i * 11) % 30)})`} />
      ))}
      {/* broccoli */}
      {[[196, 72], [222, 80], [206, 92], [238, 98]].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x - 3} ${y + 8}q3 12 6 0z`} fill="#7fae56" />
          <circle cx={x - 7} cy={y} r="9" fill="url(#pa-floret)" />
          <circle cx={x + 6} cy={y - 2} r="10" fill="url(#pa-floret)" />
          <circle cx={x} cy={y - 8} r="9" fill="url(#pa-floret)" />
        </g>
      ))}
      <ellipse cx="222" cy="78" rx="20" ry="6" fill="rgba(255,255,255,.28)" />
      {/* sliced chicken */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${150 + i * 21} ${120 + i * 3}) rotate(${-12 + i * 3})`}>
          <rect x="-12" y="-18" width="26" height="44" rx="11" fill="url(#pa-chicken)" />
          <path d="M-6 -10l14 8M-7 2l15 8M-6 14l12 7" stroke="rgba(80,44,18,.55)" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="-12" y="-18" width="26" height="10" rx="5" fill="rgba(255,236,200,.28)" />
        </g>
      ))}
      {/* lemon */}
      <path d="M78 138q18 24 44 8q-18 -4 -44 -8z" fill="url(#pa-lemon)" />
      <path d="M84 140q14 12 30 6" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/** The plate under the light: the photo, or a drawing in its place. */
export function SnapStage({ scanning = false, photo }: { scanning?: boolean; photo?: string }) {
  return (
    <div className={`snap-stage${scanning ? ' scanning' : ''}${photo ? ' has-photo' : ''}`}>
      <div className="snap-photo">
        {photo ? <img className="snap-shot" src={photo} alt="Your meal" /> : <PlateArt />}
        {scanning ? <span className="snap-sweep" aria-hidden="true" /> : null}
        <span className="snap-corners" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Eaten's two ways to log what did not come from the pantry. Everyone starts without Pro; the line says where they stand. */
export function LogActions({ status, onSnap, onOther }: { status: { plus: boolean; freeLeft: number | null } | null; onSnap: () => void; onOther: () => void }) {
  const standing = !status
    ? 'Calories from a photo'
    : status.plus
      ? 'Pro: as many as you like'
      : (status.freeLeft ?? 0) > 0
        ? `${status.freeLeft} free ${status.freeLeft === 1 ? 'photo' : 'photos'} left`
        : 'Needs Pro';
  return (
    <div className="log-actions">
      <button type="button" className="snap-btn" onClick={onSnap}>
        <span className="snap-icon"><Icon name="camera" size={20} /></span>
        <span className="grow">
          <span className="t">Snap a meal</span>
          <span className="s">{standing}</span>
        </span>
      </button>
      <button type="button" className="btn secondary other-btn" onClick={onOther}>
        <Icon name="plus" size={17} /> Not in pantry
      </button>
    </div>
  );
}

export function SnapReading({ found, photo, slow = false }: { found: number; photo?: string; slow?: boolean }) {
  return (
    <div className="snap-reading" aria-live="polite">
      <SnapStage scanning photo={photo} />
      <p className="reading-count">{found ? <><b className="num">{found}</b> {found === 1 ? 'food' : 'foods'} found so far</> : 'Reading your plate…'}</p>
      <p className="fine" style={{ textAlign: 'center', marginTop: 4 }}>{slow && !found ? 'The reader is busy, so it is trying again. Hang on.' : 'Working out portions from the plate’s size'}</p>
    </div>
  );
}

/** Before it reads: the photo, and room to say what it is. Left empty, the reader works it out from the photo alone. */
export function SnapDescribe({ photo, hint, onHint, onRead, onRetake }: { photo?: string; hint: string; onHint: (hint: string) => void; onRead: () => void; onRetake: () => void }) {
  return (
    <form className="snap-describe" onSubmit={(e) => { e.preventDefault(); onRead(); }}>
      <SnapStage photo={photo} />
      <div className="field">
        <label htmlFor="snap-hint">What is it? (optional)</label>
        <input id="snap-hint" value={hint} maxLength={140} onChange={(e) => onHint(e.target.value)} placeholder="Chicken burrito bowl" enterKeyHint="go" autoComplete="off" />
        <span className="hint">A few words help it tell similar foods apart. Leave it empty and it works it out from the photo.</span>
      </div>
      <button type="submit" className="btn block" style={{ marginTop: 18 }}>Read it</button>
      <button type="button" className="btn ghost block" onClick={onRetake}><Icon name="camera" size={18} /> Retake</button>
    </form>
  );
}

const MEALS: Array<[MealSlot, string]> = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];

export function SnapReview({
  items,
  kept,
  photo,
  meal,
  busy = false,
  onToggle,
  onEdit,
  onAdd,
  onMeal,
  onLog,
  onRetake,
}: {
  items: SnapItem[];
  kept: Set<string>;
  photo?: string;
  meal: MealSlot;
  busy?: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onAdd: () => void;
  onMeal: (m: MealSlot) => void;
  onLog: () => void;
  onRetake: () => void;
}) {
  const on = items.filter((i) => kept.has(i.id));
  const sum = (k: 'calories' | 'protein' | 'carbs' | 'fat') => Math.round(on.reduce((s, i) => s + i[k], 0));
  return (
    <div className="snap-review">
      <SnapStage photo={photo} />
      <section className="snap-total">
        <div className="budget-top">
          <span className="big num">{sum('calories')}</span>
          <span className="of">kcal, about</span>
        </div>
        <div className="snap-macros">
          <span><b className="num">{sum('protein')} g</b> protein</span>
          <span><b className="num">{sum('carbs')} g</b> carbs</span>
          <span><b className="num">{sum('fat')} g</b> fat</span>
        </div>
      </section>

      <div className="section"><h2>On the plate</h2><span className="aside">Tap to change</span></div>
      <div className="list">
        {items.map((item) => (
          <div key={item.id} className={`list-row snap-item${kept.has(item.id) ? '' : ' off'}`}>
            <button type="button" className="snap-what" onClick={() => onEdit(item.id)} aria-label={`Change the portion of ${item.name}`}>
              <span className="thumb"><FoodThumb name={item.foodName} category={null} size={32} /></span>
              <span className="grow">
                <span className="t">{item.name}</span>
                <span className="s">{item.portion}</span>
                {item.note ? <span className="snap-note">{item.note}</span> : null}
              </span>
              <span className="snap-kcal num">{Math.round(item.calories)}</span>
            </button>
            <button type="button" className="icon-btn plain" aria-label={kept.has(item.id) ? `Leave out ${item.name}` : `Put ${item.name} back`} onClick={() => onToggle(item.id)}>
              <Icon name={kept.has(item.id) ? 'close' : 'plus'} size={16} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="link-btn" style={{ marginTop: 12 }} onClick={onAdd}>+ Add something it missed</button>

      <div className="label" style={{ marginTop: 20 }}>Log it as</div>
      <div className="chips" style={{ marginTop: 8 }}>
        {MEALS.map(([m, label]) => <button key={m} type="button" className={`chip${meal === m ? ' on' : ''}`} onClick={() => onMeal(m)}>{label}</button>)}
      </div>

      <p className="disclaimer">
        <Icon name="info" size={15} />
        <span>Estimated from a photo by AI. Oil, butter and sauces are hard to see and portions are judged by eye, so check anything that looks off before you log it.</span>
      </p>

      <div className="cook-bar">
        <button type="button" className="btn" onClick={onLog} disabled={busy || on.length === 0}>{busy ? 'Logging…' : `Log ${sum('calories')} kcal`}</button>
        <button type="button" className="btn secondary" onClick={onRetake} disabled={busy}>Retake</button>
      </div>
    </div>
  );
}

/** Pantry2Plate Pro. Payments are not switched on yet, so a code is the only way in, and the page says so. */
export function Paywall({ usedFree, busy = false, error, onRedeem }: { usedFree: number; busy?: boolean; error?: string | null; onRedeem: (code: string) => void }) {
  const [plan, setPlan] = useState<'year' | 'month'>('year');
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode] = useState('');
  return (
    <div className="paywall">
      <div className="test-mode"><Icon name="info" size={14} /> Test mode: payments aren’t switched on yet</div>
      <div className="paywall-hero">
        <SnapStage />
        <span className="plus-badge">Pro</span>
      </div>
      <h1 className="title-xl" style={{ marginTop: 20 }}>Snap a meal.<br />Skip the typing.</h1>
      <p className="muted" style={{ marginTop: 8 }}>You’ve used your {usedFree} free photos. Pro reads every plate you photograph, as often as you eat.</p>

      <ul className="plus-list">
        <li><Icon name="check" size={17} stroke={2.2} /> Calories and macros from a photo, in seconds</li>
        <li><Icon name="check" size={17} stroke={2.2} /> Every food listed, so you can fix anything it misjudged</li>
        <li><Icon name="check" size={17} stroke={2.2} /> Logged straight into your day, alongside what you cook</li>
      </ul>

      <div className="plans" role="radiogroup" aria-label="Plan">
        <button type="button" role="radio" aria-checked={plan === 'year'} className={`plan${plan === 'year' ? ' on' : ''}`} onClick={() => setPlan('year')}>
          <span className="plan-tag">Best value</span>
          <span className="t">Yearly</span>
          <span className="price num">$29.99<small> / year</small></span>
          <span className="s">$2.50 a month</span>
        </button>
        <button type="button" role="radio" aria-checked={plan === 'month'} className={`plan${plan === 'month' ? ' on' : ''}`} onClick={() => setPlan('month')}>
          <span className="t">Monthly</span>
          <span className="price num">$4.99<small> / month</small></span>
          <span className="s">Cancel any time</span>
        </button>
      </div>
      <button type="button" className="btn block" style={{ marginTop: 16 }} disabled>Start 7-day free trial</button>
      <p className="fine" style={{ textAlign: 'center', marginTop: 8 }}>Not available until payments are switched on.</p>

      {redeeming ? (
        <div className="redeem">
          <div className="field">
            <label htmlFor="pw-code">Code</label>
            <input id="pw-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" autoCapitalize="characters" autoComplete="off" />
          </div>
          {error ? <div className="banner error" style={{ marginTop: 12 }}>{error}</div> : null}
          <button type="button" className="btn block" style={{ marginTop: 12 }} disabled={busy || code.trim().length < 4} onClick={() => onRedeem(code.trim())}>{busy ? 'Checking…' : 'Unlock Pro'}</button>
        </div>
      ) : (
        <button type="button" className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setRedeeming(true)}>Have a code? Redeem it</button>
      )}
    </div>
  );
}
