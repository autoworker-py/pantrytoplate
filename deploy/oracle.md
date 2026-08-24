# Deploying to Oracle Cloud Always Free

> **Requires a credit card** for identity verification. Always Free resources
> are genuinely not charged, but if you would rather not hand over a card, use
> [render.md](render.md) instead — no card, at the cost of moving to Postgres.

Everything here targets one goal: the app keeps working when your Mac is shut.

The pieces are an Oracle VM that never sleeps, a free DuckDNS hostname, and
Caddy for HTTPS. SQLite comes along unchanged — there is **no database
migration**, which is the main reason this path is less work than it looks.

Budget about an hour, most of it waiting on Oracle's console.

---

## Why each piece is here

**A hostname, not just an IP.** Oracle gives you a bare address like
`129.153.4.11`. Browsers treat that as an insecure origin, and on an insecure
origin `navigator.mediaDevices` is not blocked — it does not exist. Your barcode
scanner would be dead on arrival. Certificates cannot be issued for bare IPs, so
you need a name. DuckDNS gives you one free.

**Caddy.** Gets and renews the certificate on its own. No cron job to forget.

**systemd.** Restarts the app after a crash and after a reboot. Without it the
first power blip takes you back to a dead URL.

---

## 1. Oracle account

<https://signup.cloud.oracle.com>

Oracle asks for a card to verify identity. Always Free resources are not
charged, but the account is real — pick your home region carefully, because
**it cannot be changed afterwards** and Always Free capacity is per-region.

After signup, make sure the account is **not** left in the trial state with
"Upgrade to Paid" pending in a way that expires your resources — Always Free
resources survive trial expiry, paid ones do not.

## 2. Create the VM

Compute → Instances → **Create instance**.

| Setting | Value |
|---|---|
| Image | Ubuntu 24.04 (or 22.04) |
| Shape | **VM.Standard.A1.Flex**, 4 OCPU / 24 GB |
| Boot volume | Default (47 GB) is plenty — the whole app is under 5 MB |
| SSH keys | Paste your public key |

The shape must say **"Always Free eligible"**. If it does not, you are about to
be charged.

Get your public key with:

```bash
cat ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C pantry
```

**If you get "Out of host capacity"** — that is the ARM shape being popular, not
a mistake on your part. Try a different Availability Domain in the dropdown, or
retry later; it frees up. Failing that, the AMD `VM.Standard.E2.1.Micro` is also
Always Free, but with 1 GB of RAM the build needs the swap that `setup.sh` adds.

Note the **public IP** when it finishes provisioning.

## 3. Open the ports in the console

Networking → Virtual Cloud Networks → your VCN → Subnets → your subnet →
Security Lists → Default Security List → **Add Ingress Rules**:

| Source | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

This is necessary and **not sufficient** — Oracle's Ubuntu image also blocks
those ports in its own iptables. `setup.sh` fixes that side. If you have ever
opened ports on Oracle and watched them time out anyway, this is why.

## 4. Free hostname

<https://www.duckdns.org> — sign in with GitHub or Google, pick a subdomain,
and set its IP to your VM's public IP.

You get something like `connor-pantry.duckdns.org`. Free, no expiry, and
Let's Encrypt will issue for it.

## 5. Get the code onto the VM

From your Mac. Either works; git makes later updates one command.

**With rsync** (nothing else to set up):

```bash
rsync -avz --exclude node_modules --exclude dist --exclude '*.db' ~/pantry-to-plate/ ubuntu@YOUR_IP:/tmp/pantry/ && ssh ubuntu@YOUR_IP 'sudo mkdir -p /opt/pantry && sudo cp -r /tmp/pantry/. /opt/pantry/'
```

**With git** (recommended — `update.sh` then pulls for you). Create a private
repo, push to it, then on the VM:

```bash
sudo git clone YOUR_REPO_URL /opt/pantry
```

Do not commit `server/.env`. The `.gitignore` already excludes it, and the
production secrets live in `/etc/pantry.env` instead.

## 6. Provision and deploy

SSH in, then:

```bash
sudo bash /opt/pantry/deploy/setup.sh connor-pantry.duckdns.org
```

Installs Node, Caddy and swap, fixes the iptables trap, creates the service
account, and generates a real `JWT_SECRET` into `/etc/pantry.env`. Safe to
re-run.

Then build and start:

```bash
sudo bash /opt/pantry/deploy/update.sh --seed
```

`--seed` loads the 226 recipes and 278 foods. You only need it the first time,
and later when recipes change — it refreshes the shipped book and leaves every
account's pantry and diary untouched.

Open `https://connor-pantry.duckdns.org`. That URL is now permanent.

## 7. Bring your existing pantry with you (optional)

This is the payoff for staying on SQLite: your data is one file, and the schema
on the VM is identical. Nothing to convert.

From your Mac, with the server stopped on the VM:

```bash
ssh ubuntu@YOUR_IP 'sudo systemctl stop pantry'
```

```bash
scp ~/pantry-to-plate/server/prisma/dev.db ubuntu@YOUR_IP:/tmp/pantry.db
```

```bash
ssh ubuntu@YOUR_IP 'sudo mv /tmp/pantry.db /var/lib/pantry/pantry.db && sudo chown pantry:pantry /var/lib/pantry/pantry.db && sudo -u pantry bash -c "cd /opt/pantry/server && npx prisma migrate deploy" && sudo systemctl start pantry'
```

Your accounts, pantry, diary, shopping list and imported recipes all come
across. Skip `--seed` afterwards — the book is already in the file.

### Then change your password, straight away

You have been using `demo@pantry.local`, whose password is **printed in this
project's README**. On a laptop behind your front door that is fine. On a public
URL it means anyone who reads the repo can sign in and read your food.

Settings → Account → **Change password**, first thing after the data lands.

---

## Afterwards

**Deploying a change:**

```bash
sudo bash /opt/pantry/deploy/update.sh
```

Backs up the database first, rebuilds, migrates, restarts, and fails loudly with
logs if the service does not come back.

**Logs:**

```bash
sudo journalctl -u pantry -f
```

**Backups** land in `/var/lib/pantry/backups`, last 10 kept. They are on the
same disk, so they protect you from a bad deploy, not from losing the VM. To
pull one down:

```bash
scp ubuntu@YOUR_IP:/var/lib/pantry/backups/pantry-*.db ~/pantry-backups/
```

**A real USDA key** — `DEMO_KEY` is limited to about 30 lookups an hour across
everyone sharing your IP. Free key at
<https://fdc.nal.usda.gov/api-key-signup.html>, then edit `/etc/pantry.env` and
`sudo systemctl restart pantry`.

## Worth knowing

**Registration is open.** Anyone who finds the URL can create an account. They
cannot see your pantry or your recipes — that is enforced per-user and tested —
but they can make accounts on your server. If that matters, ask and I will add
an invite code.

**Your six legacy imported recipes have no owner**, so every account on the
server sees them, and a re-seed can delete one that shares a name with a shipped
recipe. To claim them for your account before you deploy:

```bash
sqlite3 ~/pantry-to-plate/server/prisma/dev.db "update Recipe set ownerId=(select id from User where email='demo@pantry.local') where source='imported' and ownerId is null;"
```

**Do not delete `/etc/pantry.env`.** Regenerating `JWT_SECRET` signs out every
device. Not fatal, just annoying.

**The database is at `/var/lib/pantry/pantry.db`**, deliberately outside
`/opt/pantry` so that deleting and re-cloning the app directory cannot take your
food with it.
