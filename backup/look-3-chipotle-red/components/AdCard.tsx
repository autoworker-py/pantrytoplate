import type { Ad } from '../lib/types';

/**
 * A demo ad placement.
 *
 * Plain-text brand name only — no logo, no brand colours — and the
 * "Sponsored · Demo" label is never optional. When the user turns ads off the
 * API returns nothing, so this component simply never renders: no empty box,
 * no gap in the layout.
 */
export function AdCard({ ad, onAction }: { ad: Ad; onAction?: (ad: Ad) => void }) {
  return (
    <aside className="ad" aria-label={`Advertisement from ${ad.sponsor}`}>
      <div className="ad-label">{ad.label}</div>
      <div className="row top">
        <div className="grow">
          <strong>{ad.headline}</strong>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            {ad.body}
          </p>
        </div>
        {onAction ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => onAction(ad)}>
            {ad.cta}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
