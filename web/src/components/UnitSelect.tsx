/**
 * Units, as a list rather than a text box.
 *
 * People measure the same food differently — grams here, ounces there, "a bag"
 * somewhere else — and typing a unit invites typos the converter then has to
 * refuse. The food's own unit is offered first because it is nearly always what
 * you want, and anything already known stays selectable.
 */
const GROUPS: Array<{ label: string; units: string[] }> = [
  { label: 'Whole things', units: ['count', 'slice', 'can', 'jar', 'bottle', 'box', 'bag', 'packet', 'stick', 'clove'] },
  { label: 'Weight', units: ['g', 'kg', 'oz', 'lb'] },
  { label: 'Volume', units: ['ml', 'l', 'cup', 'tbsp', 'tsp', 'floz', 'pint', 'quart', 'gallon'] },
];

const LABELS: Record<string, string> = {
  count: 'count (whole items)',
  g: 'grams',
  kg: 'kilograms',
  oz: 'ounces',
  lb: 'pounds',
  ml: 'millilitres',
  l: 'litres',
  cup: 'cups',
  tbsp: 'tablespoons',
  tsp: 'teaspoons',
  floz: 'fluid ounces',
  serving: 'servings',
  package: 'packs',
};

export function UnitSelect({
  id,
  value,
  onChange,
  suggested,
}: {
  id: string;
  value: string;
  onChange: (unit: string) => void;
  /** the food's own unit, put at the top */
  suggested?: string;
}) {
  const extras = [suggested, value].filter(
    (unit): unit is string => Boolean(unit) && !GROUPS.some((group) => group.units.includes(unit!)),
  );
  const unique = [...new Set(extras)];

  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {unique.length > 0 ? (
        <optgroup label="For this item">
          {unique.map((unit) => (
            <option key={unit} value={unit}>
              {LABELS[unit] ?? unit}
            </option>
          ))}
        </optgroup>
      ) : null}
      {GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.units.map((unit) => (
            <option key={unit} value={unit}>
              {LABELS[unit] ?? unit}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
