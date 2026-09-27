import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { StorageLocation } from '../lib/types';

export const ZONES: Array<{ key: StorageLocation; label: string }> = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'pantry', label: 'Cupboard' },
  { key: 'freezer', label: 'Freezer' },
];

/**
 * Fridge, cupboard and freezer side by side: swipe between them or tap the
 * tabs above. Each room keeps its own shelves scrolling up and down; the pager
 * only moves sideways and always settles on a whole room.
 */
export function ZonePager({
  zone,
  onZone,
  render,
}: {
  zone: StorageLocation;
  onZone: (zone: StorageLocation) => void;
  render: (zone: StorageLocation) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the room on screen, so a swipe that already got there is not replayed
  const showing = useRef(zone);
  // a tab tap gliding across: the rooms it passes on the way are not the choice
  const glide = useRef<{ to: number; timer: number } | null>(null);
  const index = Math.max(0, ZONES.findIndex((z) => z.key === zone));

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // first paint only: after that the room moves by swipe or glide
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || showing.current === zone) return;
    showing.current = zone;
    const to = index * el.clientWidth;
    stopGlide();
    // should the glide not run (reduced motion, a backgrounded page), land there anyway
    const timer = window.setTimeout(() => {
      glide.current = null;
      if (Math.abs(el.scrollLeft - to) > 1) el.scrollLeft = to;
    }, 700);
    glide.current = { to, timer };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: to, behavior: still ? 'auto' : 'smooth' });
  }, [zone, index]);

  useEffect(() => stopGlide, []);

  function stopGlide() {
    if (glide.current) window.clearTimeout(glide.current.timer);
    glide.current = null;
  }

  function onScroll() {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    if (glide.current) {
      if (Math.abs(el.scrollLeft - glide.current.to) <= 1) stopGlide();
      return;
    }
    const i = Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), ZONES.length - 1);
    const next = ZONES[i].key;
    if (next !== showing.current) {
      showing.current = next;
      onZone(next);
    }
  }

  return (
    // a finger on the glass takes over from any glide
    <div className="zone-pager" ref={ref} onScroll={onScroll} onTouchStart={stopGlide} onWheel={stopGlide}>
      {ZONES.map((z) => (
        <section className="zone-pane" key={z.key} aria-label={z.label}>
          {render(z.key)}
        </section>
      ))}
    </div>
  );
}
