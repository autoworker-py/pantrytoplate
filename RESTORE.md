# Pantry2Plate — full project backup

Taken 2026-09-26 from `~/pantry-to-plate`, at commit `3622995`.

This is the **whole project**: source, git history with every design tag, the
shipped catalogue and recipes, the iOS app project, the docs, and the local
databases. `node_modules` is deliberately excluded — it is 472 MB, it is
reinstallable in a minute, and it would have made this archive twenty times
larger for nothing.

## ⚠️ This archive contains live credentials

`server/.env` holds a real JWT signing secret, a live Neon PostgreSQL
connection string **including its password**, and API keys.

Keep this archive on a drive you control. **Strip that one file before sending
it to anyone, uploading it, or putting it in a shared folder.** Everything else
in here is safe to share.

```bash
zip -d pantry-to-plate-backup-2026-09-26.zip 'pantry-to-plate/server/.env'
```

## Restore

```bash
unzip pantry-to-plate-backup-2026-09-26.zip -d ~/
cd ~/pantry-to-plate

cd server && npm install && npx prisma generate
cd ../web && npm install
```

Then, in two terminals:

```bash
cd server && npm run dev     # API on :4000
cd web    && npm run dev     # app on :5173
```

Sign in with the seeded demo account: `demo@pantry.local` / `pantrydemo`.

To rebuild the database from scratch instead of using the included one:

```bash
cd server && npm run reset   # drop, migrate, re-seed
```

## What is in here

| Path | What it is |
|---|---|
| `server/` | Fastify + Prisma API. All the logic lives in `src/services/`. |
| `web/` | React + Vite front end, and the Capacitor iOS app under `web/ios/`. |
| `docs/API.md` | The HTTP contract, generated from live responses. |
| `docs/BACKEND.md` | How the backend works, and the rules a client must respect. |
| `PRODUCT.md` | Durable product truth. Note: its counts are stale. |
| `backup/` | Previous visual designs, each restorable. |
| `server/prisma/dev.db` | Your local development database, as it stood. |
| `.git/` | 25 commits and 5 design tags. |

## The design tags

Every previous look is recoverable:

```bash
git checkout design-3-chipotle-red -- web/src web/index.html   # the last coherent look
git checkout design-2-impeccable-kraft -- web/src
git checkout design-1-navy-green -- web/src
```

`backup/look-3-chipotle-red/README.md` has the plain file-copy route as well.

## State of play at the time of this backup

- **Backend: finished and healthy.** 330 tests passing, deployed on Render.
- **Front end: mid-redesign.** The "Shelf Edge" direction was in progress —
  Pantry and Recipes converted, Diary/Shopping/Settings only partly swept.
- Its finish review returned **`recapture`**, not a pass: one of three review
  screenshots was the wrong screen, so part of that review never ran. Do not
  treat the redesign as verified.
- `backup/look-3-chipotle-red/` is the last look that was complete and checked.
