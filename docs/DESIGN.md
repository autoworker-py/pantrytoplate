---
name: Pantry to Plate
description: A pantry, recipe and calorie app skinned as the corner store's own inventory board.
colors:
  green: "#2f6b45"
  green-soft: "#dcead6"
  green-line: "#a7c79c"
  amber: "#8c510c"
  amber-soft: "#f3e0bd"
  red: "#a3352a"
  red-soft: "#f2d9d2"
  mine: "#6a4a8c"
  mine-soft: "#e9dff1"
  chalk: "#35608a"
  clay: "#ab5a34"
  bg: "#f4edda"
  card: "#fffcf3"
  sunken: "#ece0c3"
  line: "#d9c9a0"
  kraft: "#e8dcc0"
  ink: "#201a12"
  ink-2: "#4c4130"
  muted: "#6a5e46"
typography:
  display:
    fontFamily: "Stardos Stencil, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.32rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.01em"
  section:
    fontFamily: "Stardos Stencil, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.045em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.006em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "9px"
  xl: "13px"
  tag: "5px"
spacing:
  gap: "12px"
  pad: "16px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#fbf6e6"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  button-selected:
    backgroundColor: "{colors.ink}"
    textColor: "#fbf6e6"
    rounded: "{rounded.md}"
    padding: "11px 16px"
---

# Design System: Pantry to Plate — The Corner Store Board

## Overview

**Creative North Star: "The Corner Store Board"**

Pantry to Plate is inventory software wearing the visual language of a corner
store's own stock board: the kraft-paper price sheet behind the deli counter,
laminated shelf tags, grease-marker headings, masking tape holding notices to
the wall, and an order pad taped to the counter. It replaces a prior soft,
rounded, pastel-green "friendly food app" system — kept only as anti-reference,
never as a rendition to soften back toward.

The metaphor is load-bearing, not decorative: the product's actual mechanism
is a corner-store owner's discipline — watch what's about to turn, mark it
down, rotate stock before it's wasted. Every visual device maps to a real
storekeeper behavior. A status is a printed tag word (never a color alone). A
confirmed action is a rubber stamp landing. A bottom sheet is torn off a pad,
not politely rounded. The tab bar is taped to the bottom of the screen, not
floating as a soft pill.

This is an **Operate**-mode surface — a tool used one-handed, standing up, in
a shop or a dim kitchen at 6pm — so density and legibility always outrank
ornament. Materials are authored as structural CSS (borders, hairline
textures, hard-offset shadows, a torn-paper `clip-path`), never as faked
photographic bevels or embossing.

**Key Characteristics:**
- Kraft-paper ground with a nearly-imperceptible woven-fibre texture, top to bottom on every screen
- Laminated white tag-cards with hairline kraft borders and hard, offset "sitting on paper" shadows, not soft floating ones
- A self-hosted stencil display face (Stardos Stencil, bold, one weight) on page titles and section headers only; body copy stays on the system stack
- Status is always a printed tag word (IN STOCK / LOW / OUT / CHECK-equivalent language), color reinforces, never carries it alone
- A single ink-stamp "selected" treatment (solid dark fill, cream text, a slight rotation) used consistently for the active tab, active segment, active chip, and active filter — one selection language, not several
- A perforated torn-left edge on every ticket-style list row; a jagged torn-top edge on the mobile bottom sheet

## Colors

Restrained-plus-accent: the kraft ground and laminate card carry the page; the
green/amber/red/mine set is quarantined to status tags, primary actions and
category badges, never washed across large fields.

### Primary
- **Produce Green** (`#2f6b45`, soft `#dcead6`, line `#a7c79c`): the one "go" color — primary buttons, "IN STOCK"-class status tags, links.

### Secondary
- **Grease-Marker Amber** (`#8c510c`, soft `#f3e0bd`): expiring-soon and low-stock tags, the inline "asked once" prompt card, informational banners.
- **Sticker Red** (`#a3352a`, soft `#f2d9d2`): missing/expired tags, destructive actions, error banners.
- **Grape Grease-Pencil** (`#6a4a8c`, soft `#e9dff1`): marks anything the user personally authored (an imported recipe, a swapped ingredient) — the one accent that means "yours," never status.

### Tertiary
- **Chalk Blue** (`#35608a`) and **Clay** (`#ab5a34`): reserved for the macro-nutrient donut's carbs/fat segments only. Kept clear of the status palette on purpose, so a glance at a chart is never mistaken for a status read.

### Neutral
- **Kraft Paper** (`#f4edda`): the page background, every screen, light mode.
- **Laminate White** (`#fffcf3`): card and sheet surfaces — always lighter than the ground, so cards read as objects sitting on the paper.
- **Kraft Tan** (`#e8dcc0` sunken · `#d9c9a0` line): recessed fields, dividers, chip backgrounds, the tape-scrap accent color.
- **Ink** (`#201a12` ink · `#4c4130` ink-2 · `#6a5e46` muted): body text, secondary text, and caption/label text, in that descending order of emphasis. All three hold ≥4.5:1 against both the paper ground and the laminate card.

Dark mode is not an inverted light mode: it is the same stockroom after
closing — cardboard-shadow brown (`#17130d`) with the same accent hues
brightened for a dark ground (green `#74c284`, amber `#e2a343`, red `#e17d70`,
mine `#bea1de`), never a straight filter invert.

### Named Rules
**The Tag Rule.** Status is never color alone: every status pill carries a
printed word (`Expires today`, `Need 2`, `Running low`) and only then a tint.
**The Quarantine Rule.** Saturated color lives inside a bordered tag, pill, or
button shape. The page ground, card fields, and structural chrome stay
strictly neutral kraft tones.

## Typography

**Display/Heading Font:** Stardos Stencil, bold 700 (with the system sans stack as fallback)
**Body Font:** the system stack — `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif`

**Character:** A genuine stencil face carries page titles and section
headers — the "grease-marker stencil heading" the world calls for — self-hosted
as a single bold weight (13.8kB, one file) so it costs nothing after first
load. Body copy deliberately stays on the zero-network system stack: this app
is used standing in a shop on one bar of signal, and a webfont dependency for
every paragraph is a cost the product's own brief rules out. Numerals are set
`tabular-nums` everywhere a number changes (stats, deductions, the calorie
target, the cook timer) so digits don't reflow as they update.

### Hierarchy
- **Display (h1)** (700, 1.32rem, uppercase, Stardos Stencil): page titles — "Today," "Pantry," "Recipes." Carries a short hand-drawn underline mark.
- **Section (h2)** (700, 0.86rem, uppercase, tracked 0.045em, Stardos Stencil): section headers inside a page — "Eat these first," "In the fridge."
- **Title (h3)** (750, 1rem, system stack, sentence case): card and row titles — recipe names, food names, entry names. Deliberately **not** the stencil face or uppercase: this is user content (including long branded product names), and casing/character shouldn't fight legibility of real data.
- **Body** (400, 17px / 16px ≥640px, system stack): all paragraph and label text.
- **Label** (800, 0.72rem, uppercase, tracked 0.045em, muted): form field captions, stat labels, pill/tag text.

### Named Rules
**The Content-Stays-Plain Rule.** Anything that is user or catalog data —
recipe names, food names, diary entries — renders in the plain system title
style, never the stencil display face and never forced uppercase, so a very
long product name still reads cleanly.

## Layout

Mobile-first, single centered column (`max-width: 720px`), 16px side padding
(22px ≥640px). The floating pill tab bar of the old system is gone; the new
tab bar is a rectangular kraft-bordered strip taped to the bottom of the
viewport with two rotated tape-scrap accents, still floating clear of the
home indicator. A sticky, translucent top bar carries the brand wordmark and
the settings glyph. Rhythm is unchanged from the prior system on purpose —
12px card gap, 16px card padding, 44px minimum tap target on primary
controls — because the kitchen-hostile-environment constraints that set those
numbers didn't change, only the paint on top of them did.

## Elevation & Depth

Hybrid, but weighted toward hard: most surfaces carry a small **hard-offset**
shadow (1–3px offset, no blur, plus a soft ambient layer underneath) so a
card reads as a laminated tag sitting *on* the kraft paper rather than
floating above it — a deliberate, world-motivated choice (a stamped block,
a taped tag), not a neobrutalist default reached for out of habit. Two scraps
of tape (`--tape`, a translucent kraft rectangle) pin the tab bar and the
dashboard's digest banner in place. The mobile bottom sheet substitutes a
torn `clip-path` silhouette for its top edge in place of a shadow cue — the
tear itself communicates "this was pulled off a pad."

### Shadow Vocabulary
- **shadow-sm** (`1px 1px 0 rgba(32,26,18,.10), 0 1px 3px rgba(32,26,18,.06)`): ordinary cards, buttons at rest.
- **shadow-md** (`2px 2px 0 rgba(32,26,18,.10), 0 8px 18px rgba(32,26,18,.10)`): the tab bar, elevated dialogs.
- **shadow-lg** (`3px 4px 0 rgba(32,26,18,.14), 0 20px 40px rgba(32,26,18,.16)`): the toast and the open sheet.

### Named Rules
**The Landed-Stamp Rule.** A button's `:active` state doesn't just dim — it
translates 1–1.5px into its own shadow, so the shadow visually disappears as
the block "lands," like a stamp pressing down.

## Shapes

Small, consistent radii — a laminated tag's corner, not an iOS card's: 4px
(sm) through 13px (xl). `--r-pill`, kept as a token name for compatibility,
now resolves to 5px — a tag corner, not a rounded pill; every chip, filter,
and status pill in the system is a small-cornered rectangle, never a fully
round capsule. Two custom silhouettes carry the rest of the shape language: a
jagged torn-top `clip-path` on the mobile sheet, and a dashed perforation
strip (a `repeating-linear-gradient` mask) down the left edge of every ticket
row in a `.list`.

## Components

Tactile and stamped: every interactive control reads as a small printed or
inked object, never a soft glass affordance.

### Buttons
- **Shape:** 6px radius (md), 1.5px ink-toned border, uppercase bold text, hard 2px offset shadow.
- **Primary:** produce green fill, cream text.
- **Secondary:** laminate-white fill, ink text and border.
- **Selected/active** (segmented, filter, chip, secondary-with-`.active`): solid ink fill, cream text, shadow removed — "stamped."
- **Ghost:** transparent, no border, no uppercase when inline inside a sentence (e.g. "change," "cancel") so it reads as a plain word, not a shout. A standalone icon-only ghost control (a sheet's close button) carries the `.icon-btn` modifier, which restores the full 44px tap target.

### Chips / Pills
- **Filter & segment chips:** kraft-tan fill, 5px corners, ink-stamped when active.
- **Status pills:** tinted background (green/amber/red/neutral/mine), always paired with a printed status word, 5px corners, a hairline border in the status color.

### Cards / Containers
- **Corner style:** 9px radius (lg).
- **Background:** laminate white (`--card`), always lighter than the kraft ground beneath it.
- **Shadow:** shadow-sm (see Elevation).
- **Border:** 1.5px kraft-tan (`--line`).
- **Internal padding:** 16px (12–14px for the `.tight` variant).

### Inputs / Fields
- **Style:** 4px radius, 1.5px kraft-tan border, laminate-white fill, 16px minimum text (blocks iOS zoom).
- **Focus:** border shifts to produce-green, 3.5px green-soft glow ring.
- **Label:** small uppercase kraft-tracked caption above the field, muted ink.
- **Placeholder:** full-strength muted ink (not faded) — placeholder text holds the same ≥4.5:1 contrast floor as any other text.

### Navigation
- **Top bar:** sticky, translucent kraft, 3px solid bottom border, Stardos Stencil wordmark.
- **Tab bar:** a rectangular kraft-bordered strip taped to the bottom of the viewport (two rotated tape-scrap pseudo-elements), authored SVG icons (one stroke weight, `currentColor`), the active tab stamped in solid ink with a −1.1° rotation.

### Ticket Rows (signature component)
Every `<ul className="list">` row (pantry items, diary entries, shopping-list
lines, cook-preview deductions) carries a dashed perforation strip down its
left edge — the visual of a ticket stub torn from a pad — implemented as a
masked `repeating-linear-gradient`, not an image. The mobile bottom sheet
extends the same idea to its top edge with an irregular `clip-path` tear.
Confirming a cook (`RecipeDetail`'s "Confirm and cook" sheet) is the moment
this pays off hardest: the deduction ledger reads exactly like a torn receipt
listing what's about to be marked down, before it happens — the product's own
"show the deduction before you make it" principle, made literal.

## Do's and Don'ts

### Do:
- **Do** keep saturated color inside a bordered tag, pill, or button shape (`--green`, `--amber`, `--red`, `--mine`); the kraft ground and card chrome stay neutral.
- **Do** pair every status color with a printed word — never rely on a tint alone.
- **Do** use the ink-stamp treatment (solid `--ink` fill, `--on-accent` text) as the one "selected/active" language across tabs, segments, chips, and filters.
- **Do** keep the stencil display face (Stardos Stencil) to page titles and section headers only.
- **Do** hold every text/background pair at ≥4.5:1 (body-size) or ≥3:1 (large text) — check new tokens against `--bg`, `--card`, and `--sunken` before shipping them.

### Don't:
- **Don't** put the stencil display face on user content (recipe names, food names) — it stays on system-authored headings only, per the Content-Stays-Plain Rule.
- **Don't** round a card, chip, or button past the `--r-xl` (13px) scale — the pill/capsule shape belongs to the old system and is retired.
- **Don't** add a webfont dependency for body copy; the "one bar of signal in a shop" constraint applies to every paragraph, not just the display face.
- **Don't** fake a physical material (embossing, stamped-metal bevels, chalk texture) in CSS gradients standing in for real material; the kraft/laminate/tape system is built from real structural CSS (borders, masks, `clip-path`), and any new material should be too.
- **Don't** reach for a floating full-pill tab bar or soft all-around shadow — both belong to the pre-redesign anti-reference system this replaced.
