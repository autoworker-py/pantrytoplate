# Look 3 — Chipotle red (Aug–Sep 2026)

The look in place immediately before the Shelf Edge redesign, and the one to
restore if Shelf Edge is rejected. Cream ground (`#f0ede8`), white rounded
cards, brand red `#a81712`, a text-only tab bar, all-caps section headings.

This is a **complete copy of the front end's visual layer**: every page and
component as they stood, plus the stylesheet, the shell and index.html. The
backend is untouched by any redesign, so restoring is a file copy, nothing more.

## Restore

```bash
cd ~/pantry-to-plate
cp backup/look-3-chipotle-red/styles.css  web/src/styles.css
cp backup/look-3-chipotle-red/App.tsx     web/src/App.tsx
cp backup/look-3-chipotle-red/index.html  web/index.html
cp -R backup/look-3-chipotle-red/pages/.      web/src/pages/
cp -R backup/look-3-chipotle-red/components/. web/src/components/
cd web && npm run build && npx cap sync ios
```

Or take the whole tree back with `git checkout design-3-chipotle-red -- web/src web/index.html`.

Newer pages added after this snapshot are not in it; restoring replaces only
what existed here, so check `git status` afterwards rather than assuming.
