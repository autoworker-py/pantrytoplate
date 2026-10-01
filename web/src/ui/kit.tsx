import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Overlay } from '../components/Overlay';
import { Icon } from './Icon';
import { coverBanner } from '../lib/ads';
import { done } from '../lib/native';

/* ---------- page ---------- */

/**
 * Every screen is a header over either a scrolling column or a fixed stage.
 * The header is a three-slot grid so a centred title or mark stays centred
 * whatever sits either side of it.
 */
export function Page({
  title,
  center,
  left,
  right,
  fixed = false,
  children,
  className = '',
}: {
  title?: string;
  center?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  fixed?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page ${className}`}>
      <header className="page-head">
        <div className="slot-l">{left}</div>
        {center ?? (title ? <h1 className="head-title">{title}</h1> : <span />)}
        <div className="slot-r">{right}</div>
      </header>
      {fixed ? <div className="page-fixed">{children}</div> : <div className="page-scroll" onScroll={underHeader}>{children}</div>}
    </div>
  );
}

/** Marks the page once its column has scrolled, so the list fades under the header instead of being cut off. */
function underHeader(event: UIEvent<HTMLDivElement>) {
  const column = event.currentTarget;
  column.parentElement?.toggleAttribute('data-scrolled', column.scrollTop > 2);
}

export function Logo({ size = 44 }: { size?: number }) {
  return <img className="brand-mark" src="/logo-mark.png" alt="Pantry2Plate" width={size} height={size} style={{ width: size, height: size }} />;
}

/** Back, or home when there is nowhere to go back to (a deep link, a fresh launch). */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallback))}
    >
      <Icon name="back" size={20} />
    </button>
  );
}

/* ---------- sheet ---------- */

export function Sheet({
  title,
  sub,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  // the ad banner floats above the page; a sheet rising from the bottom would slide under it
  useEffect(() => coverBanner(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Overlay>
      <div
        className="sheet-backdrop"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.target === event.currentTarget && onClose()}
      >
        <div className="sheet" style={wide ? { maxWidth: 640 } : undefined}>
          <div className="sheet-grip" />
          <div className="sheet-head">
            <div>
              <h2>{title}</h2>
              {sub ? <p className="sub">{sub}</p> : null}
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Overlay>
  );
}

/* ---------- toast ---------- */

interface ToastAction { label: string; run: () => void }
type ShowToast = (message: string, action?: ToastAction) => void;
const ToastContext = createContext<ShowToast>(() => {});

/**
 * One message at a time, at the foot of the screen, above the tabs.
 * An action (Undo, nearly always) lives here rather than on the button that
 * caused it, so a second tap can never undo what the first one did.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>((message, action) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, action });
    // an undoable toast means something was just done: the phone says so too
    if (action) done();
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 5200 : 3200);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Overlay>
          <div key={toast.id} className={`toast ${toast.action ? '' : 'no-action'}`} role="status">
            <span className="msg">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        </Overlay>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- small controls ---------- */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  values,
  label,
  format = (v: number) => String(v),
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** an explicit ladder to walk instead of even steps: [0.25, 0.5, 0.75, 1, 1.5, 2, …] */
  values?: number[];
  label: string;
  format?: (value: number) => string;
}) {
  const down = values ? [...values].reverse().find((v) => v < value - 1e-9) : value - step >= min - 1e-9 ? +(value - step).toFixed(2) : undefined;
  const up = values ? values.find((v) => v > value + 1e-9) : value + step <= max + 1e-9 ? +(value + step).toFixed(2) : undefined;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={down === undefined} onClick={() => down !== undefined && onChange(down)}>
        <Icon name="minus" size={18} />
      </button>
      <output aria-live="polite">{format(value)}</output>
      <button type="button" aria-label={`More ${label}`} disabled={up === undefined} onClick={() => up !== undefined && onChange(up)}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Show the server's message as written: it is already prose meant for a person. */
export function errorText(error: unknown, fallback = 'That did not work. Try again.'): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}
