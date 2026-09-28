import { useEffect, useState } from 'react';
import { api } from './api';
import { localUnitSystem, type UnitSystem } from '../components/BodyInputs';

/** The person's units from Settings; the phone's region until that answers. */
export function useUnitSystem(): UnitSystem {
  const [system, setSystem] = useState<UnitSystem>(localUnitSystem);
  useEffect(() => {
    let live = true;
    api
      .get<{ settings: { unitSystem?: UnitSystem } }>('/api/settings')
      .then((d) => { if (live && d.settings.unitSystem) setSystem(d.settings.unitSystem); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return system;
}

const COUNTED = new Set(['count', 'slice', 'can', 'jar', 'bottle', 'box', 'bag', 'packet', 'stick', 'clove']);
const POURED = /milk|juice|\boil\b|water|soda|drink|sauce|vinegar|syrup|broth|stock|cream|creamer|beer|wine|kombucha|coffee|\btea\b|lemonade|smoothie|kefir/;
const SPOONED = /cream cheese|ice cream|sour cream/;

/** The unit a pack of this is usually sold in: eggs by count, milk by volume, the rest by weight. */
export function packUnitFor(food: { name: string; defaultUnit: string }, system: UnitSystem): string {
  if (COUNTED.has(food.defaultUnit)) return 'count';
  const name = food.name.toLowerCase();
  if (POURED.test(name) && !SPOONED.test(name)) return system === 'imperial' ? 'floz' : 'ml';
  return system === 'imperial' ? 'oz' : 'g';
}
