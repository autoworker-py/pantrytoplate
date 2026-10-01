/**
 * Six boxes for the code from an email, backed by one ordinary field.
 *
 * One field rather than six is what lets the iPhone offer the code from Mail
 * above the keyboard in a single tap, and lets paste and delete work the way
 * they do anywhere else; the boxes only show it a digit at a time.
 */
export function CodeBoxes({
  value,
  onChange,
  wrong = false,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (digits: string) => void;
  /** shakes, and the boxes go red, until the next digit is typed */
  wrong?: boolean;
  /** while a code is being checked: the field keeps its focus, so the keyboard stays up for another try */
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return (
    <label className={`code-boxes${wrong ? ' wrong' : ''}`}>
      <input
        value={digits}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        enterKeyHint="done"
        aria-label="6-digit code"
        readOnly={disabled}
        autoFocus={autoFocus}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} aria-hidden="true" className={`code-box${digits[i] ? ' filled' : ''}${i === Math.min(digits.length, 5) ? ' at' : ''}`}>
          {digits[i] ?? ''}
        </span>
      ))}
    </label>
  );
}
