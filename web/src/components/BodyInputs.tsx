import { useState } from 'react';

/*
 * Height and weight in whichever system the person thinks in. The server
 * only ever sees centimetres and kilograms; feet, inches and pounds are
 * converted here, and the choice is saved as their unit setting.
 */

export type UnitSystem = 'metric' | 'imperial';

const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;
const tenth = (n: number) => Math.round(n * 10) / 10;

/** The phone's region decides the starting point: the US measures in feet and pounds. */
export function localUnitSystem(): UnitSystem {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  return ['US', 'LR', 'MM'].includes(region) ? 'imperial' : 'metric';
}

/** "5 ft 10 in · 168 lb" or "178 cm · 76 kg", for a summary line. */
export function describeBody(system: UnitSystem, heightCm: number | null, weightKg: number | null): string {
  const parts: string[] = [];
  if (system === 'imperial') {
    if (heightCm) {
      const inches = Math.round(heightCm / CM_PER_INCH);
      parts.push(`${Math.floor(inches / 12)} ft ${inches % 12} in`);
    }
    if (weightKg) parts.push(`${Math.round(weightKg / KG_PER_POUND)} lb`);
  } else {
    if (heightCm) parts.push(`${Math.round(heightCm)} cm`);
    if (weightKg) parts.push(`${tenth(weightKg)} kg`);
  }
  return parts.join(' · ');
}

function imperialFrom(heightCm: number | null, weightKg: number | null) {
  const inches = heightCm ? Math.round(heightCm / CM_PER_INCH) : null;
  return {
    feet: inches !== null ? String(Math.floor(inches / 12)) : '',
    inches: inches !== null ? String(inches % 12) : '',
    pounds: weightKg ? String(Math.round(weightKg / KG_PER_POUND)) : '',
  };
}

export function BodyInputs({
  system,
  onSystem,
  heightCm,
  weightKg,
  onChange,
}: {
  system: UnitSystem;
  onSystem: (system: UnitSystem) => void;
  heightCm: number | null;
  weightKg: number | null;
  onChange: (heightCm: number | null, weightKg: number | null) => void;
}) {
  const [cm, setCm] = useState(heightCm ? String(Math.round(heightCm)) : '');
  const [kg, setKg] = useState(weightKg ? String(tenth(weightKg)) : '');
  const [us, setUs] = useState(() => imperialFrom(heightCm, weightKg));

  function metric(nextCm: string, nextKg: string) {
    setCm(nextCm);
    setKg(nextKg);
    onChange(Number(nextCm) || null, Number(nextKg) || null);
  }

  function imperial(next: { feet: string; inches: string; pounds: string }) {
    setUs(next);
    const inches = (Number(next.feet) || 0) * 12 + (Number(next.inches) || 0);
    onChange(inches ? tenth(inches * CM_PER_INCH) : null, Number(next.pounds) ? tenth(Number(next.pounds) * KG_PER_POUND) : null);
  }

  // switching carries the numbers across, so nothing typed is lost
  function switchTo(next: UnitSystem) {
    if (next === system) return;
    if (next === 'imperial') setUs(imperialFrom(heightCm, weightKg));
    else {
      setCm(heightCm ? String(Math.round(heightCm)) : '');
      setKg(weightKg ? String(tenth(weightKg)) : '');
    }
    onSystem(next);
  }

  return (
    <div className="body-inputs">
      <div className="body-units">
        <span className="label">Height and weight</span>
        <div className="mini-seg" role="group" aria-label="Units">
          <button type="button" className={system === 'metric' ? 'on' : ''} aria-pressed={system === 'metric'} onClick={() => switchTo('metric')}>Metric</button>
          <button type="button" className={system === 'imperial' ? 'on' : ''} aria-pressed={system === 'imperial'} onClick={() => switchTo('imperial')}>US</button>
        </div>
      </div>
      {system === 'metric' ? (
        <div className="field-row">
          <div className="field"><label htmlFor="bi-cm">Height (cm)</label><input id="bi-cm" type="number" inputMode="numeric" placeholder="178" value={cm} onChange={(e) => metric(e.target.value, kg)} /></div>
          <div className="field"><label htmlFor="bi-kg">Weight (kg)</label><input id="bi-kg" type="number" inputMode="decimal" placeholder="76" value={kg} onChange={(e) => metric(cm, e.target.value)} /></div>
        </div>
      ) : (
        <div className="field-row">
          <div className="field">
            <label htmlFor="bi-ft">Height</label>
            <div className="height-us">
              <input id="bi-ft" type="number" inputMode="numeric" placeholder="5" aria-label="Feet" value={us.feet} onChange={(e) => imperial({ ...us, feet: e.target.value })} />
              <span>ft</span>
              <input type="number" inputMode="numeric" placeholder="10" aria-label="Inches" value={us.inches} onChange={(e) => imperial({ ...us, inches: e.target.value })} />
              <span>in</span>
            </div>
          </div>
          <div className="field"><label htmlFor="bi-lb">Weight (lb)</label><input id="bi-lb" type="number" inputMode="decimal" placeholder="168" value={us.pounds} onChange={(e) => imperial({ ...us, pounds: e.target.value })} /></div>
        </div>
      )}
    </div>
  );
}
