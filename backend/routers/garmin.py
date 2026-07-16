import logging
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from garminconnect import Garmin

from auth import require_auth
from database import get_conn

router = APIRouter(prefix="/garmin", tags=["garmin"], dependencies=[Depends(require_auth)])
logger = logging.getLogger(__name__)

COMMIT_BATCH_SIZE = 20
DEFAULT_LOOKBACK_DAYS = 90
MAX_LOOKBACK_DAYS = 365
SYNC_OVERLAP_DAYS = 14


def _load_cached_tokens():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT token_data FROM garmin_tokens WHERE id = 1"
        ).fetchone()
    return row["token_data"] if row else None


def _save_cached_tokens(token_data):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO garmin_tokens (id, token_data, updated_at) VALUES (1, ?, ?)
               ON CONFLICT (id) DO UPDATE SET
                 token_data = EXCLUDED.token_data,
                 updated_at = EXCLUDED.updated_at""",
            (token_data, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()


# Garmin's SSO login endpoint (sso.garmin.com/mobile/api/login) rate-limits
# repeated logins fairly aggressively. Session tokens are cached in the
# database (rather than on local disk, which Render wipes on every redeploy
# and on spin-down/cold-start) so a sync only hits that endpoint when there's
# no cached session yet or the cached one has actually expired — every other
# sync reuses it instead of logging in from scratch.
def _get_garmin_client(email, password):
    client = Garmin(email, password)

    cached = _load_cached_tokens()
    if cached:
        try:
            client.garth.loads(cached)
            # loads() is pure deserialization — nothing has actually confirmed
            # the token still works, so make one cheap call that would fail
            # if Garmin has since expired or revoked it.
            client.display_name = client.garth.profile["displayName"]
            return client
        except Exception:
            logger.info("Cached Garmin session invalid or expired; logging in fresh")

    client.login()
    try:
        _save_cached_tokens(client.garth.dumps())
    except Exception:
        logger.exception("Failed to cache Garmin session tokens")
    return client


SPORT_MAP = {
    "running": "run",
    "trail_running": "run",
    "treadmill_running": "run",
    "track_running": "run",
    "cycling": "bike",
    "road_biking": "bike",
    "mountain_biking": "bike",
    "gravel_cycling": "bike",
    "indoor_cycling": "bike",
    "virtual_ride": "bike",
    "e_bike_mountain": "bike",
    "lap_swimming": "swim",
    "open_water_swimming": "swim",
    "swimming": "swim",
    "strength_training": "strength",
    "fitness_equipment": "strength",
}


def _map_sport(type_key: str) -> str:
    return SPORT_MAP.get(type_key, "other")


@router.post("/sync")
def sync_garmin():
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        raise HTTPException(
            status_code=500,
            detail="GARMIN_EMAIL and GARMIN_PASSWORD environment variables are required",
        )

    try:
        client = _get_garmin_client(email, password)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Garmin login failed: {exc}")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT data_watermark FROM sync_status WHERE id = 1"
        ).fetchone()

    end_date = date.today()
    earliest_allowed = end_date - timedelta(days=MAX_LOOKBACK_DAYS)
    # The watermark tracks the latest activity date Garmin has actually
    # returned in a past sync — NOT when the button was last clicked. A watch
    # that hasn't uploaded yet means Garmin's API simply won't return that
    # activity; if we watermarked on "now" regardless, the next sync's
    # overlap window would be anchored to that click time and could permanently
    # skip an activity that uploads late (once it's older than the overlap).
    if row and row["data_watermark"]:
        watermark_date = date.fromisoformat(row["data_watermark"])
        start_date = max(watermark_date - timedelta(days=SYNC_OVERLAP_DAYS), earliest_allowed)
    else:
        start_date = end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    try:
        activities = client.get_activities_by_date(
            start_date.isoformat(), end_date.isoformat()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Garmin fetch failed: {exc}")

    synced = 0
    unmatched = 0
    failed = 0

    with get_conn() as conn:
        for i, activity in enumerate(activities, start=1):
            try:
                garmin_id = str(activity["activityId"])

                if conn.execute(
                    "SELECT 1 FROM workouts WHERE garmin_activity_id = ?", (garmin_id,)
                ).fetchone():
                    continue

                activity_date = activity["startTimeLocal"][:10]
                sport = _map_sport(activity.get("activityType", {}).get("typeKey", ""))
                duration_minutes = round(activity.get("duration", 0) / 60)
                raw_distance = activity.get("distance", 0) or 0
                distance_km = round(raw_distance / 1000, 2) if raw_distance > 10 else None
                activity_name = activity.get("activityName") or sport.capitalize()

                candidates = conn.execute(
                    """SELECT * FROM workouts
                       WHERE date = ? AND sport = ? AND garmin_activity_id IS NULL
                       ORDER BY id""",
                    (activity_date, sport),
                ).fetchall()

                if not candidates:
                    conn.execute(
                        """INSERT INTO workouts
                           (date, sport, name, actual_duration_minutes, actual_distance_km,
                            completed, garmin_activity_id)
                           VALUES (?, ?, ?, ?, ?, TRUE, ?)""",
                        (activity_date, sport, activity_name, duration_minutes, distance_km, garmin_id),
                    )
                    unmatched += 1
                else:
                    if len(candidates) == 1:
                        match = candidates[0]
                    else:
                        def _diff(row):
                            pd = row["planned_duration_minutes"]
                            return abs(pd - duration_minutes) if pd is not None else float("inf")
                        match = min(candidates, key=_diff)

                    conn.execute(
                        """UPDATE workouts SET
                           actual_duration_minutes = ?, actual_distance_km = ?,
                           garmin_activity_id = ?, completed = TRUE
                           WHERE id = ?""",
                        (duration_minutes, distance_km, garmin_id, match["id"]),
                    )
                    synced += 1
            except Exception:
                failed += 1
                logger.exception(
                    "Failed to process Garmin activity %s; skipping",
                    activity.get("activityId", "<unknown>"),
                )
                continue

            if i % COMMIT_BATCH_SIZE == 0:
                conn.commit()

        # The watermark advances only as far as the latest activity date
        # Garmin's API actually returned this time — never to "now", and
        # never backwards. If nothing came back at all, leave it untouched
        # rather than guessing; the next sync will simply re-check the same
        # span (now a bit wider, since end_date keeps advancing) instead of
        # risking a late-uploaded activity falling outside a window we'd
        # otherwise stop scanning.
        activity_dates = [a["startTimeLocal"][:10] for a in activities if a.get("startTimeLocal")]
        fetched_max_date = max(activity_dates) if activity_dates else None
        existing_watermark = row["data_watermark"] if row else None
        if fetched_max_date and (not existing_watermark or fetched_max_date > existing_watermark):
            data_watermark = fetched_max_date
        else:
            data_watermark = existing_watermark

        last_synced_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO sync_status (id, last_synced_at, data_watermark) VALUES (1, ?, ?)
               ON CONFLICT (id) DO UPDATE SET
                 last_synced_at = EXCLUDED.last_synced_at,
                 data_watermark = EXCLUDED.data_watermark""",
            (last_synced_at, data_watermark),
        )
        conn.commit()

    return {
        "synced": synced,
        "unmatched": unmatched,
        "failed": failed,
        "last_synced_at": last_synced_at,
    }


@router.get("/last-sync")
def get_last_sync():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT last_synced_at FROM sync_status WHERE id = 1"
        ).fetchone()
    return {"last_synced_at": row["last_synced_at"] if row else None}
