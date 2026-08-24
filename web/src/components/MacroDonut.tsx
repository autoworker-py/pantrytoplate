/**
 * Macro split as a donut — the chart people expect from a food diary.
 *
 * Drawn as three SVG arcs rather than a chart library: it is three numbers,
 * and a dependency for that would cost more than it saves.
 */
export function MacroDonut({
  protein,
  carbs,
  fat,
  calories,
  size = 148,
}: {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  size?: number;
}) {
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = protein + carbs + fat;

  const segments =
    total > 0
      ? [
          { value: protein, color: 'var(--green)', label: 'Protein' },
          { value: carbs, color: '#3f7fb0', label: 'Carbs' },
          { value: fat, color: '#c98a2b', label: 'Fat' },
        ]
      : [];

  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Macro split">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {segments.map((segment) => {
          const length = (segment.value / 100) * circumference;
          const dash = `${length} ${circumference - length}`;
          const rotation = (offset / 100) * 360 - 90;
          offset += segment.value;
          return (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="butt"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            />
          );
        })}
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          fontSize="1.35rem"
          fontWeight="700"
          fill="var(--ink)"
        >
          {Math.round(calories)}
        </text>
        <text x="50%" y="62%" textAnchor="middle" fontSize="0.7rem" fill="var(--muted)">
          kcal
        </text>
      </svg>

      <ul className="legend">
        <li>
          <span className="swatch" style={{ background: 'var(--green)' }} /> Protein
          <strong>{protein}%</strong>
        </li>
        <li>
          <span className="swatch" style={{ background: '#3f7fb0' }} /> Carbs
          <strong>{carbs}%</strong>
        </li>
        <li>
          <span className="swatch" style={{ background: '#c98a2b' }} /> Fat
          <strong>{fat}%</strong>
        </li>
      </ul>
    </div>
  );
}
