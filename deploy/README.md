# Deploying

Two routes, depending on one question: are you willing to give a cloud provider
a card number?

| | [Render + Neon](render.md) | [Oracle Cloud](oracle.md) |
|---|---|---|
| Card needed | **No** | Yes (verification only, not charged) |
| Cost | $0 | $0 |
| Database | Postgres (Neon) | SQLite, unchanged |
| Always on | Sleeps after 15 min; keep-alive fixes it | Yes |
| Setup | Push to GitHub, click deploy | Provision a VM yourself |

**Start with [render.md](render.md).** It needs no card, and the Postgres move
is already done — the schema generates itself from the same source, and the one
behaviour that actually differs between the two databases is handled and tested.

Both give you HTTPS, which is not optional: the barcode scanner uses
`navigator.mediaDevices`, and on an insecure origin that is not blocked, it does
not exist.

## Files here

| File | What it is |
|---|---|
| `render.md` | Render + Neon runbook (no card) |
| `oracle.md` | Oracle VM runbook (card required) |
| `setup.sh` | One-time VM provisioning — Oracle only |
| `update.sh` | Build, migrate, restart — Oracle only |
| `pantry.service` | systemd unit — Oracle only |
| `Caddyfile` | HTTPS reverse proxy — Oracle only |

The Render path uses `render.yaml` in the project root instead; it needs none of
the scripts.
