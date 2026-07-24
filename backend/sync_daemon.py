#!/usr/bin/env python3
"""Long-running Garmin sync daemon for the home Raspberry Pi.

Handles both on-demand and periodic syncs in a single, single-threaded process
(so the two can never race each other) and replaces the systemd garmin-sync.timer.

Three triggers, in order of responsiveness:
  1. NOTIFY  - the Render /garmin/sync endpoint stamps sync_requested_at and
     issues `NOTIFY garmin_sync` when the UI button is pressed; we LISTEN on that
     channel and sync within a second or two. This is the fast path.
  2. Safety-net poll - every WAIT_TIMEOUT seconds we re-read sync_requested_at
     and sync if it's newer than the last request we handled. This guarantees a
     button press is honoured within WAIT_TIMEOUT even if its NOTIFY was missed
     (e.g. the LISTEN connection had just dropped).
  3. Periodic - if nothing else has triggered a sync in PERIODIC_SECONDS, run one
     anyway, so activities uploaded while nobody's watching still get pulled in.

Requires a *session-mode* Postgres connection (Supabase session pooler, port
5432) for LISTEN to work; the transaction pooler (6543) would not deliver
notifications.
"""

import logging
import os
import select
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extensions
from dotenv import load_dotenv

from database import get_conn
from sync_garmin import run_sync

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("sync_daemon")

CHANNEL = "garmin_sync"        # must match SYNC_CHANNEL in routers/garmin.py
PERIODIC_SECONDS = 3600        # sync at least this often even with no requests
WAIT_TIMEOUT = 15             # max seconds to block per loop (also safety-net cadence)
RECONNECT_DELAY = 5

DATABASE_URL = os.getenv("DATABASE_URL")


def _latest_request():
    """Current sync_requested_at, via a short-lived connection."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT sync_requested_at FROM sync_status WHERE id = 1"
        ).fetchone()
    return row["sync_requested_at"] if row else None


def _sync(reason):
    logger.info("Sync triggered (%s)", reason)
    try:
        result = run_sync()
        logger.info(
            "Sync done (%s): %d matched, %d unmatched, %d failed",
            reason, result["synced"], result["unmatched"], result["failed"],
        )
    except Exception:
        # Never let one failed sync kill the daemon; the next trigger retries.
        logger.exception("Sync failed (%s)", reason)


def _connect_listen():
    """Open an autocommit session connection and LISTEN on the channel."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    conn.cursor().execute(f"LISTEN {CHANNEL};")
    logger.info("Listening on channel '%s'", CHANNEL)
    return conn


def main():
    # Sync once on startup so a fresh boot (or a request that arrived while the
    # daemon was down) is honoured immediately.
    _sync("startup")
    last_sync_monotonic = time.monotonic()
    handled_request = _latest_request()

    conn = _connect_listen()
    while True:
        try:
            ready, _, _ = select.select([conn], [], [], WAIT_TIMEOUT)

            if ready:
                conn.poll()
                if conn.notifies:
                    conn.notifies.clear()
                    _sync("notify")
                    last_sync_monotonic = time.monotonic()
                    handled_request = _latest_request()
                continue

            # --- timed out: keep the LISTEN connection alive / detect death ---
            conn.cursor().execute("SELECT 1")

            # Safety net: a request whose NOTIFY we somehow missed.
            latest = _latest_request()
            if latest and latest != handled_request:
                _sync("missed-request")
                handled_request = latest
                last_sync_monotonic = time.monotonic()
            # Periodic backstop.
            elif time.monotonic() - last_sync_monotonic >= PERIODIC_SECONDS:
                _sync("periodic")
                last_sync_monotonic = time.monotonic()
                handled_request = _latest_request()

        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            logger.exception("LISTEN connection lost; reconnecting in %ss", RECONNECT_DELAY)
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(RECONNECT_DELAY)
            conn = _connect_listen()
            # A request may have arrived during the outage; catch it up.
            handled_request = _latest_request()


if __name__ == "__main__":
    main()
