# Raspberry Pi sync setup

This project's Garmin sync runs on a home Raspberry Pi rather than on Render.

**Why:** Garmin rate-limits its OAuth2 token-exchange endpoint
(`connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0`) by IP and
throttles datacenter ranges. Running the sync from Render (a Frankfurt cloud IP)
returns intermittent `429 Too Many Requests`. Running it from the Pi's
residential IP avoids the throttling entirely. The Render backend, the Vercel
frontend, and the Supabase database are all unchanged — only the Garmin *fetch*
moved to the Pi.

This document is a from-scratch rebuild guide (e.g. if the SD card dies) plus
day-to-day operations. Everything below assumes the current hardware:

- Raspberry Pi 3B+
- Hostname `benpi` (reachable as `benpi.local` on the LAN via mDNS)
- User `benw`

---

## Architecture

```
Any computer ── "Sync" button ──▶ Render API ── stamps sync_requested_at
                                              └─ NOTIFY garmin_sync ─┐
                                                                     ▼
Raspberry Pi (home IP)  sync_daemon.py  ──LISTEN garmin_sync──────────
   • wakes on NOTIFY (instant on-demand sync)                          │
   • 15s safety-net poll of sync_requested_at (covers a missed NOTIFY) │
   • hourly periodic sync                                              │
   • writes pi_heartbeat_at every ~15s (drives the UI online dot)      │
        │                                                             │
        ├── fetches activities from Garmin (residential IP, no 429) ──┘
        └── writes workouts + sync_status ──▶ Supabase (session pooler :5432)
```

Key constraint: `LISTEN/NOTIFY` requires a **session-mode** Postgres connection.
`DATABASE_URL` must be the Supabase **session pooler on port 5432**, not the
transaction pooler (6543), or the daemon won't receive notifications (it would
still work via the 15s safety-net poll, just not instantly).

---

## Rebuild from scratch

### 1. Flash the OS

Use **Raspberry Pi Imager** on a Mac/PC:

- OS: **Raspberry Pi OS Lite (64-bit)** (headless; 64-bit so Python wheels
  install without compiling).
- In the Imager's **Edit Settings** before writing:
  - **General:** set hostname `benpi`; set username `benw` + a password (record
    it); configure your Wi-Fi SSID/password + wireless country; set locale.
  - **Services:** enable **SSH** → **Use password authentication**.

Boot the Pi, wait ~60–90s for it to join Wi-Fi.

### 2. Connect

```
ping -c3 benpi.local
ssh benw@benpi.local
```

### 3. Install system dependencies

```
sudo apt update && sudo apt install -y python3-venv python3-pip
mkdir -p ~/training-sync
```

### 4. Copy the app files onto the Pi

From the repo's `backend/` directory on your Mac (residential IP matters here):

```
cd /path/to/training-calendar/backend
scp database.py sync_garmin.py sync_daemon.py .env benw@benpi.local:~/training-sync/
```

`.env` must contain (same values Render uses — copy from the Render dashboard):

```
GARMIN_EMAIL=...
GARMIN_PASSWORD=...
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres   # session pooler, port 5432
```

Lock the secrets file down:

```
chmod 600 ~/training-sync/.env
```

### 5. Python environment

```
cd ~/training-sync
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install garminconnect==0.2.8 psycopg2-binary python-dotenv
```

`garminconnect` is pinned to `0.2.8` to match Render, so the cached session
token format stored in the DB stays compatible.

### 6. One-off sync (proves it works)

```
venv/bin/python sync_garmin.py
```

Expect `Garmin returned N activities … Done: …` with **no 429**. The first ever
run does a full SSO login (from the residential IP, so it's fine) and caches the
session into the DB; subsequent runs reuse it.

### 7. Install the daemon as a systemd service

```
sudo tee /etc/systemd/system/garmin-daemon.service > /dev/null <<'EOF'
[Unit]
Description=Garmin sync daemon (on-demand via NOTIFY + periodic)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=benw
WorkingDirectory=/home/benw/training-sync
ExecStart=/home/benw/training-sync/venv/bin/python /home/benw/training-sync/sync_daemon.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now garmin-daemon.service
```

`enable` wires it to start automatically on every boot (no login required);
`Restart=always` recovers from crashes. The daemon handles the hourly sync
itself, so there is **no** cron job or systemd timer for syncing.

Verify:

```
journalctl -u garmin-daemon.service -n 20 --no-pager
```

You should see `Sync triggered (startup)` → `Listening on channel 'garmin_sync'`.

### 8. Keep the Render backend warm

Render's free tier spins the backend down after ~15 minutes idle, costing the
next request a 30-60s cold start. This used to be pinged by a GitHub Actions
cron job, but GitHub only guarantees scheduled workflows as best-effort —
under platform load a `*/10` schedule can silently slip to 30-80 minutes
between runs, well past the 15-minute window, so the backend went cold anyway.
The Pi is online 24/7 already, so its own OS cron (not subject to GitHub's
scheduling delays) does the ping instead:

```
crontab -e
```

Add:

```
*/10 * * * * curl --fail --silent --show-error --max-time 30 https://training-calendar.onrender.com/health -o /dev/null || echo "$(date -Is) keep-warm ping failed" >> /home/benw/training-sync/keep-warm.log
```

Verify it's installed and firing:

```
crontab -l
tail -5 ~/training-sync/keep-warm.log   # only present once a ping has failed
```

No log line after a few cycles means every ping succeeded — that's expected
day-to-day; the log only accumulates failures.

### 9. Automatic security updates

The Pi is internet-connected 24/7, so keep it patched hands-off:

```
sudo apt install -y unattended-upgrades

sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local > /dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
```

- Security-only updates are the default (the stock `50unattended-upgrades`
  enables the security origins), so allowed-origins is left untouched.
- Reboots at 03:30 when a patch needs one — seamless, since the daemon
  auto-starts on boot.
- Kernel/dependency cleanup is enabled because the SD card is only 16GB.

Verify:

```
systemctl list-timers 'apt-daily*' --no-pager          # apt-daily + apt-daily-upgrade active
sudo unattended-upgrade --dry-run --debug 2>&1 | tail -20
```

---

## Updating the sync code

The Pi's scripts are copies of the repo's `backend/` files, so after changing
`sync_garmin.py` / `sync_daemon.py` / `database.py`:

```
# from the repo's backend/ dir on your Mac
scp sync_garmin.py sync_daemon.py database.py benw@benpi.local:~/training-sync/
# on the Pi
sudo systemctl restart garmin-daemon.service
```

The web app itself deploys separately: **push to `main`** → Render redeploys the
backend, Vercel redeploys the frontend (both auto-deploy from `main`).

---

## Operations & troubleshooting

| Task | Command (on the Pi) |
|------|---------------------|
| Live daemon logs | `journalctl -u garmin-daemon.service -f` |
| Restart daemon | `sudo systemctl restart garmin-daemon.service` |
| Daemon status | `systemctl status garmin-daemon.service` |
| Run one sync by hand | `cd ~/training-sync && venv/bin/python sync_garmin.py` |
| Clean shutdown | `sudo shutdown -h now` (wait for green LED to stop, then unplug) |
| Reboot | `sudo reboot` |
| Check keep-warm cron | `crontab -l` |
| Keep-warm failure log | `tail -20 ~/training-sync/keep-warm.log` |

**UI shows "Pi offline" but the Pi is on:** the daemon isn't writing heartbeats.
Check it's running (`systemctl status garmin-daemon.service`); check logs for
errors; confirm `DATABASE_URL` is reachable from the Pi.

**Button says "Sync queued — will run when your Pi is next online":** the
frontend requested a sync but no fresh result landed within ~90s — the Pi is off
or the daemon is down. It'll be honoured when the daemon next starts.

**`Sync triggered (missed-request)` instead of `(notify)` in the logs:** the
`NOTIFY` didn't arrive (e.g. `DATABASE_URL` is the transaction pooler :6543, not
the session pooler :5432). Syncs still happen within ~15s via the safety-net
poll, but fix the connection string for the instant path.

**429 from Garmin returns:** confirms the residential-IP assumption broke —
check the Pi is actually the machine making the request (not the code somehow
running on Render again).

---

## Related database columns (`sync_status`, single row, `id = 1`)

| Column | Written by | Purpose |
|--------|-----------|---------|
| `last_synced_at` | Pi (`sync_garmin.py`) | Timestamp of the last completed sync |
| `data_watermark` | Pi | Latest activity date Garmin has returned |
| `last_synced_result` | Pi | JSON `{synced, unmatched, failed}` for the UI toast |
| `sync_requested_at` | Render (`/garmin/sync`) | Set on button press; daemon watches it |
| `pi_heartbeat_at` | Pi (`sync_daemon.py`) | Refreshed every ~15s; drives the UI online dot |

`garmin_tokens` (also single row, `id = 1`) holds the cached Garth session
(`token_data`), shared between the one-off script and the daemon.
