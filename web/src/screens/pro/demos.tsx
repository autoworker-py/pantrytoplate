import { useEffect, useState, type CSSProperties } from 'react';
import '../order/order.css';
import './pro.css';

/*
 * Small looping demos of the Pro features, drawn with the features' own paper.
 * They are pictures, not controls: the preview hides them from screen readers
 * and says the same thing in words.
 */

/**
 * A demo's clock: milliseconds into the loop, and which time round it is, so
 * each loop starts afresh. Someone who has asked for less motion gets one
 * still frame.
 */
function useDemoClock(length: number, still: number) {
  const [reduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 50);
    return () => window.clearInterval(timer);
  }, [reduced]);
  return reduced ? { t: still, round: 0 } : { t: elapsed % length, round: Math.floor(elapsed / length) };
}

const WANT = 'something warm with the spinach';
const INKED_AT: Record<string, number> = { Warm: 2500, Cozy: 2850, Asian: 3200 };
const DISHES = [
  { name: 'Spinach miso ramen', minutes: 20, feels: ['Warm', 'Cozy'], note: 'Uses the spinach before tomorrow.', cuisine: 'Japanese' },
  { name: 'Ginger chicken congee', minutes: 35, feels: ['Cozy'], note: 'Slow, soothing, warm all through.', cuisine: 'Chinese' },
  { name: 'Garlic spinach fried rice', minutes: 15, feels: ['Warm'], note: 'Done in fifteen, with day-old rice.', cuisine: 'Asian' },
];
const TILT = [-1.4, 0.8, -0.6];

/** Make me something: an order written on the ticket, sent, and three tickets printed onto the rail. */
export function KitchenDemo() {
  const { t, round } = useDemoClock(9400, 3600);
  const typed = WANT.slice(0, Math.max(0, Math.floor((t - 500) / 55)));
  const inked = (word: string) => t >= (INKED_AT[word] ?? Infinity);
  const sent = t >= 4200;

  return (
    <div key={round} className={`demo${t >= 8900 ? ' fading' : ''}`}>
      <div className={`ticket mini demo-order${sent ? ' sent' : ''}`}>
        <div className="t-head"><b>Order</b><span>7:42 PM</span></div>
        <span className="t-label">What are you after?</span>
        <p className="demo-want">{typed}<i className="demo-caret" /></p>
        <span className="t-label">How should it feel?</span>
        <div className="t-tags">
          {['Warm', 'Spicy', 'Cozy', 'Fresh'].map((feel) => <span key={feel} className={`t-tag${inked(feel) ? ' inked' : ''}`}>{feel}</span>)}
        </div>
        <span className="t-label">Cuisine</span>
        <div className="t-tags">
          {['Any', 'Asian', 'European'].map((cuisine) => <span key={cuisine} className={`t-tag${inked(cuisine) ? ' inked' : ''}`}>{cuisine}</span>)}
        </div>
        <span className={`demo-send${t >= 3700 && t < 4100 ? ' pressed' : ''}`}>Send to the kitchen</span>
      </div>
      {sent ? (
        <div className="demo-pass">
          <div className="rail" />
          <div className="demo-row">
            {DISHES.map((dish, i) => (
              <div key={dish.name} className="hang" style={{ '--tilt': `${TILT[i]}deg`, '--i': i } as CSSProperties}>
                <span className="slip-clip" />
                <div className="slip mini">
                  <div className="slip-head"><span>{i + 1} of 3</span><span>{dish.minutes} min</span></div>
                  <h2>{dish.name}</h2>
                  <p className="slip-note">{dish.note}</p>
                  <div className="slip-stamps">{dish.feels.map((feel) => <span key={feel} className="stamp">{feel}</span>)}</div>
                  <p className="slip-meta">{dish.cuisine} · serves 2</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const WEEK: { day: string; dish?: string; at?: number; buy?: number }[] = [
  { day: 'Mon', dish: 'Chili con carne', at: 700, buy: 4 },
  { day: 'Tue' },
  { day: 'Wed', dish: 'Salmon & rice', at: 1800, buy: 2 },
  { day: 'Thu', dish: 'Fried rice', at: 2900, buy: 2 },
  { day: 'Fri' },
  { day: 'Sat', dish: 'Roast chicken', at: 4000, buy: 1 },
  { day: 'Sun' },
];

/** Plan my week: dinners written onto the week, and what to buy counting up as they go. */
export function PlannerDemo() {
  const { t, round } = useDemoClock(8800, 6000);
  const toBuy = WEEK.reduce((n, d) => (d.at !== undefined && t >= d.at + 300 ? n + (d.buy ?? 0) : n), 0);

  return (
    <div key={round} className={`demo${t >= 8300 ? ' fading' : ''}`}>
      <div className="ticket mini demo-week">
        <div className="t-head"><b>My week</b><span>Next 7 days</span></div>
        {WEEK.map((d) => {
          const on = d.at !== undefined && t >= d.at;
          return (
            <div key={d.day} className="t-line">
              <span className="k">{d.day}</span>
              <span className="dots" />
              <span className={`v${on ? ' inked' : ' unset'}`}>{on ? d.dish : '+ pick one'}</span>
            </div>
          );
        })}
        <div className="t-rule">Shopping</div>
        <div className="t-line">
          <span className="k">To buy</span>
          <span className="dots" />
          <span className="v num">{toBuy}</span>
        </div>
        {t >= 5000 ? <span className="stamp demo-listed">On your list</span> : null}
      </div>
    </div>
  );
}
