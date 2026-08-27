import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
