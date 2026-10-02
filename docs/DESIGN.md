# Night

The design system for Pantry2Plate, as built on the `night-redesign` branch.
It records what ships, from the code in `web/src`. The previous looks are in
`backup/` and in git history; neither is a direction to preserve.

## The world

A black-glass fridge at 6pm. A charcoal room, one warm light, and the food as
the only colour. The pantry is a place you look into, not a list you read.

- **Cook** (home) shows the kitchen with tonight's recipe below it. Fridge,
  Cupboard and Freezer sit side by side: swipe between them or tap the tabs,
  which count what the recipe uses in each room with a lit dot. What it takes
  lifts off the shelf with a warm glow and its amount; nothing else is hidden.
  A recipe opens on the fridge when it uses anything there.
- **Pantry** is the same three rooms, swipeable the same way. Shelves fill from
  whatever is owned and scroll inside a fixed frame so the room stays still.
  Tapping a thing offers eat some, it's gone, move it (to another room; out of
  the freezer it can be marked thawing, which brings its date in to two days)
  and correct the amount, each with Undo.
- **Shopping**, **Eaten**, **Settings** and the sign-in screens use the same
  surfaces and type; they are lists and sheets, not fridges.

## Colour

Dark only for now. Every value is a CSS custom property in
`web/src/styles/base.css`, so a daylight theme is an override of that block,
not a revisit of every screen.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0c0d0f` | the room; the iOS launch colour too |
| `--bg-1` / `--bg-2` / `--bg-3` | `#121416` / `#181a1d` / `#202327` | cards, fields, pressed and secondary buttons |
| `--line` / `--line-2` | warm white at 7% / 13% | hairlines and outlines |
| `--ink` | `#efe9df` | text |
| `--ink-2` / `--ink-3` / `--ink-4` | ink at 68% / 46% / 30% | secondary text, hints, disabled |
| `--warm` | `#f3c98b` | food due soon, highlights, active tab rule, cooking time |
| `--red` | `#e2553f` | goes off today or tomorrow, expired, destructive |
| `--green` | `#86c9a0` | "Ready" |
| `--blue` | `#9cc3e6` | "Check units", yours, info |
| `--btn` | `#f3ede3` | primary buttons, toasts |

Status is never colour alone: every tag carries a word ("Tomorrow", "Ready",
"Need 2", "Check units").

## Type

Red Hat Display for anything read at a glance (titles, figures, tabs, tags),
Red Hat Text for everything read closely. Both are bundled from Fontsource, not
fetched, because the app is often used with one bar of signal. Figures are
tabular. Inputs are at least 16px so iOS does not zoom.

## The fridge (`web/src/fridge`)

- **Frame**: a fixed cabinet opening with walls drawn in one-point perspective
  (eye just under the ceiling, back wall at 90%), a light strip at the top, and
  a radial pool of light. Cupboard is warmer with wooden shelf planks; Freezer
  is colder with frosted drawers.
- **Shelves**: items are packed left to right by width; glass slabs have a lit
  top surface and a front edge that catches the light. Produce goes in the
  crisper drawer; the freezer is all drawers.
- **Labels** sit under the shelf edge: name (two lines at most), amount, and a
  tag only when food is due soon or low.
- **Expired** food carries a red hatch over its drawing as well as its tag.
- **Door**: black glass that swings open on its left hinge once per visit, the
  first time a fridge appears. The interior light comes on as it opens.
- **Lift and glow** (Cook): lit items rise 10px and scale 1.1 with a warm pool
  on the glass under them and an amount tag above; everything else drops only
  to 62% opacity. When two neighbours are lit, the second tag sits below its
  item so the tags never collide.

## Food drawings (`web/src/fridge/art.ts`)

Every food is a soft lit SVG object: gradient shading, a highlight, a soft
contact shadow, a thin edge.

- **Specific drawings** exist for the demo staples: a jug of milk, a tub, butter
  sticks, eggs in a carton, a cheese block and wedge, a meat tray (breasts,
  fillets, sausages, prawns), sliced meat in a pack, leftovers in a taped box,
  a leafy bag, a punnet of mushrooms, berries.
- **Containers by type** cover everything else: jar, bottle, tin, box, sack,
  carton, loaf, flatbreads, loose produce (round, oval, long, curved, bulb,
  pepper, big), herb bunch, spice jar.
- **Matching**: a name rule picks the drawing and the food's colour; a category
  fallback catches the rest; the packaging colour comes from a hash of the name
  so two unfamiliar tins are not clones. When a category is set and a name rule
  would draw something that category cannot be (soup filed under sauces), the
  category wins.
- **Quantity**: counted units are drawn one by one (nine eggs are nine eggs);
  pack units show their fraction (0.6 bag is a bag 60% full); weighed amounts
  only claim "plenty" or "running low", because the pantry does not store what
  the pack weighed when full.

**Foods the app does not know.** Two paths, both explicit:
1. *Putting food away*: search finds nothing locally or in Open Food Facts, so
   the list offers "Add 'X' as a new food". The person picks what kind of food
   it is from tiles that show each kind's drawing, sees a live preview of how
   it will sit on the shelf, and can add calories off the label. An unknown
   barcode gets the same sheet plus brand and pack weight, and every later scan
   of it resolves instantly.
2. *Importing a recipe*: the link is read first and the ingredients are shown
   split into "Foods the app knows" and "New to the app" before anything is
   saved. New ones become the importer's own foods, drawn by type.

## Receipts (`web/src/screens/receipt`, `web/src/lib/receipt.ts`)

Put food away has a third tab, Receipt, in the iPhone app. The photo is read on
the phone with Apple's text recognition (`ios/App/App/ReceiptTextPlugin.swift`)
and deleted once read. Receipts print store shorthand ("BNLS SKNLS CHKN BRST"),
so each line is matched in order against:

1. **Wording linked before.** What the phone remembers from earlier receipts:
   the line's words, the food it turned out to be, and how it was put away.
2. **Everything bought before.** The pantry now plus every food put away on
   this phone, matched by how shorthand is made (cut short, or vowels dropped).
   Describing words (organic, boneless, sharp) never name a food. A line whose
   every word is accounted for comes ticked; a near one is offered as "Looks
   like your …".
3. **Anything else** waits unticked under New to the app: link it once by
   suggestion, barcode or search, or mark it not food, and every later receipt
   knows it. Fees are skipped from the start.

The review is thermal paper under the kitchen light: recognised lines get a warm
highlighter stroke as a light sweeps down the receipt. Nothing goes in until
"Add N to pantry", which puts every ticked line away at once, with Undo. The
memory lives on the phone, per account, and is erased with the account.

## Make me something (`web/src/screens/order`)

An order for the kitchen, written on a ticket. It opens from a line under
tonight's recipe on Cook ("Not feeling it? Make me something") and from the
ticket icon in Recipes' header.

- **The ticket** is one long strip of the receipt's thermal paper under the
  light, fed from a lit slot: ORDER and the time at its head, then "What are
  you after?" written large in the display face, then printed tags for how it
  should feel (twelve), the cuisine (nine groups; marking one prints its own
  cuisines indented beneath it on a dashed line), food to use up (soonest
  dated first, drawn as on the shelf, never anything past its date), foods to
  include and to leave out (leave-out is struck through in red ink), and a
  three-box switch for cooking only from the kitchen, mostly, or anything.
- **Marking** a tag inks it with the receipt's warm highlighter, swiped left
  to right, and a light haptic tick. Status is never the highlight alone: a
  marked tag is also bolder, and a cuisine that is open is outlined.
- **The small print** sits under a dashed SMALL PRINT rule: receipt lines with
  dot leaders ("TIME ........ UNDER 30 MIN") that each open the phone's own
  picker: meal (guessed from the clock), time, serves, skill, kit, calories
  ("Fit the 840 left today"), diet (Settings by default), and heat, which only
  appears once Spicy is marked.
- **Send to the kitchen** is held just above the tabs (or the keyboard) on a
  solid band; on a blank ticket it reads "Surprise me".
- **The pass**: three tickets print onto a steel rail, each held by a clip,
  tilted slightly, swiped between. Each has the dish, why it suits (the soonest
  dated food it uses, in red when that is today or tomorrow), the feels as red
  ink stamps, what it takes from the kitchen as drawings, and what to buy.
- **The chosen ticket** hangs at the top of a normal Night page: from your
  kitchen (with the room each thing is in), to buy, the method in large
  numbered steps for reading across a kitchen, and one-tap changes (spicier,
  quicker, no oven...) that send a new order.
- **Paper on iOS**: the torn edge is a strip of teeth under the paper, not a
  mask, and the long order ticket has a plain shadow, not a filter. Both of
  those make WebKit paint a tall element as one oversized image, and it then
  stops updating it.
- **The kitchen is the AI** (Gemini, the same key as Snap), asked for three short
  ideas first and the full recipe only for the one picked. The app, not the
  model, holds the person's leave-out list and diet, and says a food is close to
  its date in its own words. A server with no key answers with fixed sample
  tickets, each stamped SAMPLE in blue ink, with a note under the rail saying so.
- **Toasts rise above the pinned button** on these screens rather than landing
  on it.

### Pantry2Plate Pro

- **Gold is Pro** (`--gold`, with `--gold-fill` and `--gold-line`), kept apart
  from the lamp's warm light. Recipes names its Pro features in gold pills at the
  top left: Make me something and Plan my week.
- **Someone without Pro sees the feature at work, not a lock.** A preview opens
  with PANTRY2PLATE PRO ruled in gold, then a small looping demo drawn with the
  feature's own paper (the order ticket typing itself and three tickets printing
  onto the rail; dinners inked onto the week and the shopping counting up), then
  what it does and the offer. The demos are pictures (hidden from screen
  readers; the words say the same) and hold one still frame for reduced motion.
- **The offer** is shared with Snap's (`ProOffer`): plans, a disabled button
  until payments are switched on, and a code. The iPhone app shows a plain note
  instead, as it sells nothing yet. Make me something is never in a free trial.
- **The server decides** (`requirePlus`): every Pro route answers 403
  `plus_required` without Pro, whatever the app shows.

### Eaten: what was left, fiber and sugar, water

- **A meal eaten out is its receipt.** Snap logs a plate item by item under one
  name; the diary shows one row ("3 items"), and opening it shows the order
  ticket's paper with a dotted line per item. Tap a line, say how much was eaten
  (All, three quarters, half, a quarter, None), and send the rest to the
  Pantry (a leftover in the fridge) or the Bin (counted as waste). A line left
  whole is struck through in the stamp's red; the rest is stamped PANTRY in
  blue ink or BIN in red. Changing your mind works from the line as first
  logged, and takes back the leftover or the waste record.
- **"I didn't finish it"** asks where the rest goes for every meal: the fridge
  (a cooked meal) or the pantry (a food), or the bin.
- **Fiber and sugar** sit in one line of small print under the macro bars;
  tapping it shows saturated fat and sodium (salt, for metric) against the
  Dietary Guidelines, scaled to the calorie target. Sugar has no line.
- **Water** is one card under the day: how much of the goal, a blue bar, and a
  round + that adds a glass, or a bottle when held. The card opens the day's
  glasses and the goal.

### Settings, weight, goals and fasting

- **Settings is a grouped list**: the account (and Pro) on top, then Goals,
  Body & weight, Fasting, Diet, Water, each showing its current value, then
  Pantry & reminders, Units (switched in place), Your data, About, Account.
  Each opens a page of its own, so no page is long.
- **Goals** shows the daily target and who set it, then Lose / Maintain / Gain.
  A goal is a weight and a date: the page says the weekly pace (Gentle,
  Steady, Faster) and the calories it means as it is typed. Faster than about
  1% of body weight a week is refused in red with the earliest safe date and a
  button to use it; a goal under a healthy weight, or a loss goal under 18, is
  refused outright. The target then adjusts weekly from the weight trend and
  the diary, unless the person sets their own.
- **Weight** is a card under water on Eaten (the latest weigh-in, the week's
  change, the trend as a small warm line) and a page with the chart: weigh-ins
  as faint dots, the smoothed trend as the warm line through them.
- **Fasting** is a slim bar above the day on Eaten, filling through the fast or
  the eating window, and a page in Settings that explains it (including who
  should ask a doctor first) and sets the plan, when the window opens, and the
  two daily notifications. The same countdown runs on the Lock Screen and in
  the Dynamic Island as a Live Activity, in the cook timer's colours.

### Plan my week

- **The week on one strip of receipt paper**, a dotted line a day: tap a day for
  its dinner, other meals tuck in under it, today is marked in the stamp's red,
  cooked meals are struck through. Four weeks ahead at most.
- **The shopping list follows the plan.** What the planned meals need and the
  pantry can't cover goes on the list marked as the plan's, sharing the pantry
  out in date order; taking a meal off takes its shopping off; cooking it
  crosses it off. Anything the person ticked, added, or took off themselves is
  left alone.

## Components (`web/src/ui`)

- `Page`: a three-slot header (left, centre, right) over a scrolling column or
  a fixed stage.
- `Sheet`: bottom sheet with a grip, title, optional subtitle and close button;
  a centred dialog on wide screens.
- `ToastProvider` / `useToast(message, action?)`: one message above the tabs.
  Undo lives here, never on the button that caused it, so a double tap cannot
  cook and then un-cook.
- Buttons: primary (light), secondary (charcoal), outline, ghost, danger;
  52px tall by default, 40px small. `icon-btn` and `pill-btn` in headers.
- Chips, segmented tabs (warm rule under the active one), switches, a stepper,
  list rows with a 44px drawing thumb, grouped settings rows.
- Icons (`ui/Icon.tsx`): one family on a 24px grid, 1.7 stroke, round ends.

## Motion

One family of curves: `cubic-bezier(.16, 1, .3, 1)` for arrivals, no bounce.
Screens settle in over 320ms; sheets rise over 420ms; the door takes 1.4s and
the light fades up with it; lift and glow is 550ms. Everything honours
`prefers-reduced-motion`, which also removes the door.

## Layout

Phone first: a 393pt canvas, 18px side gutter, tabs at the foot with the home
indicator's safe area, headers under the status bar's safe area. The page never
scrolls; each screen's own column does, so an iOS bounce never reveals the
native background.
