import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlays outside the app shell.
 *
 * Anything drawn over the app — cook mode, sheets, toasts — used to be rendered
 * where it appeared in the tree, which put it inside the scrolling region. On
 * iOS that region is a stacking context and a containing block for fixed
 * children (a consequence of -webkit-overflow-scrolling), so "position: fixed;
 * inset: 0; z-index: 80" did not cover the screen at all: it was confined to
 * the scroller and painted *underneath* the header and tab bar, which are the
 * shell's own children. Cook mode showed its title clipped by the header and
 * its buttons hidden behind the tab bar.
 *
 * Raising the z-index cannot fix that, because the number is only compared
 * against siblings inside the trap. The overlay has to leave the shell — so it
 * is portalled to its own element at the end of <body>, where it shares the
 * root stacking context with nothing but the shell itself.
 *
 * Every full-screen or floating layer should go through here. See the --z-*
 * scale in styles.css for where each one sits.
 */
const ROOT_ID = 'overlay-root';

function overlayRoot(): HTMLElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;
  const created = document.createElement('div');
  created.id = ROOT_ID;
  document.body.appendChild(created);
  return created;
}

export function Overlay({ children }: { children: ReactNode }) {
  const [root] = useState(overlayRoot);
  return createPortal(children, root);
}
