# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One household cook, on a phone, in one of three situations that shape every
screen:

- **At the counter, hands busy, putting shopping away.** Wants entry to cost as
  close to nothing as possible. Will abandon anything that feels like paperwork.
- **In a shop, standing up, one hand free.** Needs to know what to buy and why
  it is on the list. Reads, does not type.
- **In the kitchen at 6pm, deciding what to cook** from what is actually in the
  house. Not browsing for inspiration — solving tonight.

Secondary: a second person in the same household eats the same food but does not
log it. The product must survive food disappearing without explanation.

Accounts are per person and strictly separated; two people sharing an instance
must never see each other's pantry or recipes.

## Product Purpose

Enter a food once. Everything afterwards — eating it, cooking with it, throwing
it out — is a lookup and a decrement, never a new data-entry event.

It exists because the two things it fixes are the same problem seen twice: food
gets wasted because nobody knows what they have, and calorie apps get abandoned
because logging costs more than it returns. An inventory that already knows what
is in the house can answer both, from one act of entry.

Success, in priority order:

1. Less food thrown away
2. Less money spent on food
3. Logging costs less effort than MyFitnessPal
4. The user cooks things they would not otherwise have tried
5. Calories tracked as a by-product, not a chore
6. Long-term, guidance that reads as a dietician rather than a spreadsheet

## Positioning

Calorie trackers know what you ate. Recipe apps know what you could cook.
Neither knows what is in your fridge, so both make you type.

This one is inventory-first, and the whole product falls out of that: cooking a
recipe deducts its ingredients, which logs the calories, which updates the
shortfall, which fills the shopping list. Nothing else in the category can
decrement a jar of peanut butter because you made toast.

Two mechanisms a neighbouring product could not truthfully copy without building
the same foundation:

- **Unit conversion as a graph with a trust cost.** Units are nodes,
  conversions are weighted edges, and the engine finds the cheapest trustworthy
  path — ingredient-specific density beats a universal factor beats a serving
  bridge. When no path exists it refuses and says so rather than guessing. A
  wrong number in a pantry compounds silently.
- **Canonical ingredient linking.** A scanned "ORGANIC EXTRA VIRGIN OLIVE OIL"
  is understood as the olive oil a recipe asks for, via a head-noun rule and a
  calorie-density sanity check — and the guess is always shown and always
  correctable.

## Operating Context

- **Phone, one-handed, often standing.** Sometimes in a shop with one bar of
  signal. Installable to the home screen; the shell is cached, API responses
  never are, because a stale pantry count is worse than none — it gets acted on.
- **Barcode scanning by camera**, which only exists on a secure origin. HTTPS is
  a functional requirement, not a nicety.
- Free external data only: USDA FoodData Central and Open Food Facts, both
  cached locally, both allowed to fail without blocking manual entry.
- Deployed for a household, not a company. One person administers it.

## Capabilities and Constraints

Confirmed and built:

- Pantry of lots with expiry, storage location, low-stock thresholds; FEFO
  (first-expiring-first-out) deduction.
- 226 recipes and 207 foods shipped; recipes ranked by what is cookable now,
  weighted toward using food about to expire.
- Cooking is atomic and previewed: `cook-preview` states exactly what will be
  deducted; `cook` does all of it or none.
- Per-cook adjustments that are deliberately forgotten afterwards: leave an
  ingredient out, choose between two open jars, or swap in a stand-in at its own
  ratio.
- Leftovers become ordinary inventory measured in servings.
- Diary groups a cooked meal as one entry, not six loose ingredients.
- Waste log. **No prices anywhere** — food prices move, and a wrong number is
  worse than none.
- Recipes imported from a link are private to the importer; deletion is soft,
  because the diary names meals through them.
- Demo ad slots, disableable in settings, clearly labelled sponsored.

Terminology used consistently in the interface: **lot** (one purchase of a
food), **pack** (what you buy it in), **serving**, **counts as** (what a scanned
product really is), **gap** (an ingredient a recipe needs and you lack).

Hard constraints:

- Every amount is a `{ quantity, unit }` pair. Nothing in the interface may add
  two of them; the server converts, and refuses when it cannot.
- An ingredient is `ok | short | missing | unknown_conversion`. The last means
  the engine declined to guess — the interface must say so, not imply failure.
- Dates are local calendar days. A bare `YYYY-MM-DD` read as UTC put diary
  entries on the wrong day after 5pm; it is a real bug, not a hypothetical.

## Brand Commitments

Name: **Pantry to Plate**. No logo, wordmark, typeface or palette has been
commissioned — none of these are binding, and a redesign may replace all of
them.

Voice, which is binding: plain, specific, and never cheerful about bad news.
It tells you a thing went off; it does not congratulate you for noticing. Error
messages are written to be shown to a person as-is.

## Evidence on Hand

- Working product: `web/` (React) and `server/` (Fastify), 245 passing tests.
- API contract generated from live responses: `docs/API.md` — 29 read endpoints
  with real captured shapes, plus every write.
- Incumbent visual implementation: `web/src/styles.css` and `docs/DESIGN.md`.
  **Both are the current look and are anti-reference for a redesign**, not a
  world to preserve.
- Real seeded content to design against: 226 recipes, 207 foods, a demo pantry.

No photography, illustration, custom iconography or licensed typeface exists.
Food imagery is currently emoji. There are no testimonials, customers, press,
pricing or usage numbers — none may be invented.

## Product Principles

1. **Entry is the only cost.** Anything that asks a returning user to re-state
   something the app already knows is a defect, not a form.
2. **Refuse rather than guess.** Every number shown is one the engine can stand
   behind; where it cannot convert, it says so plainly and offers the correction.
3. **Waste is the scoreboard.** Where two designs compete, the one that gets
   food eaten before it spoils wins — this outranks calories, streaks and
   completeness.
4. **The kitchen is a hostile environment.** One hand, poor light, wet fingers,
   a phone on a counter across the room. Tap targets, contrast and legibility
   are functional requirements.
5. **Show the deduction before you make it.** The user must be able to see
   exactly what the app is about to change about their food, and stop it.

## Accessibility & Inclusion

- Minimum 44px tap targets; 16px minimum input text, or iOS zooms the page.
- Full light and dark support with three states — explicit light, explicit dark,
  and system default — because this is used in a dark kitchen at night.
- Status is never carried by colour alone; every pill carries a word.
- `prefers-reduced-motion` honoured.
- Camera unavailability is a supported path, not an error: a photo-upload
  fallback exists for insecure origins and refused permissions.
