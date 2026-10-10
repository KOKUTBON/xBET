/**
 * xBET Icon System & UI Primitives
 *
 * A single hand-drawn SVG sprite (24px grid, 1.75 stroke, round joins) that
 * replaces every emoji in the interface. Icons are referenced by id through
 * `icon(name)` and inherit `currentColor`, so they theme automatically.
 */

const STROKE_ICONS: Record<string, string> = {
  // ---- Interface ----
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14.5 6v2M14.5 11v2M14.5 16v2"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><path d="M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  'shield-check': '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z"/><path d="M18 18c0 1.7-1.8 3-4 3h-2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4l.5 4h-5z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  live: '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  printer: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chart: '<path d="M4 20h16M7 16v-4M12 16V6M17 16v-7"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M3 11v4c0 1.7 2.7 3 6 3 .9 0 1.8-.1 2.6-.3"/><ellipse cx="17" cy="15" rx="4" ry="2"/><path d="M13 15v3c0 1.1 1.8 2 4 2s4-.9 4-2v-3"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5 11v9h14v-9M10 20v-5h4v5"/>',
  voucher: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 6v2M9 11v2M9 16v2M17 9.5l-4 5"/><circle cx="13.5" cy="10" r=".9"/><circle cx="16.5" cy="14" r=".9"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  flame: '<path d="M12 3c1 3 4.5 4.8 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 .9-3.4 2-4.4 0 1.9 1 3 2.2 3.2C11.3 8.6 10.6 6 12 3z"/>',
  signal: '<path d="M4 18v-2M9 18v-5M14 18v-8M19 18V6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  flag: '<path d="M5 21V4M5 4h13l-2.5 4.5L18 13H5"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  fingerprint: '<path d="M7 6.5A7 7 0 0 1 19 11v2M5 10a7 7 0 0 1 .6-2.8M5 14v-2M12 11v3.5c0 2.5-1 4.6-2.5 6M8.5 11a3.5 3.5 0 0 1 7 0v3c0 2-.4 3.8-1.2 5.3M16 20c1.2-1.8 2-4 2.2-6.2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'caret-up': '<path d="M12 6.5l6 8H6z" fill="currentColor" stroke="none"/>',
  'caret-down': '<path d="M12 17.5l-6-8h12z" fill="currentColor" stroke="none"/>',
  'at-sign': '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  logo: '<path d="M7 7l10 10M17 7L7 17" stroke-width="3.2"/><path d="M13 7h4v4" stroke-width="2.6"/>',

  // ---- Verticals / Navigation ----
  casino: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  studio: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3"/><circle cx="7" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
  virtual: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M10 8.3v5.4l4.6-2.7z" fill="currentColor"/>',
  bingo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.8"/><path d="M11 10.3l1.3-1.1v5.6"/>',
  keno: '<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6" fill="currentColor"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6" fill="currentColor"/>',
  slots: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M6.5 6V3.5h7V6M8 10v6M12 10v6M17 10h2.5v5"/><circle cx="19.5" cy="8.3" r="1.4"/>',
  cards: '<path d="M9 4h9a2 2 0 0 1 2 2v12"/><rect x="4" y="7" width="12" height="14" rx="2"/><path d="M10 11.2c-1.8 1.4-2.5 2.4-2.5 3.3a1.5 1.5 0 0 0 2.5 1.1 1.5 1.5 0 0 0 2.5-1.1c0-.9-.7-1.9-2.5-3.3zM10 15.6l-.7 1.9h1.4z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/>',

  // ---- Casino titles ----
  greyhound: '<path d="M2 9.5c1.2 1.3 2.3 1.8 3.5 1.7 2.6-.2 5.6-1.2 8.5-1.2l2.6-2.4c.6-.5 1.4-.6 2.1-.2l2.8 1.1-.3.9-3.2.4-2.2 3.2c-.7.9-1.7 1.3-2.8 1.2-1.6-.1-3.2.2-4.6.3-1.4.1-2.6-.3-3.6-1.2"/><path d="M14.2 13l5.3 2.6M13.6 13.3l3.4 4.7M7.4 13.4l-4.6 2.8M8.6 13.9l-2.2 4.6M17.3 7.4l-.8-1.9"/>',
  horse: '<path d="M7 21h12"/><path d="M9 21c0-3 1-5.2 3-7.2-2 .2-3.4-.3-4.4-1.3L6 13.2 4.8 11l5.4-5.8c.6-1.6 2-2.7 3.6-2.7l.6-1.5 1.1 1.9c3 1.3 4.5 4.8 4.5 9.1v9"/><circle cx="13.6" cy="7" r=".8" fill="currentColor"/>',
  roulette: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/><circle cx="15.6" cy="6.4" r="1" fill="currentColor" stroke="none"/>',
  blackjack: '<path d="M9 4h9a2 2 0 0 1 2 2v12"/><rect x="4" y="7" width="12" height="14" rx="2"/><path d="M10 11.2c-1.8 1.4-2.5 2.4-2.5 3.3a1.5 1.5 0 0 0 2.5 1.1 1.5 1.5 0 0 0 2.5-1.1c0-.9-.7-1.9-2.5-3.3zM10 15.6l-.7 1.9h1.4z"/>',
  baccarat: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 21h14"/><circle cx="12" cy="14.5" r="1.3"/>',
  highlow: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 6.5v4.5M9.8 8.7L12 6.5l2.2 2.2M12 13v4.5M9.8 15.3l2.2 2.2 2.2-2.2"/>',
  stud: '<path d="M8 4.8l6.6-1.7a1.5 1.5 0 0 1 1.8 1.1l3.4 12.6a1.5 1.5 0 0 1-1.1 1.8l-5.2 1.4"/><rect x="3" y="7" width="10" height="14" rx="1.5"/><path d="M8 10.8l2 3.2-2 3.2-2-3.2z"/>',
  scratch: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 11l2-2 2 2 2-2 2 2 2-2 1 1M6.5 15h5"/><circle cx="17" cy="15" r="1.3" fill="currentColor"/>',
  cherry: '<circle cx="7.5" cy="17" r="3.5"/><circle cx="16.5" cy="17" r="3.5"/><path d="M7.5 13.5C8 9 10.5 5.5 14 4M16.5 13.5c-.4-4-1-7-2.5-9.5"/><path d="M14 4c2-1.5 4.5-1.3 6-.3-1.5 1.8-4 2.2-6 .3z"/>',
  chicken: '<circle cx="8" cy="7.5" r="2.6"/><path d="M5.5 7.2l-2.2 1 2.3.8M6.8 4.9c.2-1.1 1.6-1.4 2.1-.4.6-.7 1.9-.4 1.8.6"/><path d="M9.8 9.3c-.6 1-.9 2.1-.9 3.2 0 3.9 3 6.5 6.8 6.5 3.2 0 5.3-2.3 5.3-5.3 0-1.3-.4-2.4-1.1-3.3l1.6-3.6-3.3 1.4c-2.7-.4-5.6 0-8.4 1.1z"/><path d="M12.2 13.2c1.6 1.8 4.2 2 6.1.5M13.5 19v2.5M16.5 18.8v2.7"/><circle cx="8.4" cy="7" r=".6" fill="currentColor"/>',
  tree: '<path d="M12 3l4 5h-2.3l3.8 5H15l4 5H5l4-5H6.5l3.8-5H8z"/><path d="M11 18h2v3h-2z"/>',
  amphora: '<path d="M9 3h6M10 3v2c0 1-3 2.5-3 7s2 6.5 3 7.5V21h4v-1.5c1-1 3-3 3-7.5s-3-6-3-7V3"/><path d="M7.4 8C5 8 5 12 7.1 12.5M16.6 8c2.4 0 2.4 4 .3 4.5M7.5 13.5h9"/>',
  rocket: '<path d="M12 3c3 2 4.5 5.5 4.5 9.5L14 16h-4l-2.5-3.5C7.5 8.5 9 5 12 3z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M7.6 12.4L5 15l1 3 3-1.5M16.4 12.4L19 15l-1 3-3-1.5M10.5 18.5c0 1.4.5 2.4 1.5 3 1-.6 1.5-1.6 1.5-3"/>',

  // ---- Slot symbols ----
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0M12 3v2"/>',
  lemon: '<ellipse cx="12" cy="12" rx="8" ry="5.8" transform="rotate(-35 12 12)"/><path d="M17.6 5.6l1.6-1.6M6.4 18.4L4.8 20M9 14.5c2-1 4-3 5.2-5.2"/>',
  orange: '<circle cx="12" cy="13" r="7.5"/><path d="M12 5.5V3.5M12 5.5c1.5-2 4-2.3 5.5-1.5-1 1.8-3.5 2.4-5.5 1.5z"/><circle cx="9.8" cy="11" r=".6" fill="currentColor"/><circle cx="14.2" cy="14.4" r=".6" fill="currentColor"/>',
  plum: '<path d="M12 7c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7z"/><path d="M12 7c0-2 .8-3.5 2-4.5M11 9.5c-1.2 2.4-1.2 6.6 0 9"/>',
  grape: '<circle cx="9" cy="9" r="2.4"/><circle cx="15" cy="9" r="2.4"/><circle cx="12" cy="13" r="2.4"/><circle cx="8.5" cy="14" r="2.4"/><circle cx="15.5" cy="14" r="2.4"/><circle cx="12" cy="18.5" r="2.4"/><path d="M12 6.5V3M12 4.5c1.5-1.3 3.5-1.3 4.5-.5"/>',
  gem: '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M9.5 4L12 9l2.5-5M8 9l4 11 4-11"/>',
  melon: '<path d="M3 9a9 9 0 0 0 18 0z"/><path d="M5.5 9a6.5 6.5 0 0 0 13 0"/><circle cx="9" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="13.5" r=".7" fill="currentColor"/><circle cx="15" cy="12" r=".7" fill="currentColor"/>',

  // ---- Sports ----
  soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9z"/><path d="M12 8V3.2M15.3 10.4l4.3-1.5M14 14.3l2.8 3.9M10 14.3l-2.8 3.9M8.7 10.4L4.4 8.9"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M3.4 9.4c4.3.4 7.5 3.8 7.8 11.4M12.8 3.1c.3 7.6 3.6 11 7.9 11.5"/>',
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3.2 3 9.6 0 12.8M18.4 5.6c-3 3.2-3 9.6 0 12.8"/>',
  hockey: '<path d="M5 3l5.8 12.8c.4.8 1.2 1.2 2 1.2H16v3h-3.8a4 4 0 0 1-3.6-2.3L2.8 4"/><ellipse cx="18.5" cy="8" rx="3" ry="1.4"/><path d="M15.5 8v1.8c0 .8 1.3 1.4 3 1.4s3-.6 3-1.4V8"/>',
  motorsport: '<path d="M5 21V3.5"/><path d="M5 4h14v9H5z"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="currentColor" stroke="none"/>',
  rugby: '<ellipse cx="12" cy="12" rx="9.5" ry="5.6" transform="rotate(-45 12 12)"/><path d="M6.3 13.2l4.5 4.5M13.2 6.3l4.5 4.5M9.5 14.5l5-5"/>',
  'american-football': '<ellipse cx="12" cy="12" rx="9.5" ry="5.6" transform="rotate(-45 12 12)"/><path d="M8.6 15.4l6.8-6.8M10.2 11.4l2.4 2.4M11.8 9.8l2.4 2.4M8.6 13l2.4 2.4"/>',
  baseball: '<circle cx="12" cy="12" r="9"/><path d="M6.2 5.2C8.2 7 9.3 9.4 9.3 12s-1.1 5-3.1 6.8M17.8 5.2c-2 1.8-3.1 4.2-3.1 6.8s1.1 5 3.1 6.8"/><path d="M7.5 8.5l1.5-.5M8.8 11.5h1.4M7.5 15.5l1.5.5M16.5 8.5l-1.5-.5M15.2 11.5h-1.4M16.5 15.5l-1.5.5" stroke-width="1.3"/>',
  handball: '<circle cx="9" cy="4.5" r="1.8"/><circle cx="18" cy="4.2" r="2.3"/><path d="M10 7.3l-.8 5.7 3.2 3v5M9.2 13l-3 3.8-1 4.2M10.2 8l4.8-2.6M9.8 8.8L6 10.6"/>',
  volleyball: '<circle cx="12" cy="12" r="9"/><path d="M12 12c-3.9 0-7.1 1.9-8.8 4.9M12 12c2-3.4 2-7.2.3-9M12 12c1.9 3.4 5.2 5.3 8.5 5.2M8 3.9c3.3.8 6 3.2 7.4 6.6"/>',
  cricket: '<path d="M11 7.2l5.8 5.8-7.4 7.4a1.4 1.4 0 0 1-2 0l-3.8-3.8a1.4 1.4 0 0 1 0-2z"/><path d="M14 10l5.8-5.8"/><circle cx="18.6" cy="18.6" r="2.1"/>',
  golf: '<path d="M9.5 18V3l8 3.5-8 3.5"/><ellipse cx="12" cy="19" rx="7.5" ry="2.2"/>',
  boxing: '<path d="M7 10V7.5A4.5 4.5 0 0 1 11.5 3H14a5 5 0 0 1 5 5v4a5 5 0 0 1-3 4.6V20H8v-3.8A4 4 0 0 1 5 12.3V11a1.5 1.5 0 0 1 2-1z"/><path d="M7 12.4c1.5 1 3.5 1 5 0M8 17.5h8"/>',
  mma: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M8.5 11a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16.5 11v2a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3zM11.2 9.5v2M13.8 9.5v2"/>',
  snooker: '<path d="M3 21l9-9"/><circle cx="15.2" cy="9.2" r="2.3"/><circle cx="19.2" cy="9.2" r="2.3"/><circle cx="17.2" cy="5.3" r="2.3"/>',
  darts: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4.5"/><circle cx="11" cy="13" r="1.2" fill="currentColor"/><path d="M11 13l8.5-8.5M17 3.5l.6 2.9 2.9.6"/>',
  cycling: '<circle cx="5.8" cy="16.2" r="3.6"/><circle cx="18.2" cy="16.2" r="3.6"/><path d="M5.8 16.2L9.5 9h6.7l2 7.2M9.5 9l3.3 7.2H5.8M13.3 6h2.4l.5 3M8.2 6h3"/>',
  motorcycle: '<path d="M4 15.5a8 8 0 0 1 15.6-3.5H13a1 1 0 0 0-1 1v2.3a1 1 0 0 0 1 1h7V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4.4 12h5"/>',
  badminton: '<path d="M7 3l3 12h4l3-12"/><path d="M10.5 3.6l.9 11.4M13.5 3.6l-.9 11.4M8.2 8h7.6"/><path d="M10 15h4v1.8a2 2 0 0 1-4 0z"/>',
  'table-tennis': '<ellipse cx="10" cy="10" rx="6.8" ry="6.2" transform="rotate(-45 10 10)" fill="currentColor" fill-opacity=".16"/><path d="M14.2 14.8l4.6 4.6" stroke-width="3.4"/><path d="M5.3 12.2a5.2 5.2 0 0 0 4.3 2.6"/><circle cx="19" cy="5" r="2" fill="currentColor"/>',
};

/** Sport id (from the fixture feed / sports menu) -> icon id */
export const SPORT_ICON: Record<number, string> = {
  1: 'soccer', 2: 'tennis', 3: 'basketball', 4: 'hockey', 5: 'motorsport', 6: 'rugby',
  7: 'american-football', 8: 'baseball', 9: 'handball', 10: 'volleyball', 11: 'cricket',
  12: 'golf', 13: 'boxing', 14: 'mma', 15: 'snooker', 16: 'darts', 17: 'cycling',
  18: 'motorcycle', 19: 'badminton', 20: 'table-tennis',
};

/** Sports whose competitors are individuals (rendered with round avatars instead of crests). */
export const INDIVIDUAL_SPORTS = new Set([2, 5, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

export function sportIcon(sportId: number | null | undefined): string {
  return SPORT_ICON[Number(sportId) || 1] || 'trophy';
}

/** Inline reference to a sprite icon. */
export function icon(name: string, cls: string = ''): string {
  return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/** Build the SVG sprite once and mount it at the top of <body>. */
export function mountIconSprite(): void {
  if (typeof document === 'undefined' || document.getElementById('xbet-icon-sprite')) return;
  const symbols = Object.entries(STROKE_ICONS)
    .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`)
    .join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="xbet-icon-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${symbols}</svg>`;
  document.body.insertBefore(holder.firstChild as Node, document.body.firstChild);
}

// ============================================================================
// Shared UI helpers
// ============================================================================

/** Escape text for HTML content and double-quoted attributes. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape text for a single-quoted JS string that lives inside a double-quoted attribute. */
export function jsq(value: unknown): string {
  return esc(String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

/** Stable 0-359 hue derived from a name — gives every team its own colours. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function initials(name: string): string {
  const clean = String(name || '?').replace(/\(.*?\)/g, '').trim();
  const words = clean.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Generated team crest (shield) or athlete avatar (round), coloured from the name. */
export function crest(name: string, sportId?: number, size: string = ''): string {
  const round = INDIVIDUAL_SPORTS.has(Number(sportId));
  const h = hueOf(name);
  return `<span class="crest ${round ? 'crest-round' : ''} ${size}" style="--h:${h};--h2:${(h + 48) % 360}" aria-hidden="true"><b>${esc(initials(name))}</b></span>`;
}

export function fmtPts(n: number): string {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
