import type { Grade } from '../lib/types';

/** A health grade as a small coloured letter, in Nutri-Score's colours, which people already read. */
export function GradeBadge({ grade, label, small = false }: { grade: Grade; label?: string; small?: boolean }) {
  return (
    <span className={`grade grade-${grade.toLowerCase()}${small ? ' small' : ''}`} role="img" aria-label={`${label ? `${label}: ` : ''}health grade ${grade}`}>
      {grade}
    </span>
  );
}

/** The same grade as a small grey letter, for lists, where colour would shout. */
export function QuietGrade({ grade, label }: { grade: Grade; label?: string }) {
  return (
    <span className="grade-quiet" role="img" aria-label={`${label ? `${label}: ` : ''}health grade ${grade}`}>
      {grade}
    </span>
  );
}
