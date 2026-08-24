# Deploying to Render + Neon

No credit card, at either end. About 30 minutes.

Render runs the app; Neon holds the database. They are separate because Render's
own free Postgres is **deleted after 30 days**, which is a bad way to discover
how your backups are doing. Neon's free tier does not expire.

---

## What changes, and what does not

Your app moves from SQLite to Postgres. Nothing on a card-free host has a
persistent disk, so a SQLite file would be wiped on every deploy.

This is already done and tested:

- **One schema, still.** `prisma/schema.prisma` stays SQLite so local
  development and the test suite are unchanged. `scripts/pg-schema.mjs`
  generates the Postgres copy from it at build time — the only difference
  between the two files is the provider line, so they cannot drift.
- **The one real behavioural difference is handled.** Postgres matches `LIKE`
  case-sensitively and SQLite does not. Without a fix, searching "CARBONARA"
  returns nothing on Postgres while working perfectly on your laptop. That is
  verified against a real Postgres, not assumed, and is why `DATABASE_PROVIDER`
  must be set — see step 4.

## 1. Push to GitHub

Render deploys from a repo. Free, no card.

```bash
cd ~/pantry-to-plate && git init && git add -A && git commit -m "Pantry to Plate"
```

Create an **empty private repo** on github.com, then:

```bash
git remote add origin YOUR_REPO_URL && git branch -M main && git push -u origin main
```

`.gitignore` already excludes `server/.env`, the local database, and the
generated Postgres schema. Nothing secret goes up.

## 2. Neon database

<https://neon.tech> — sign in with GitHub. Create a project.

Copy the **pooled** connection string. It looks like:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Use the pooled host (`-pooler`) and keep `?sslmode=require`. A free Render
instance restarts often, and unpooled connections pile up until Neon refuses
new ones.

## 3. Render service

<https://render.com> — sign in with GitHub, then **New → Blueprint**, and point
it at your repo. It reads `render.yaml` and fills in the build command, start
command, health check and environment.

Choose the **Free** instance type.

## 4. One environment variable

Render will ask for `DATABASE_URL` — it is the only one marked `sync: false`,
because a connection string does not belong in a repo. Paste the Neon string
from step 2.

Everything else comes from `render.yaml`, including `JWT_SECRET`, which Render
generates once and keeps. Do not regenerate it later; that signs out every
device.

`DATABASE_PROVIDER=postgresql` is set there too. **Do not remove it.** That is
the line that makes search work.

## 5. Deploy

The first build takes 3-5 minutes: it installs both halves, generates the
Postgres schema, pushes it to Neon, seeds 226 recipes and 207 foods, and builds
the frontend.

Seeding runs on **every** deploy, and that is safe: shipped recipes are updated
in place rather than deleted and recreated, so the row keeps its id and the
ratings and meal-plan entries pointing at it survive. Recipes you imported are
never touched. This is what lets a recipe added on a laptop reach the live site
just by pushing.

Your app is at `https://pantry-to-plate.onrender.com`. That URL is permanent.

## 6. Stop it falling asleep

**Do this, or the app is unpleasant to use.** Free instances spin down after 15
minutes idle and take ~50 seconds to wake — a long time to stand in a kitchen
holding a jar.

Sign up at <https://uptimerobot.com> (free, no card), add an **HTTP(s)** monitor:

- URL: `https://YOUR-APP.onrender.com/api/health`
- Interval: **10 minutes**

One service kept awake around the clock is ~744 hours a month, inside the 750
free hours. It also emails you when the app actually breaks.

---

## Afterwards

## Updating the site afterwards

```bash
git push
```

That is the whole workflow. Render watches `main`, rebuilds, and swaps the new
version in — usually 3-5 minutes. It covers code, frontend and recipes alike:
the build re-seeds, so recipes added or edited in `server/prisma/data/recipes/`
appear on the live site without touching the database by hand.

**Nothing you have on the site is lost in a deploy.** Verified against a real
Postgres: after a redeploy, ratings, meal plans, imported recipes, pantry and
diary were all still there.

**A schema change that would drop data fails the build on purpose.** `db push`
runs without `--accept-data-loss`, so if a change would delete a column, the
deploy stops rather than quietly destroying the column on your live database.
Render keeps the previous version serving when a build fails, so the site stays
up while it is sorted out.

**Watch the first minute of a deploy** in Render's Logs tab. A failed build
leaves the old version running, so a broken push is an inconvenience rather than
an outage.

**Logs:** the Logs tab in the Render dashboard.

**Your existing pantry does not come across.** SQLite and Postgres are different
file formats, so unlike the Oracle route there is no file to copy — you start
with a fresh account. If you want the data moved, ask and I will write the
export/import.

**Backups.** Neon keeps point-in-time history on the free tier, but export
occasionally anyway:

```bash
pg_dump "YOUR_NEON_URL" > pantry-$(date +%F).sql
```

**A real USDA key** — `DEMO_KEY` allows about 30 lookups an hour across everyone
sharing an IP. Free key at <https://fdc.nal.usda.gov/api-key-signup.html>, then
add `USDA_API_KEY` in Render's Environment tab.

## Worth knowing

**Registration is open.** Anyone with the URL can create an account. They cannot
see your pantry or recipes — that is enforced per-user and tested — but they can
make accounts. Ask and I will add an invite code.

**Change your password once you are in.** Settings → Account. Especially if you
ever import the demo account, whose password is printed in the project README.

**Free tiers change.** This was accurate when written; check current terms before
relying on either service.
