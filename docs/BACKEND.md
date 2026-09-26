# How the backend works

Written for someone building a new front end against it. `docs/API.md` is the
**contract** — every response shape in it was captured from a live server, so it
is right by construction. This file is the **why**: the mechanisms behind those
shapes, and the rules a client has to respect to avoid corrupting a pantry.

If you read one thing first, read "Five things the front end must not do" at the
bottom.

---

## 1. The shape of it

```
server/
  src/
    app.ts            Fastify app: CORS, JWT, error handler, route mounting
    env.ts            every environment variable, with defaults
    db.ts             the Prisma client, and the `Tx` type services accept
    routes/           HTTP only — parse, authorise, delegate, serialise
    services/         all the logic. No HTTP types in here.
    external/         USDA and Open Food Facts clients
    content/privacy.ts  the privacy notice and its version
  prisma/
    schema.prisma     14 models
    data/             the shipped catalogue: foods, substitutions, recipes
    seed.ts           idempotent; safe to re-run against a live database
```

**Stack:** Fastify 5 + TypeScript + Prisma 6. SQLite in development and tests,
PostgreSQL in production. React/Vite lives in `web/` and imports *nothing* from
`server/` — the two halves share only the HTTP contract, and that is worth
keeping.

**Run it:**

```bash
cd server && npm install && cp .env.example .env && npx prisma migrate dev && npm run seed && npm run dev
```

Port 4000. The Vite dev server proxies `/api` to it, so there is no CORS to
configure locally. Seeded demo account: `demo@pantry.local` / `pantrydemo`.

---

## 2. The one idea, and what it forces

**You enter a food once.** Everything after that — eating it, cooking with it,
binning it — is a lookup and a decrement against inventory the app already has.

That single rule is why the backend is shaped the way it is. If cooking has to
decrement real inventory, then the server must be able to answer "how much of
this do I have, expressed in the unit this recipe asked for?" for arbitrary
pairs of units and arbitrary products. Everything in section 4 exists to make
that question answerable — or to refuse it honestly when it is not.

---

## 3. Auth and session

- `POST /api/auth/register` and `POST /api/auth/login` return
  `{ token, user }`. The token is a JWT, **30-day expiry**.
- Everything else wants `Authorization: Bearer <token>`. The exceptions are
  `/api/health`, `register`, `login` and `GET /api/auth/privacy`.
- `GET /api/auth/me` returns the current user plus two gates the client must
  honour: `onboarded` and `privacyCurrent`.
- Registration requires `acceptPrivacyVersion` matching the current
  `PRIVACY_VERSION`. If the notice is revised, existing users come back with
  `privacyCurrent: false` and must re-accept via `POST /api/auth/privacy/accept`
  before the app is usable. This is deliberate: the app holds health data.
- `POST /api/auth/delete-account` is a real cascade. Nothing is kept.

**Error shape, everywhere:**

```json
{ "error": "machine_code", "message": "Written to be shown to a person.", "details": {} }
```

`message` is already user-facing prose. Show it as-is; do not wrap it in your
own "Something went wrong."

---

## 4. The five mechanisms

### 4.1 Unit conversion is a graph with a trust cost

`services/units.ts`. Units are nodes, conversions are weighted edges, and
`convert()` runs Dijkstra over them, minimising **trust cost** rather than hops.

The ordering of trust: an ingredient's own density (this flour weighs 127 g per
cup) beats a universal factor (1 cup = 236.6 ml) beats a serving-size bridge
(one "serving" of this product is 30 g).

When no acceptable path exists, it returns `{ ok: false }` and the caller
surfaces that. **It never guesses.** A wrong number in a pantry compounds
silently — you would never find out.

That refusal has a name in the API: the ingredient status `unknown_conversion`.

### 4.2 Canonical linking: "counts as"

A scanned bottle of `ORGANIC EXTRA VIRGIN OLIVE OIL` is its own catalogue row,
with its own barcode. A recipe asks for `Olive Oil`. Without a link between
them, the app tells you that you are missing an ingredient you are holding.

`FoodReference.canonicalId` is that link, inferred with a head-noun rule plus a
calorie-density sanity check, and recorded with `canonicalSource: 'auto' |
'user'`. The guess is always shown and always correctable:

- `PUT /api/foods/:id/counts-as` with `{ canonicalId }` (or `null`)
- `POST /api/foods/:id/counts-as/suggest` asks the server for candidates

Recipe matching and deduction both resolve through `canonicalId`.

### 4.3 FEFO deduction

`services/deduction.ts`. `planDeduction()` takes the lots you own for one
ingredient and the amount a recipe wants, and returns a plan that draws from
the **soonest-expiring lot first**, spilling into later lots as needed. Undated
lots go last.

The plan's status is one of four, and the difference matters:

| status | means |
|---|---|
| `ok` | you have enough, here is exactly what will be taken |
| `short` | you have some, this much is missing |
| `missing` | you have none |
| `unknown_conversion` | you own some, but the engine will not guess the conversion |

`unknown_conversion` is **not** a failure — do not render it as one. It means
"we decline to guess", and the UI should offer the correction.

Lots too small to be stock (a 0.00025-gallon remainder left by a conversion) are
ignored by the planner and hidden by the pantry list, so the two never disagree.

### 4.4 Cooking is previewed, then atomic

Two endpoints, and the first is not optional:

- `GET /api/recipes/:id/cook-preview` — exactly what will be deducted, before
  anything changes.
- `POST /api/recipes/:id/cook` — does all of it, or none of it.

The whole cook runs inside one interactive transaction, and the deduction plan
is recomputed **inside** that transaction, so a concurrent change between
preview and confirm cannot overdraw a lot. Each write is a guarded relative
decrement (`quantity: { decrement: n }` with a `gte` guard), not an absolute
write, so two simultaneous cooks compose instead of overwriting each other. If
the guard fails, the entire cook rolls back rather than deducting half a recipe.

`POST /cook` body:

```jsonc
{
  "servings": 2,                    // scale the recipe
  "mealSlot": "dinner",             // breakfast | lunch | dinner | snack
  "choices": { "<foodId>": "<lotId>" },   // you have two jars open; use this one
  "exclude": ["<foodId>"],          // leave this out of tonight's cook
  "swaps":   { "<foodId>": "<substituteFoodId>" },  // stand-in, this cook only
  "keepServings": 1                 // portions into the fridge as leftovers
}
```

Every one of those is **per-cook and deliberately forgotten**. Using oil tonight
because the butter ran out is a decision about tonight, not about the recipe.

Leftovers become ordinary inventory measured in servings, so expiry,
consumption, waste and calories all work on them with no special cases.

### 4.5 Recipe ranking is two-stage

`services/recipeMatch.ts`. Evaluating 276 recipes against a pantry on every
request would be too slow, so:

1. A cheap SQL shortlist (60 candidates, with reserved slots: 24 for near-misses
   and 20 for the user's own recipes, so your imports never get crowded out).
2. Full evaluation of the shortlist — per-ingredient status, conversions,
   nutrition, and the ranking weights.

Ranking favours recipes that use food about to expire. Every recipe comes back
with `reasons: string[]` explaining why it is where it is; show them, they are
the difference between a list and a recommendation.

**Visibility:** recipes are either shipped (`ownerId: null`) or yours. An
imported recipe is private to the importer. Deletion is soft (`deletedAt`),
because the diary names past meals through the recipe row.

---

## 5. The food catalogue

- **447 foods, 655 searchable terms** (names plus synonyms), 211 substitution
  rules, 276 recipes. All seeded from `prisma/data/`.
- `GET /api/foods/search?q=` — the local catalogue, scoped to what you can see.
- `GET /api/foods/search/external?q=` — Open Food Facts full-text. Free, no key,
  millions of products. Each hit carries a **barcode**, so selecting one goes
  through the same resolver as scanning: `GET /api/foods/barcode/:code`.
- **USDA is configured but dead** — the key in `.env` returns
  `API_KEY_INVALID`. A free replacement key would revive
  `/api/foods/usda/search`; nothing depends on it.

**Food ownership:** `FoodReference.ownerId` is null for the shipped catalogue
and for barcode lookups (facts about products). A food someone types by hand
belongs to them and appears only in their search.

**Substitutions:** `GET /api/recipes/:id` attaches `substitutes` to any
ingredient that is not `ok`, listing only stand-ins the user actually owns, each
with a ratio and a note saying what changes. Suggestions only — swapping one fat
for another changes a dish, and that is the cook's call.

---

## 6. The endpoints, grouped by what you would build

Mount prefixes are in `app.ts`. **Note the one that does not match its
filename:** shopping routes live at `/api/shopping-list`.

**Opening the app**
`GET /api/health` · `GET /api/auth/me` · `GET /api/dashboard` (one call, the
whole home screen) · `GET /api/settings`

**The pantry**
`GET /api/inventory` (`?sort=expiration|category|name|recent`, `?search=`,
`?includeDepleted=true`) · `GET /api/inventory/expiring` ·
`GET /api/inventory/stale` · `POST /api/inventory` · `PATCH|DELETE
/api/inventory/:id` · `POST /api/inventory/:id/consume` (you ate it — logs
calories) · `POST /api/inventory/:id/remove` (it went, or someone else had it —
no calories) · `POST /api/inventory/:id/freeze`

Those last two being separate is the point: eating and losing are different
events and only one touches your diary.

**Adding food**
`GET /api/foods/search` · `GET /api/foods/search/external` ·
`GET /api/foods/barcode/:code` · `POST /api/foods` · `GET /api/foods/:id/pack`
(what a pack of this usually weighs) · `GET /api/foods/units`

**Recipes**
`GET /api/recipes` (`?q=`, `?limit=`, `?maxMinutes=`, `?maxCalories=`, `?maxGaps=`,
`?tag=`, `?mine=`) · `GET /api/recipes/almost` ·
`GET /api/recipes/:id` (`?servings=`, `?choices=`, `?exclude=`, `?swap=`) ·
`GET /api/recipes/:id/cook-preview` · `POST /api/recipes/:id/cook` ·
`GET /api/recipes/for-food/:foodId` (what can I make with this?) ·
`POST /api/recipes/import/preview` → `POST /api/recipes/import` ·
`POST /api/recipes` · `DELETE /api/recipes/:id`

**Diary**
`GET /api/consumption/today` · `GET /api/consumption/history` ·
`DELETE /api/consumption/:id` · `POST /api/consumption/eat-out` plus its
`/recent` and `/search`

**Shopping** (remember: `/api/shopping-list`)
`GET|POST /api/shopping-list` · `POST /api/shopping-list/from-recipe/:recipeId` ·
`POST /api/shopping-list/:id/stock` (bought it — moves it into the pantry) ·
`GET /api/shopping-list/:id/uses` · `GET /api/shopping-list/scan/:barcode` ·
`DELETE /api/shopping-list/checked`

**Planning and reports**
`GET|POST /api/planning/plan` · `GET /api/planning/plan/shortfall` ·
`GET /api/planning/digest` · `GET /api/planning/leftovers` ·
`GET /api/planning/run-out` · `PUT /api/planning/ratings/:recipeId` ·
`GET /api/reports/waste` · `GET /api/reports/waste/patterns` ·
`GET /api/reports/export`

**Onboarding**
`POST /api/auth/onboarding` (height, weight, activity, goal) ·
`POST /api/auth/energy/preview` (see the target before committing). Targets come
from Mifflin-St Jeor × activity, with floors (1500 kcal male, 1200 female, 1350
unspecified) and a 1 kg/week cap. Change weight or goal later and the target
recalculates — unless an explicit `dailyCalorieTarget` was set, which always
wins.

---

## 7. Five things the front end must not do

1. **Never add two amounts together.** Every amount is a `{ quantity, unit }`
   pair. The server converts; it is the only thing that may. A client that sums
   `2 cups` and `100 g` has invented a number.

2. **Never render `unknown_conversion` as an error.** It means the engine
   declined to guess. Say so, and offer the fix.

3. **Never deduct without showing the preview first.** `cook-preview` exists so
   the user can see exactly what is about to change about their food, and stop
   it. That is a product principle, not a nicety.

4. **Never treat a failed request as a logged-out user.** Only a real `401`
   means the token is bad. Being offline is not being logged out — this was a
   real bug: one moment without signal discarded a valid session.

5. **Never send a bare `YYYY-MM-DD` expecting UTC.** Dates are local calendar
   days and a bare date string is read as local noon. Read as UTC midnight, it
   put diary entries on the wrong day after 5pm. Also a real bug.

---

## 8. Things that will bite you

- **`/api/shopping-list`**, not `/api/shopping`, despite the filename.
- **Postgres `LIKE` is case-sensitive** and SQLite's is not. Search paths use
  `mode: 'insensitive'` gated on `DATABASE_PROVIDER`. If you add a search, do
  the same, and test against Postgres — `CARBONARA` returning nothing was a real
  production bug.
- **The seed is idempotent and safe to re-run**, but `SEED_DEMO_USER=false`
  guards the demo reset. Without that guard it will wipe a real account's pantry.
- **Recipe deletion is soft.** Filter `deletedAt: null` in anything you write.
- **`OFFLINE_MODE=true`** disables every external lookup. Tests run with it on,
  so no test ever touches the network.
- **Diet tags filter suggestions but exempt your own recipes.** A user's imports
  were silently vanishing from every list because one diet tag filtered them out.
  The API reports `dietHidden` so you can tell them what was hidden and why.

---

## 9. Tests

`cd server && npm test` — **330 tests**, run against a real seeded SQLite
database through the HTTP layer, not mocks. `web/` has 35.

The ones worth reading before you touch anything, because they encode decisions
rather than behaviour:

- `tests/units.test.ts` — the conversion engine, exhaustively
- `tests/deduction.test.ts` — FEFO, shortfalls, unconvertible lots
- `tests/integrity.test.ts` — the pantry ledger cannot be overdrawn, including
  two simultaneous cooks racing for the last portion
- `tests/ownership.test.ts`, `tests/foodOwnership.test.ts` — account isolation
- `tests/substitution.test.ts` — the swap path end to end
