import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import require_auth
from database import get_conn

router = APIRouter(prefix="/garmin", tags=["garmin"], dependencies=[Depends(require_auth)])
logger = logging.getLogger(__name__)

# Postgres NOTIFY channel the Raspberry Pi's sync daemon LISTENs on. Must match
# CHANNEL in sync_daemon.py.
SYNC_CHANNEL = "garmin_sync"

# The Pi rewrites pi_heartbeat_at every ~15s; allow a couple of missed beats
# before calling it offline so a single blip doesn't flap the indicator.
PI_ONLINE_THRESHOLD_SECONDS = 60


@router.post("/sync")
def request_sync():
    """Record a sync request and wake the Pi daemon — do NOT fetch here.

    The actual Garmin fetch runs on a home Raspberry Pi (a residential IP), not
    on this host. Garmin rate-limits its OAuth2 token-exchange endpoint by IP
    and blocks datacenter ranges like this one, so fetching from here 429s
    intermittently. Instead we stamp sync_requested_at and issue a Postgres
    NOTIFY; the Pi daemon (LISTENing on SYNC_CHANNEL) wakes within a second or
    two and runs the sync, writing the result back to sync_status. The frontend
    polls /garmin/last-sync to see when that result lands.

    If the Pi happens to be offline, the request simply sits in sync_requested_at
    and the daemon picks it up on its next start — nothing is lost.
    """
    requested_at = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO sync_status (id, sync_requested_at) VALUES (1, ?)
               ON CONFLICT (id) DO UPDATE SET sync_requested_at = EXCLUDED.sync_requested_at""",
            (requested_at,),
        )
        # NOTIFY is delivered on commit; get_conn()'s context manager commits on
        # clean exit, but be explicit so the wake-up isn't tied to that detail.
        conn.execute(f"NOTIFY {SYNC_CHANNEL}")
        conn.commit()
    return {"status": "requested", "requested_at": requested_at}


@router.get("/last-sync")
def get_last_sync():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT last_synced_at, last_synced_result FROM sync_status WHERE id = 1"
        ).fetchone()
    if not row:
        return {"last_synced_at": None, "last_result": None}

    result = None
    if row["last_synced_result"]:
        try:
            result = json.loads(row["last_synced_result"])
        except (TypeError, ValueError):
            result = None
    return {"last_synced_at": row["last_synced_at"], "last_result": result}


@router.get("/status")
def get_status():
    """Whether the Pi sync daemon is currently alive, from its heartbeat.

    Online is computed here (server-side) so the frontend just renders a
    boolean and doesn't have to reason about clock skew or timestamp formats.
    """
    with get_conn() as conn:
        row = conn.execute(
            "SELECT last_synced_at, pi_heartbeat_at FROM sync_status WHERE id = 1"
        ).fetchone()

    heartbeat = row["pi_heartbeat_at"] if row else None
    pi_online = False
    if heartbeat:
        try:
            hb = datetime.fromisoformat(heartbeat)
            if hb.tzinfo is None:
                hb = hb.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - hb).total_seconds()
            pi_online = age < PI_ONLINE_THRESHOLD_SECONDS
        except ValueError:
            pi_online = False

    return {
        "pi_online": pi_online,
        "pi_heartbeat_at": heartbeat,
        "last_synced_at": row["last_synced_at"] if row else None,
    }
