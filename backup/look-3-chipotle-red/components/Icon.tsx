/**
 * The app's own marks, stencil-cut rather than borrowed from an emoji font.
 *
 * Bold, uniform strokes read at a glance in bad light with a wet thumb —
 * the same reason a stockroom stencils "FRAGILE" on a crate instead of
 * writing it in longhand. One weight, one cap style, currentColor throughout
 * so every icon inherits its tag's ink.
 */
export type IconName =
  | 'board'
  | 'crate'
  | 'spike'
  | 'skillet'
  | 'cart'
  | 'gear'
  | 'tag'
  | 'book'
  | 'search'
  | 'bowl'
  | 'snow'
  | 'box'
  | 'close'
  | 'sun'
  | 'moon'
  | 'star'
  | 'star-filled'
  | 'arrow-left'
  | 'arrow-right';

const PATHS: Record<IconName, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.2 12H1.6M22.4 12h-2.6M6.5 6.5 4.6 4.6M19.4 19.4l-1.9-1.9M17.5 6.5l1.9-1.9M4.6 19.4l1.9-1.9" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />,
  star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" />,
  'star-filled': (
    <path
      d="m12 3.6 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"
      fill="currentColor"
    />
  ),
  'arrow-left': <path d="M19 12H5m0 0 6.5-6.5M5 12l6.5 6.5" />,
  'arrow-right': <path d="M5 12h14m0 0-6.5-6.5M19 12l-6.5 6.5" />,
  board: (
    <>
      <path d="M8 3.5h8l1.5 2H6.5z" />
      <rect x="4.5" y="5.5" width="15" height="15" rx="1.5" />
      <path d="M8 10.5h8M8 14.5h5" />
    </>
  ),
  crate: (
    <>
      <path d="M3.5 8.5 12 4.5l8.5 4v9.5L12 22l-8.5-4z" />
      <path d="M3.5 8.5 12 12.5l8.5-4M12 12.5V22" />
    </>
  ),
  spike: (
    <>
      <path d="M12 3v13" />
      <rect x="8.5" y="6" width="7" height="5.5" rx="0.5" transform="rotate(-6 12 8.75)" />
      <path d="M6 21h12M12 16v5" />
    </>
  ),
  skillet: (
    <>
      <circle cx="10.5" cy="12" r="7.5" />
      <path d="M17.3 8.7 22 6.5" />
      <path d="M8 12h5M8 15h3" />
    </>
  ),
  cart: (
    <>
      <path d="M3.5 4.5h2.2l1 3M6.7 7.5h13l-2 8H8.5z" />
      <path d="M6.7 7.5 8.5 15.5" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3.5v2.6M12 17.9v2.6M20.5 12h-2.6M6.1 12H3.5M17.8 6.2l-1.8 1.8M8 16l-1.8 1.8M17.8 17.8 16 16M8 8 6.2 6.2" />
    </>
  ),
  tag: (
    <>
      <path d="M12.5 3.5H6a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l6.5-6.5a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3z" />
      <circle cx="8.7" cy="8.7" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M3.5 5.5c2.5-1 5.5-1 8.5.5v13c-3-1.5-6-1.5-8.5-.5z" />
      <path d="M20.5 5.5c-2.5-1-5.5-1-8.5.5v13c3-1.5 6-1.5 8.5-.5z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m19.5 19.5-4-4" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 12.5h18a8 6 0 0 1-8 6h-2a8 6 0 0 1-8-6Z" />
      <path d="M9 8.5c-.6-1 -.6-2 0-3M13.5 8c-.6-1.2-.6-2.2 0-3.3" />
    </>
  ),
  snow: (
    <>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M12 3l-2 2m2-2 2 2M12 21l-2-2m2 2 2-2M4.5 7.5l.6 2.6-2.6.4M4.5 7.5l2.6-.6-.4-2.6M19.5 7.5l-.6 2.6 2.6.4M19.5 7.5l-2.6-.6.4-2.6M4.5 16.5l.6-2.6-2.6-.4M4.5 16.5l2.6.6-.4 2.6M19.5 16.5l-.6-2.6 2.6-.4M19.5 16.5l-2.6.6.4 2.6" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 8 12 4l8.5 4-8.5 4z" />
      <path d="M3.5 8v9l8.5 4 8.5-4V8M12 12v9" />
    </>
  ),
  close: (
    <>
      <path d="m5 5 14 14M19 5 5 19" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
