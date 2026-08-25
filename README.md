# Pantry → Plate

A pantry inventory and recipe app built on one idea: **you enter a food once**.
After that, eating it — on its own or as part of a recipe — is a lookup and a
decrement against inventory you already told the app about, never a new
data-entry event.

The flow the product is built around:

1. Add a dozen eggs and a box of 10 pop tarts to your pantry. Once.
2. Eat a pop tart → tap it in your pantry, log 1. Inventory shows 9. No search,
   no re-typing.
3. Want an omelette → search recipes, the app sees it needs 3 eggs, checks you
   have 12, shows you exactly what will be deducted, and on confirm logs
   3 eggs consumed and leaves you with 9.
4. At the store → open the app, see live counts.
5. Ate out, or a roommate finished the milk? Both are one tap, and only one of
   them touches your calories.

---

## Quick start

Requires **Node 20+** (developed on Node 26) and nothing else — the dev database
is SQLite and the seed data means you never need an API key to try the app.

```bash
cd server && npm install && cp .env.example .env && npx prisma migrate dev && npm run seed && npm run dev
```

Then, in a second terminal:

```bash
cd web && npm install && npm run dev
```

Open http://localhost:5173 and sign in with the seeded demo account:

- **demo@pantry.local** / **pantrydemo** — comes with a 26-item pantry, 12
  recipes, and items deliberately set to expire in 1–2 days so the expiry
  warnings have something to show.

The backend runs on `:4000`; Vite proxies `/api` to it, so there is no CORS
configuration to do in development.

### Everyday commands

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | `server/` | API with hot reload on `:4000` |
| `npm run dev` | `web/` | Web app on `:5173` |
| `npm test` | `server/` | Full test suite (77 tests) |
| `npm run seed` | `server/` | Re-seed catalog, recipes, demo user (idempotent) |
| `npm run reset` | `server/` | Drop, re-migrate and re-seed the database |
| `npm run migrate` | `server/` | Create + apply a new migration after a schema edit |
| `npm run build` | either | Production build |

---

## What the app does

**Pantry**
- Add by typing, by scanning a barcode, or in a batch — scan ten things in a row
  and confirm once
- **Expiry dates fill themselves in** from typical shelf life (per food, then by
  category, adjusted for fridge/freezer). Always shown as an estimate, always
  editable — an empty date field is why expiry tracking fails everywhere else
- Sort by expiry, category, name or date added; per-lot calories and macros
- Freeze an item: moves it and pushes the expiry date out
- Low-stock thresholds per item

**Four different ways food leaves the pantry**, and only the first one counts as
your calories:
| Action | Inventory | Your diary | Waste log |
| --- | --- | --- | --- |
| I ate it | ↓ | logged | — |
| Someone else ate it | ↓ | untouched | logged |
| Used up | ↓ | untouched | logged |
| Threw it out | ↓ | untouched | logged as waste |

**Leftovers** — cooking asks how many portions you are keeping. Those go in the
fridge as a real pantry item with their own short expiry, so eating one lasagne
portion or one cookie later is the same one-tap operation as eating an egg. Only
the portion you actually ate counts towards today's calories.

**Diary** (its own tab)
- Calories and protein/carbs/fat against your targets
- Macro split as a donut, entries grouped into breakfast / lunch / dinner / snacks
- Tap any entry for the full breakdown; a cooked meal shows every ingredient
- **Undo** — removes the entry and puts the food back in the pantry, atomically
- Seven-day trend, and any day is browsable

**Eating out** — log a Costco hot dog with no pantry involvement at all. Search
the catalog, or type a name and calories once and it is in Recents forever.

**Recipes** — 226 of them, across 20+ cuisines
- Ranked: cookable-now recipes that use expiring food first, then cookable-now,
  then near-misses — with your weight goal breaking ties
- Cook time, difficulty, tags, and calories/protein per serving on every card
- Filters: under 20 minutes, under 400 kcal, can-make-now
- **"One or two items away"** with a one-tap add of just the gaps
- **Leave an ingredient out** — no carrots, thanks. Calories drop to match, the
  ingredient is not deducted, and a recipe you were only missing that one thing
  for becomes cookable
- **Substitutions** — out of butter but holding oil? It suggests stand-ins you
  actually own, with the right ratio (oil for butter is 0.75, not 1:1) and an
  honest note about what changes. Only ever a suggestion
- **Cook mode** — full screen, one step at a time, screen kept awake, and any
  duration in a step becomes a tappable timer
- **Rate it** — things you rate well rank higher next time
- **Cook it again** — what you keep coming back to, one tap from the home screen
- **Two jars open?** When more than one product satisfies an ingredient the app
  asks which to use rather than silently choosing
- **Import by URL** — reads the schema.org recipe data a page already publishes,
  parses the ingredient lines, and matches them to your catalog

## Branded products vs. generic ingredients

A barcode scan creates its own catalog row — "ORGANIC EXTRA VIRGIN OLIVE OIL" —
but recipes ask for the generic ingredient, "Olive Oil". Without a link between
the two, the app tells you that you are missing something you are holding.

`food_reference.canonicalId` is that link, and recipe matching, cooking,
low-stock checks and unit conversion all resolve through it.

**The rule is the head noun.** In English food names the last words say what the
thing *is* and everything before is description:

| Product | Counts as | Why |
| --- | --- | --- |
| organic extra virgin **olive oil** | Olive Oil | ends with the ingredient |
| organic olive oil, basil & garlic **sauce** | *nothing* | it is a sauce |
| organic **coconut milk** | Coconut Milk | longest match wins over "milk" |
| milk chocolate **morsels** | *nothing* | not milk |

Matching anywhere in the string would file that garlic sauce as olive oil, which
is exactly the failure this exists to prevent. Two more guards:

- **Packaging noise is peeled off the end first**, so "CAGE-FREE EGGS GRADE AA
  LARGE" still resolves to Egg. Only words that can never name a food are
  strippable — "sauce", "spread" and "mix" are deliberately not on that list.
- **A nutrition check catches head nouns that lie.** Almond milk ends in "milk"
  but has a sixth of the calories, so it is left unlinked rather than silently
  treated as dairy.

**Anything inferred is shown and correctable.** Every pantry item displays what
it counts as and who decided — "we worked this out from the name" or "you set
this" — and a decision made by a person is never overwritten by a later guess.

**Branded products inherit their ingredient's densities**, so a recipe asking
for a tablespoon of olive oil can be deducted from a scanned bottle that carries
no density data of its own.

## The recipe corpus

**226 recipes over a 203-food catalog**, written for this app rather than
scraped: breakfasts, poultry, meat, seafood, vegetarian, pasta, soups, salads,
sides, baking and desserts, world cooking, and snacks. Twenty-plus cuisines,
every meal type tagged, cook times and difficulty on all of them.

They live in `prisma/data/` — `foods.ts` and `recipes/*.ts` — as plain data, so
adding to the book means adding to an array.

**Every recipe is verified to actually work**, which for this app means
something specific: the ingredients must resolve to real catalog foods, and the
units the recipe asks for must convert into the units a pantry stores them in.
A recipe the app cannot deduct is worse than no recipe. `tests/corpus.test.ts`
walks the entire book on every run and asserts:

- every ingredient links to a food that exists
- every recipe unit converts to that food's own unit **and** to grams
- every ingredient yields calories, and every recipe lands in a believable
  calories-per-serving range
- macro totals roughly account for the calorie totals (catches bad nutrition rows)
- no duplicate names, no duplicate ingredients, nothing with zero quantity

So a typo'd ingredient key or an impossible unit fails the build instead of
shipping a recipe that breaks when someone tries to cook it.

**Ranking stays fast as the book grows.** Evaluating a recipe properly means
running the conversion planner over every ingredient — far too expensive for a
whole book on every search. So search runs in two stages: a cheap SQL count of
how many of each recipe's ingredients the user owns at all, then the full
evaluation on only the best ~60 candidates. Search over 226 recipes returns in
about 20ms, and the cost stays flat as the corpus grows.

**Shopping list**
- **Auto-adds anything you run out of**, with no thresholds to configure — an
  optional per-item threshold adds it earlier
- Quantities are rounded to something buyable: 1.43 slices becomes 2, 17 g
  becomes 20 g. Always up, because coming home short is the worse mistake
- Tap any line to see **what it is for** — "1 tbsp for Scrambled Eggs on Toast"
  — and what else it unlocks. Far more use in a shop than a precise fraction
- **Scan in store**: point at something on the shelf and see what you could make
  with it. Nothing is added to your pantry — it is a question, not a purchase
- Checking something off puts it straight in the pantry, expiry date and all

**No prices anywhere.** Food prices move weekly, vary by shop, and we do not
read receipts — any figure would have been a confident-looking guess. Waste is
reported as counts and frequencies, which are true and are what actually
changes what you buy.

**Settings** — light / dark / system theme (kept per device), metric or
imperial, diet filters (a diet is a hard filter, not a preference), weight goal
(lose / maintain / gain), calorie and macro targets, expiry warning window,
reminders, auto-shopping switch, the ads switch, and **export everything as one
JSON file** — your pantry should not be trapped in someone else's database.

**Adding to the pantry** — name, quantity and a unit **dropdown** are all that
show; expiry, category and serving size sit behind a **More** toggle. Scanning
is one item at a time: the camera stays live, each barcode fires **once**, and
a short confirmation opens for that product before you carry on scanning.

**"You'll run out Thursday"** — every decrement has been recorded since day one,
which is enough to know how fast a household actually gets through things. The
home screen warns about what is about to run out, not just what already has.
Deliberately silent until there is enough history to mean it: a rate from two
data points is a coincidence, not a pattern.

**The daily nudge** — one line at the top of the home screen with what dies
tomorrow and what you could cook tonight to save it, shown as a system
notification too if you allow it. Installable as a home-screen app, with the
shell cached so it opens in a shop with one bar. API responses are never cached:
a stale pantry count is worse than none, because you would act on it.

**Meal planning** — pencil in the week, get one consolidated shortfall across
every planned meal rather than a shopping trip per recipe.

**Reconciliation** — the home screen occasionally asks about items nothing has
touched in weeks. Inventory drifts from reality, especially in a shared house,
and wrong counts are how people stop trusting the app.

## Ads (demo monetisation)

Off-switch first: `Settings → Show sponsored suggestions`. When it is off every
ad endpoint returns an empty list, so the UI has nothing to lay out around — no
gaps, no placeholders.

Three placements: the home screen, between recipe results, and sponsored product
cards on the shopping list. A sponsor is a field on the food itself
(`food_reference.sponsorName`), so the shopping-list placement has real
commercial logic behind it rather than being scattered at random.

**Brand names are plain text only** — no logos, no brand colours, no trade dress
— and every unit renders behind a `Sponsored · Demo` label. Reproducing a real
company's branding in a mock ad implies a commercial relationship that does not
exist; a name demonstrates the placement and claims nothing.

---

## Environment variables

All of these live in `server/.env` (copy from `server/.env.example`). Every one
has a working default, so the app runs with an untouched copy of the example
file.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | SQLite for dev; a Postgres URL for production |
| `JWT_SECRET` | dev placeholder | **Change for any real deployment.** `openssl rand -hex 32` |
| `USDA_API_KEY` | `DEMO_KEY` | **Put your USDA key here.** Free at <https://fdc.nal.usda.gov/api-key-signup.html>. `DEMO_KEY` works but is limited to ~30 requests/hour; a registered key gives ~1,000/hour |
| `OFF_USER_AGENT` | `PantryToPlate/0.1 …` | Open Food Facts asks callers to identify themselves. No key needed |
| `OFFLINE_MODE` | `false` | `true` disables all outbound calls; the app stays fully usable on the local catalog |
| `EXPIRY_WARNING_DAYS` | `3` | How far ahead the expiry alerts look |
| `PORT` / `CORS_ORIGIN` | `4000` / `http://localhost:5173` | |

The web app needs `VITE_API_URL` only if the API is deployed on a different
origin than the frontend.

---

## Stack, and why

**Backend: Node + TypeScript (Fastify) + Prisma.** The spec asked for whichever
of Node/TS or Python/FastAPI gives stronger type safety and cleaner ORM support.
Prisma is the deciding factor: it generates types from the schema, so a query's
result type changes the moment the schema does, and the conversion/deduction
code — the part most likely to silently corrupt data — is checked against the
real column types rather than a hand-written model. Prisma also makes the
SQLite → Postgres path a provider swap rather than a migration project, which is
exactly the "prototype fast, deploy on Postgres" shape the spec asked for.
Fastify over Express for first-class TypeScript support and `app.inject()`,
which lets the integration tests exercise the real HTTP stack with no port
binding.

**Database: SQLite locally, Postgres-shaped.** The schema avoids SQLite-only
constructs — enum-ish columns are plain strings with the allowed values
documented in the schema, which is also what keeps Postgres migration trivial.
To switch:

1. change `provider = "sqlite"` to `provider = "postgresql"` in
   `server/prisma/schema.prisma`
2. point `DATABASE_URL` at Postgres
3. `npm run migrate:deploy && npm run seed`

**Frontend: React + TypeScript + Vite.** Responsive web app, no native code.
Barcode scanning goes through the device camera via `@zxing/browser`, which is
lazy-loaded so the 400 kB decoder only downloads when someone opens the scan tab
(main bundle: 63 kB gzipped).

**Hosting:** nothing platform-specific. The API is a plain Node process
respecting `PORT`; the web app is static files. Render, Railway and Fly.io all
work as-is.

---

## The hard part: unit matching and conversion

This is where the auto-decrement promise lives or dies, and it got the most
attention. `server/src/services/units.ts` is a pure module (no DB, no I/O) so it
can be tested exhaustively; `conversions.ts` is the thin DB-backed wrapper.

**Units are nodes in a graph, conversions are weighted edges.** Three sources of
edges, ordered by how much they are trusted:

| Source | Example | Cost |
| --- | --- | --- |
| Ingredient-specific rows | 1 cup flour → 120 g | 1 |
| Universal rows | 1 cup → 236.59 ml | 2 |
| Serving-size bridge | 1 egg → 50 g | 3 |

A shortest-path search on that cost finds the conversion, which means an
ingredient's own density always beats a generic inference. "2 cups flour" out of
a "32 oz bag" resolves as `cup →(density) g →(universal) oz`, and 8.47 oz comes
off the bag.

**Four rules the implementation follows:**

1. **The countable case is exact.** Eggs to eggs is a plain subtraction with no
   conversion in the path at all — this is the most common case and the one in
   the demo, so it never depends on any of the machinery above.
2. **Ingredient densities are per-ingredient.** 1 cup flour (120 g) ≠ 1 cup
   sugar (200 g). ~30 common ingredients ship with densities, plus container
   sizes (a stick of butter, a can of beans, a box of pop tarts).
3. **No path means no guess.** An unconvertible unit is reported as
   `unknown_conversion` and surfaced to the user for manual confirmation. The
   app never invents a factor, and never silently skips a lot.
4. **Nothing is deducted before you see it.** Every cook goes through a
   confirmation screen listing each ingredient, the amount to be deducted, and
   the resulting remaining quantity.

When the app hits a conversion it does not know, `POST /api/foods/:id/conversions`
teaches it one permanently — that is the escape hatch behind every "confirm this
manually" prompt.

### Name matching

`server/src/services/matching.ts`: normalise (lowercase, strip punctuation and
accents, de-pluralise, drop size adjectives) → exact match → synonyms table →
Sørensen–Dice fuzzy match above 0.72, or no match at all. Preparation words
(*ground*, *chopped*) are deliberately **not** stripped, since they can change
the food; the fuzzy pass still links "chopped onion" to "onion".

---

## Data model

`users`, `food_reference`, `inventory_items`, `recipes`, `recipe_ingredients`,
`consumption_logs`, `shopping_list_items`, `unit_conversions` — as specified,
plus one addition and a few clarifications:

- **`food_synonyms`** (added) — the synonyms table the matching spec calls for.
- **`inventory_items` are lots, not totals.** Two cartons of eggs with different
  expiry dates are two rows, so deductions can run first-expiring-first-out.
  That directly serves goal #1 (limit waste) and is why the deduction planner
  works over a list of lots rather than a single quantity.
- **`food_reference.serving_size_grams` means "grams in one `default_unit`"**,
  not "grams in a manufacturer's serving". That is what makes it usable as a
  conversion edge.
- **`consumption_logs.inventory_item_id` is nullable** so the audit trail
  survives an inventory row being deleted (deletion detaches logs rather than
  cascading them away).
- **`consumption_logs.calories` is stored at write time** and is null when no
  conversion to the food's nutrition basis existed. Day totals count those
  entries separately rather than treating unknown as zero.
- **`inventory_removals` is a separate table from `consumption_logs`** (added).
  A roommate eating your eggs must never appear in your calorie diary, and
  keeping them apart makes that structural rather than a flag someone can forget
  to check.
- **`shelf_life`** (added) — typical days by category and storage location,
  which is what lets expiry dates fill themselves in.

---

## API

All routes except `/api/health` and `/api/auth/*` require
`Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/api/auth/login` | Accounts |
| `GET` | `/api/dashboard` | Home screen in one call |
| `GET` `POST` | `/api/inventory` | List (`?sort=expiration\|category\|name\|recent`), add by `foodReferenceId` \| `barcode` \| `name` |
| `GET` | `/api/inventory/expiring?days=3` | Expiry alerts |
| `POST` | `/api/inventory/:id/consume` | **Log consumption, decrement, write log** |
| `PATCH` `DELETE` | `/api/inventory/:id` | Correct or remove a lot |
| `GET` | `/api/recipes?q=` | Search; cookable-now ranked first |
| `GET` | `/api/recipes/:id/cook-preview` | **Exactly what will be deducted** |
| `POST` | `/api/recipes/:id/cook` | **Atomic deduct + log** |
| `GET` | `/api/foods/search?q=` | Local catalog autocomplete |
| `GET` | `/api/foods/barcode/:code` | Cache → Open Food Facts |
| `GET` `POST` | `/api/foods/usda/search`, `/api/foods/usda/import` | USDA lookup + cache |
| `POST` | `/api/foods/:id/conversions` | Teach the app a unit conversion |
| `PUT` | `/api/foods/:id/counts-as` | **Say what a branded product really is** |
| `POST` | `/api/foods/:id/counts-as/suggest` | Re-run the automatic guess |
| `POST` | `/api/inventory/:id/remove` | **Someone else ate it / used up / wasted** |
| `POST` | `/api/inventory/:id/freeze` | Move to the freezer, extend the date |
| `GET` | `/api/inventory/stale` | Reconciliation candidates |
| `GET` | `/api/recipes/almost` | One or two items away, with the gaps |
| `POST` | `/api/recipes/import` | Import a recipe from a URL into your own book |
| `GET` | `/api/recipes?mine=1` | Only the recipes you imported or wrote |
| `GET` | `/api/recipes/for-food/:foodId` | What you can make with one pantry item |
| `DELETE` | `/api/recipes/:id` | Delete a recipe you added (soft; diary survives) |
| `POST` | `/api/auth/password` | Change your own password |
| `GET` | `/api/foods/:id/pack` | Pack size, and whether it is known or guessed |
| `GET` | `/api/consumption/today`, `/api/consumption/history` | Calories, macros, meals |
| `GET` `DELETE` | `/api/consumption/:id` | Entry breakdown / **undo** |
| `POST` | `/api/consumption/eat-out` | **Log food you ate out** |
| `GET` `PATCH` | `/api/settings` | Goal, targets, ad and auto-shopping switches |
| `GET` | `/api/reports/waste` | What you binned, counted not costed |
| `GET` | `/api/reports/waste/log` | The full log of what left the pantry |
| `GET` | `/api/shopping-list/:id/uses` | What a line on the list is for |
| `GET` | `/api/shopping-list/scan/:barcode` | Scan in a shop: what can I make? |
| `GET` | `/api/planning/leftovers` | Portions in the fridge |
| `GET` | `/api/planning/run-out` | What you are about to run out of |
| `GET` | `/api/planning/digest` | The daily nudge |
| `GET` `POST` | `/api/planning/plan` | The week ahead |
| `GET` | `/api/planning/plan/shortfall` | One shop for the whole week |
| `GET` | `/api/planning/frequent` | What you keep cooking |
| `PUT` | `/api/planning/ratings/:recipeId` | Rate a recipe |
| `GET` | `/api/reports/waste/patterns` | Things you bin repeatedly |
| `GET` | `/api/reports/export` | Everything, as one file |
| `GET` | `/api/ads?slot=` | Demo ad surfaces (empty when ads are off) |
| `GET` `POST` | `/api/shopping-list` | List / add manually |
| `POST` | `/api/shopping-list/from-recipe/:id` | One-tap "add what I'm missing" |
| `POST` | `/api/shopping-list/:id/stock` | Check off **and** put in pantry |

---

## External data sources

Free tier only, as specified — no Edamam, no Nutritionix.

- **Open Food Facts** for barcode/UPC lookup of packaged products. No key, no
  practical limit.
- **USDA FoodData Central** for raw/whole ingredient nutrition.

**Everything resolved is cached into `food_reference` on first lookup**, so the
second user to scan the same box never hits the network, and the app keeps
working when either API is down. All outbound calls are timeout-bounded and
never throw: a failure returns a structured reason, and the UI offers manual
entry (`fallback: "manual_entry"`). `OFFLINE_MODE=true` turns the network off
entirely and the app remains fully usable.

---

## Tests

```bash
cd server && npm test
```

245 tests, weighted toward the risky parts:

- **`units.test.ts` (27)** — normalisation, exact mass/volume factors, round
  trips, ingredient densities, the cups-out-of-a-32-oz-bag case, the serving
  bridge, edge precedence, and every case where the engine must *refuse* to
  convert.
- **`deduction.test.ts` (10)** — FEFO ordering, multi-lot draws, shortfalls,
  exact depletion without float slivers, unconvertible lots.
- **`matching.test.ts` (10)** — pluralisation, synonyms, fuzzy thresholds, and
  refusing a bad match.
- **`patches.test.ts` (8)** — the parser against the lines that actually broke
  it (brackets the page never closed, "salt / kosher salt", a food that ended up
  named after its own footnote); pack sizes reporting *known* separately from
  *guessed*; and a substitute swap deducting the stand-in at its own ratio while
  leaving the recipe itself untouched.
- **`deployment.test.ts` (6)** — the things that only matter once this is
  reachable from the internet: changing a password actually invalidates the old
  one, needs the current password even with a valid session, and cannot touch
  another account; and a re-seed cannot delete a user's imported recipe that
  shares a name with a shipped one.
- **`ownership.test.ts` (18)** — a second account cannot see, open, cook or plan
  a recipe you imported; the shipped book stays visible to everyone; the "your
  recipes" filter excludes rather than reorders; "what can I make with this?"
  splits cookable-now from the rest using real quantities; a diet setting never
  hides your own recipes and reports what it did hide; your imports keep their
  shortlist slots in the ordinary list; and deleting one removes it from every
  route while leaving the diary entry that names it intact.
- **`flows.test.ts` (30)** — all seven original user flows end to end through the
  real HTTP stack, including the atomicity guarantee: a cook that is short one
  egg leaves butter, salt and pepper completely untouched and writes no logs.
- **`features.test.ts` (60)** — shelf-life estimation, the three removal
  reasons and their isolation from the diary, macros and meal grouping, entry
  breakdown, undo (including converting back into the lot's unit), eating out,
  settings and goal ranking, expiry-first recipe ordering, low-stock auto-add,
  cart totals, and that ads disappear entirely when switched off.
- **`parser.test.ts` (11)** — ingredient lines as they actually appear on recipe
  sites: fractions, "1 (14.5 oz) can diced tomatoes, drained", ranges, and
  schema.org durations.
- **`corpus.test.ts` (17)** — the whole recipe book, validated as described
  above, plus density inheritance for branded products.
- **`newFeatures.test.ts` (17)** — leftovers (including eating one cookie out of
  twenty-four and the calories splitting correctly), substitution ratios, run-out
  prediction refusing to guess from thin history, meal-plan shortfalls adding up
  across meals, diet filtering, and the export.
- **`canonical.test.ts` (13)** — deciding what a scanned product is, including
  the real pair that exposed the problem: an olive oil that must link, and a
  garlic sauce that must not.

Tests use their own SQLite file (`prisma/test.db`, created and seeded
automatically) and run with `OFFLINE_MODE=true`, so they never call an external
API.

---

## Assumptions and scope decisions

Flagging these rather than deciding silently:

1. **`serving_size_grams` = grams per one `default_unit`.** The spec left the
   semantics open; this reading is what lets it act as a conversion edge.
2. **Inventory rows are lots.** Adding eggs twice gives two rows rather than
   incrementing one, because merging them would lose the second expiry date.
   The UI shows them separately; recipe matching sums across them.
3. **Consumption targets a specific lot** (per spec flow 3). Consuming more than
   that lot holds returns a 409 rather than silently spilling into another lot.
   Cooking a recipe *does* draw across lots, FEFO.
4. **Depleted lots are kept at quantity 0**, not deleted, so consumption logs
   keep referring to something real. List views filter them out.
5. **Manual entries get no invented nutrition.** A food the app has never heard
   of has null calories until you supply them or a lookup resolves it, and its
   inventory shows "no nutrition data" rather than 0 kcal.
6. **The seeded pop tarts are demo data** with a placeholder barcode
   (`0000000000017`) and a "Demo Brand" label — inventing a real brand's UPC and
   nutrition panel would be fabricating a real product's data. Its box → 10
   pastries conversion matches the walkthrough in the spec. Scanning a real
   product hits Open Food Facts and caches the genuine data.
7. **Seeded nutrition figures** are rounded from USDA FoodData Central entries
   and cup→gram densities are standard baking weights. They are good enough for
   a demo, not a clinical reference.
8. **Auth is deliberately basic** — email + bcrypt + a 30-day JWT in
   localStorage. No refresh tokens, no email verification, no password reset.
   Fine for the MVP, not for launch.
9. **Recipe search is SQL `contains`**, not full-text. Fine at seed scale;
   `pg_trgm` or a search index is the obvious upgrade on Postgres.
10. **`searchLocalFoods` loads up to 1,000 catalog rows** to score in memory.
    Correct and fast at MVP scale, and the place to look first when the catalog
    grows.
11. **Calorie targets are round baselines** (1700 / 2000 / 2500 by goal), not a
    Mifflin-St Jeor calculation. The app does not ask for height, weight, age or
    activity level, and inventing a precise-looking number from data it does not
    have would be worse than an honest round one. Every target is editable.
12. **Recipes have an owner, or none at all.** The seeded book has `ownerId =
    null` and everyone sees it; anything you import or write is stamped with
    your id and is invisible to every other account — not merely deprioritised
    in search, but a 404 if another user guesses the id. Recipes imported
    *before* this existed stayed ownerless, because there is no record of who
    imported them and inventing an owner would hide someone's recipe from them.
13. **A diet tag filters suggestions, never your own library.** It is still a
    hard filter on the shipped book — a vegetarian is not shown pork because
    they happen to own the other nine ingredients — but a recipe you imported
    is not a suggestion, so it is always shown, and the number the filter did
    remove comes back with the results so a short list is never unexplained.
    This was a real bug: a `vegetarian` tag silently deleted every import from
    every list, which read as "my recipes are not saving".
14. **Deleting your recipe is soft.** The row survives with `deletedAt` set,
    because the diary points at it — a meal cooked in March is grouped under
    this recipe's name, and a hard delete would scatter it back into loose
    ingredients months later. It disappears from every list, lookup, cook and
    plan; meal-plan entries pointing at it are removed outright.
15. **Imported recipes create catalog entries for ingredients that do not match**
    anything known, and the response lists them so they can be reviewed. The
    alternative — refusing the import — loses the recipe over one odd ingredient.
16. **Recipe import reads schema.org structured data only.** No scraping of page
    layout. A successful import opens the recipe straight away rather than
    dropping you back in a list — you fetched it to read it.

## Deploying

Two routes, both free — see [deploy/README.md](deploy/README.md).

**[Render + Neon](deploy/render.md)** needs no credit card. `render.yaml` in the
project root is a complete Blueprint: push to GitHub, paste one connection
string, done. It moves the database to Postgres, which is handled — see the
schema note below.

**[Oracle Cloud](deploy/oracle.md)** wants a card for identity verification but
never sleeps and keeps SQLite exactly as it is. `deploy/setup.sh` provisions the
VM, including the trap that catches everyone: opening ports in Oracle's Security
List is necessary and not sufficient, because the Ubuntu image blocks them again
in its own iptables.

Both give HTTPS, which is not optional — the barcode scanner uses
`navigator.mediaDevices`, and on an insecure origin that does not exist.

### The Postgres switch

The schema was written Postgres-shaped from the start, and it held up: no raw
SQL, no SQLite-only constructs, enum-shaped columns stored as plain strings.

`prisma/schema.prisma` stays SQLite so local development and the tests are
unchanged; `scripts/pg-schema.mjs` generates the Postgres copy from it, so the
two cannot drift. One behaviour genuinely differs — Postgres matches `LIKE`
case-sensitively — so recipe search passes `mode: 'insensitive'` when
`DATABASE_PROVIDER=postgresql`. Verified against a real Postgres: without it,
searching "CARBONARA" returns nothing.

## Still not built

- **Fitness tracking** — steps, exercise, calories burned
- **Dietician-style personalised guidance** beyond the goal-based ranking
- **A recommendation engine** over consumption history, and one-tap "cook this
  again" repeats. `consumption_logs` is already the history both would read from
- **A genuinely shared household pantry** — multiple accounts on one inventory.
  The removal actions cover living with people; this would cover *sharing* with
  them. Deliberately not attempted yet: it changes the ownership assumption in
  every query in the app, and a half-done version that leaks or loses another
  person's food is worse than not having it
- **Real background push.** The daily nudge fires when the app is opened. Pushing
  it when the app is *closed* needs a push service and VAPID keys on the server —
  the service worker is already listening for it
- **A catalog at national-database scale** — bulk USDA and Open Food Facts
  ingest would take the catalog from 203 foods to hundreds of thousands. The
  226-recipe book covers common home cooking; going to tens of thousands of
  recipes means either a licensed API or bulk ingest, and both need an
  ingredient-matching review queue for the unmatched tail
- **Offline-first PWA** — supermarkets have bad signal, and checking counts in
  an aisle is a core use case
