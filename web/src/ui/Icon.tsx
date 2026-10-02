/**
 * One icon family, drawn for Night: a 24px grid, a 1.7 stroke, round ends.
 * Nothing borrowed from an emoji font, nothing filled except where the object
 * itself is solid.
 */
const PATHS = {
  cook: '<path d="M5 10h14v6.5A3.5 3.5 0 0 1 15.5 20h-7A3.5 3.5 0 0 1 5 16.5V10Z"/><path d="M2.5 10H5M19 10h2.5M8 7h8M12 4.5V7"/>',
  pantry: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 9.5h12M9 5.5v2M9 12.5v3"/>',
  shopping: '<path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  eaten: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.8-3.2-6-4.2-10-2.3 1.5-3.4 3.9-3.4 5.8-1.2-.7-1.8-2-1.9-3C7.5 9 5.5 11.6 5.5 14.5A6.5 6.5 0 0 0 12 21Z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.8a3 3 0 0 1 0 5.6M17.5 14.3a5.2 5.2 0 0 1 3 5.2"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.5 1.6M9.5 2.5h5M19 6.5l1.5-1.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>',
  undo: '<path d="M8 9H15a5 5 0 0 1 0 10h-4"/><path d="M11 5.5 7.5 9 11 12.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h2.5M13.5 13.5H16M8 16.8h2.5"/>',
  ticket: '<path d="M6 3h12v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V3Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.8v6.4l5.2-3.2-5.2-3.2Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  logout: '<path d="M14.5 7V5.5A1.5 1.5 0 0 0 13 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7a1.5 1.5 0 0 0 1.5-1.5V17"/><path d="M10 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
  bell: '<path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5H5l1.5-1.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  fork: '<path d="M7 3v6.5a2.5 2.5 0 0 0 5 0V3M9.5 3v18M17 21V3c-2 1.2-3 3.4-3 6.5V13h3"/>',
  out: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M10 20v-5h4v5"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14-14 .3 9-5.2 14-13 14H5Z"/><path d="M5 19c3-4 6-6.5 10-8"/>',
  bin: '<path d="M5 7.5h14M10 11v6M14 11v6M6.5 7.5l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12M9.5 7.5V5h5v2.5"/>',
  people: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 12h6M9 15.5h6"/>',
  sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
  door: '<rect x="5.5" y="3" width="13" height="18" rx="2"/><path d="M15 11.5v2"/>',
  alert: '<path d="M12 4 21 19.5H3L12 4Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  move: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, stroke = 1.7, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
