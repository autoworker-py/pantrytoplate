# The current look

> Records what ships today. It is a **temporary placeholder**, adopted at the
> owner's request as a close restyle of the Chipotle app while the real identity
> is decided. Treat it as a description of the incumbent, not a direction to
> preserve.

Two earlier looks are recoverable — see [../backup/README.md](../backup/README.md).

## What this world is

Warm off-white ground, pure white cards, almost no shadow. One very dark brown
carries nearly all the text and every solid button. A single red appears
sparingly: the active tab, eyebrow labels, page dots. Heavy uppercase display
type for anything structural; sentence case for body copy.

Nothing here reproduces Chipotle's logo, wordmark or mascot, and their display
face is proprietary — Archivo stands in for it.

## Canvas

Frame **393 × 852** (Figma: press `F`, choose iPhone 16).

- 20px padding on the left and right
- Bottom 76px is the tab bar
- Top ~60px is the header

## Colour — light

| Role | Hex |
|---|---|
| Ground | `#F0EDE8` |
| Card | `#FFFFFF` |
| Brown (text, solid buttons) | `#451400` |
| Red (active tab, eyebrows, accents) | `#A81612` |
| Tan (quiet labels) | `#AD7B3C` |
| Muted text | `#7A5C4B` |
| Hairline | `#DDD8D0` |
| Sunken / track | `#E6E2DB` |

## Colour — dark

The same world after hours: ground goes roasted brown, ink goes cream.

| Role | Hex |
|---|---|
| Ground | `#1A0E07` |
| Card | `#251610` |
| Ink | `#F2E7DF` |
| Red | `#E8635C` |
| Tan | `#D0A163` |
| Muted | `#A98B79` |

## Status colours

Drawn from the same five, deliberately — the reference app has no green in its
chrome, and a lone green chip is what gives a borrowed palette away.

| Meaning | Light |
|---|---|
| Ready / ok | `#4A6B35` on `#EAE7D8` |
| Short / expiring | `#96591A` on `#F7ECD9` |
| Missing / expired | `#A81612` on `#F6E2DF` |

Safe because **status is never carried by colour alone** — every pill also says
the word.

## Type

- **Display** — Archivo 800, UPPERCASE, `line-height: 0.98`, slight negative
  tracking. Page titles, card titles, tab labels, stat values, buttons in the
  chrome.
- **Body** — DM Sans 400/600. Sentence case. Everything a person reads rather
  than scans.
- **Eyebrow / section label** — Archivo 700, uppercase, `letter-spacing: 0.14em`,
  ~0.7rem. Section heads and field labels.

Both from Google Fonts, linked in `index.html`.

A whole sentence is never set in caps. The reference app uses uppercase for
short headlines; a paragraph in caps reads as shouting.

## Shape

| Thing | Radius |
|---|---|
| Buttons, inputs, chips, pills | fully round (999px) |
| Cards | 18px |
| Sheets | 24px, top corners only |

## Sizes

- Buttons and inputs: **44px** minimum height
- Input text: **16px** minimum, or iOS zooms the page
- Tab labels use `clamp()` — "SHOPPING" is the longest of the five and must fit
  a fifth of a 375px screen without clipping

## The tab bar

Flat against the bottom, full width, white, one hairline on top. **Words only,
no icons** — five uppercase labels, active one in red with a 2.5px red rule
beneath it.
