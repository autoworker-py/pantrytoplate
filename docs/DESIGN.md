# Designing screens in Figma

> **This describes the CURRENT implementation, not a design direction.**
> For a redesign it is evidence and anti-reference — the look to replace, not
> preserve. The numbers below are accurate to what ships today; treat them as a
> record of the incumbent, and feel free to discard all of it.

A cheat sheet to keep open in a second window. Everything here is the real
values the app already uses, so a design built on these numbers will match what
gets built — no translation step, nothing to guess.

---

## Canvas

One frame per screen. In Figma: press **F**, then pick **iPhone 16** from the
panel on the right.

- **393 × 852** — the frame size
- **16px** padding down the left and right sides of everything
- Keep the bottom **100px** clear — the tab bar floats there
- Keep the top **60px** clear — the header sits there

## Colours — light mode

| What | Hex | Where it goes |
|---|---|---|
| Page background | `#F4F6F5` | behind everything |
| Card | `#FFFFFF` | every white box |
| Text | `#0E1613` | headings and body |
| Grey text | `#6B7A74` | subtitles, labels, hints |
| Lines | `#E2E7E5` | borders, dividers |
| Green | `#157F52` | buttons, links, anything tappable |
| Green tint | `#E4F2EA` | the pale green behind "Ready" pills |
| Amber | `#9A6410` | warnings — "expires tomorrow" |
| Amber tint | `#FDF2DD` | behind amber text |
| Red | `#B3261E` | errors, "missing", delete |
| Red tint | `#FCECEB` | behind red text |

## Colours — dark mode

Same roles, different values. Deep navy-charcoal with green in it.

| What | Hex |
|---|---|
| Page background | `#0A1015` |
| Card | `#111A20` |
| Text | `#E9F1EE` |
| Grey text | `#8496A0` |
| Lines | `#22303A` |
| Green | `#4CC98D` |
| Green tint | `#14302A` |
| Amber | `#E0A860` |
| Red | `#F0736A` |

## Text sizes

| Use | Size | Weight |
|---|---|---|
| Big page title ("Recipes") | 28 | Bold |
| Section heading ("In the fridge") | 19 | Semibold |
| Card title | 17 | Semibold |
| Body | 17 | Regular |
| Subtitle / hint | 14 | Regular |
| Pill / tiny label | 12 | Semibold |

Font: **SF Pro** (Figma calls it "SF Pro Text" or "Inter" if you don't have it —
Inter is close enough and free).

## Corners

| Thing | Radius |
|---|---|
| Cards | 20 |
| Buttons, inputs | 14 |
| Small buttons | 10 |
| Pills, chips | 999 (fully round) |
| Bottom sheets | 26 on the top two corners only |

## Sizes that matter

- **Buttons are 44px tall minimum.** Smaller than that and thumbs miss them.
- **Inputs are 44px tall**, text 16px or bigger, or iPhones zoom the page.
- **12px gap** between cards, **16px** padding inside them.
- **Tab bar**: a floating rounded bar, 5 items, about 64px tall, sitting 10px
  off the bottom with 12px clear either side.

## Two things designs usually forget

**The empty version.** Every list has a day where it is empty — a new account
has no pantry, no diary, nothing planned. Design what that says, or it ships as
a blank rectangle.

**The long version.** "Milk" fits. "ORGANIC EXTRA VIRGIN OLIVE OIL" does not.
Put a genuinely long name in at least one row of every list you design and see
what happens to the layout. This exact thing already broke the shopping list
once.

---

## Where to start

Not with all of them. **Design one screen, get it built, then do the next.** The
first one teaches you what you actually want, and it is much cheaper to learn
that once than eight times.

Start with **the shopping list**. It is the simplest — a title, an add box, and
rows with a tick, a name and an ✕ — so it exercises the whole system (cards,
text, buttons, pills, empty state) without much drawing.

Then, in rough order of how much they matter: Home, Pantry, Recipes, one Recipe,
Add an item, Diary, Settings.

## Handing a screen over

1. Click the frame so its name is highlighted in the left panel
2. In Claude Code: **"Build this screen from my Figma selection"**
3. Say which API it uses — `docs/API.md` lists them all, e.g. the shopping list
   is `GET /api/shopping-list`

Claude reads the frame and writes the React component. Then check it against
`docs/API.md` so the data lines up.
