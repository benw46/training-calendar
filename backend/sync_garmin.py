#!/usr/bin/env python3
"""Standalone Garmin -> Supabase sync, intended to run on a home Raspberry Pi.

Why this exists: Garmin throttles its OAuth2 token-exchange endpoint by IP and
blocks datacenter ranges, so the same sync run from Render (a Frankfurt cloud
IP) intermittently fails with `429 ... oauth/exchange/user/2.0`. Run from a
residential IP (the Pi at home) that throttling doesn't apply, so the exchange
- and therefore the whole sync - just works.

This is a faithful port of the logic in routers/garmin.py's sync_garmin(),
minus FastAPI: it reads the same env vars, uses the same DB (database.py), and
reads/writes the same garmin_tokens / sync_status / workouts tables. Run it with
`python sync_garmin.py`; it does exactly one sync and prints a summary.
"""

import json
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

from database import get_conn

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("sync_garmin")

COMMIT_BATCH_SIZE = 20
DEFAULT_LOOKBACK_DAYS = 90
MAX_LOOKBACK_DAYS = 365
SYNC_OVERLAP_DAYS = 14

# Per-kilometre splits cost one extra Garmin API call per activity, so they're
# only fetched for runs from this fixed date onward (per user request, not a
# rolling window) rather than backfilled across the whole history. Since it's
# a fixed calendar date, this only matters for the initial backfill window —
# every run synced after it is always later than this date anyway.
SPLITS_START_DATE = date(2026, 7, 6)
SPLITS_FETCH_DELAY_SECONDS = 0.75

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


def _elevation_gain(elevation_gain):
    """Total elevation climbed, straight from Garmin's own figure.

    Never netted against elevationLoss - a net-downhill split should still
    show the metres actually climbed, not zero or negative.
    """
    if elevation_gain is None:
        return None
    return round(elevation_gain, 1)


# Which column holds per-km splits for each sport that supports them - keys
# double as the set of sports the backfill below runs for. Column names come
# from this fixed internal dict, never from request/activity data, so the
# f-string SQL below is safe the same way the LISTEN/NOTIFY channel name is.
SPLIT_COLUMNS = {"run": "run_splits", "bike": "bike_splits"}


def _fetch_splits(client, garmin_id):
    """Fetch and normalise per-km splits for one activity, or None on failure.

    Never raises - a failed/malformed splits fetch just leaves the sport's
    splits column NULL for this activity, to be retried on the next sync
    (see _backfill_splits), rather than failing the whole activity.
    """
    try:
        data = client.get_activity_splits(garmin_id)
    except Exception:
        logger.exception("Failed to fetch splits for activity %s", garmin_id)
        return None

    laps = (data or {}).get("lapDTOs") or []
    splits = []
    for lap in laps:
        distance_m = lap.get("distance")
        duration_s = lap.get("duration")
        if not distance_m or duration_s is None:
            continue
        splits.append({
            "distance_km": round(distance_m / 1000, 3),
            "duration_s": round(duration_s),
            "elevation_gain_m": _elevation_gain(lap.get("elevationGain")),
        })
    return splits


def _backfill_splits(conn, client):
    """Fill in splits for any run/bike activity in the target window missing it.

    Runs after the main sync loop rather than inline in it, so the same
    query covers both activities matched/inserted just now and ones that
    were already synced before this feature existed - one code path, and it
    naturally does nothing once every eligible activity has splits.
    """
    total_filled = 0
    for sport, column in SPLIT_COLUMNS.items():
        rows = conn.execute(
            f"""SELECT id, garmin_activity_id FROM workouts
               WHERE sport = ? AND garmin_activity_id IS NOT NULL
               AND date >= ? AND {column} IS NULL""",
            (sport, SPLITS_START_DATE.isoformat()),
        ).fetchall()

        filled = 0
        for row in rows:
            splits = _fetch_splits(client, row["garmin_activity_id"])
            time.sleep(SPLITS_FETCH_DELAY_SECONDS)
            if splits is None:
                continue
            conn.execute(
                f"UPDATE workouts SET {column} = ? WHERE id = ?",
                (json.dumps(splits), row["id"]),
            )
            conn.commit()
            filled += 1

        if rows:
            logger.info("Backfilled %s splits for %d/%d eligible activities", sport, filled, len(rows))
        total_filled += filled

    return total_filled


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


def _fresh_login(email, password):
    """Full SSO login (the rate-limited path) + cache the new session.

    From the Pi's residential IP this endpoint isn't throttled the way it is
    from a datacenter, but we still only ever hit it when there's no usable
    cached session - never as a reaction to a transient error or a 429.
    """
    client = Garmin(email, password)
    client.login()
    try:
        _save_cached_tokens(client.garth.dumps())
    except Exception:
        logger.exception("Failed to cache Garmin session tokens")
    return client


def _get_garmin_client(email, password):
    """Return (client, from_cache).

    A cached session is loaded with garth.loads() - pure deserialization, no
    network call - so it can't fail for a transient/rate-limit reason. The
    short-lived OAuth2 half is refreshed automatically by garth on the first
    real API call via a connectapi token exchange (NOT the login endpoint).
    """
    cached = _load_cached_tokens()
    if cached:
        try:
            client = Garmin(email, password)
            client.garth.loads(cached)
            return client, True
        except Exception:
            logger.info("Cached Garmin session could not be loaded; logging in fresh")

    return _fresh_login(email, password), False


def run_sync():
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        raise SystemExit("GARMIN_EMAIL and GARMIN_PASSWORD environment variables are required")
    if not os.getenv("DATABASE_URL"):
        raise SystemExit("DATABASE_URL environment variable is required")

    client, from_cache = _get_garmin_client(email, password)
    logger.info("Garmin client ready (from_cache=%s)", from_cache)

    with get_conn() as conn:
        row = conn.execute(
            "SELECT data_watermark FROM sync_status WHERE id = 1"
        ).fetchone()

    end_date = date.today()
    earliest_allowed = end_date - timedelta(days=MAX_LOOKBACK_DAYS)
    # Watermark tracks the latest activity date Garmin has actually returned,
    # not when a sync ran - so a late-uploaded activity can't fall outside the
    # window we scan. Overlap re-checks the trailing SYNC_OVERLAP_DAYS.
    if row and row["data_watermark"]:
        watermark_date = date.fromisoformat(row["data_watermark"])
        start_date = max(watermark_date - timedelta(days=SYNC_OVERLAP_DAYS), earliest_allowed)
    else:
        start_date = end_date - timedelta(days=DEFAULT_LOOKBACK_DAYS)

    logger.info("Fetching activities %s .. %s", start_date, end_date)

    try:
        activities = client.get_activities_by_date(
            start_date.isoformat(), end_date.isoformat()
        )
    except GarminConnectTooManyRequestsError as exc:
        raise SystemExit(f"Garmin is rate-limiting requests; wait a while and try again: {exc}")
    except GarminConnectAuthenticationError as exc:
        # A cached session Garmin actually rejects (revoked/expired OAuth1) is
        # the one case a fresh login is warranted - do it once and retry.
        if not from_cache:
            raise SystemExit(f"Garmin fetch failed: {exc}")
        logger.info("Cached Garmin session rejected; logging in fresh and retrying once")
        client = _fresh_login(email, password)
        activities = client.get_activities_by_date(
            start_date.isoformat(), end_date.isoformat()
        )

    # The OAuth2 half may have been refreshed during the fetch; persist the
    # current session so the cache stays fresh for next time.
    try:
        _save_cached_tokens(client.garth.dumps())
    except Exception:
        logger.exception("Failed to update cached Garmin session tokens")

    logger.info("Garmin returned %d activities", len(activities))

    synced = 0
    unmatched = 0
    failed = 0

    with get_conn() as conn:
        for i, activity in enumerate(activities, start=1):
            try:
                garmin_id = str(activity["activityId"])

                existing = conn.execute(
                    "SELECT id, elevation_gain_m FROM workouts WHERE garmin_activity_id = ?", (garmin_id,)
                ).fetchone()
                if existing:
                    # Backfill elevation for activities matched before this
                    # column existed (e.g. the elevation_net_m -> elevation_gain_m
                    # rename) - the value is already in `activity`, so this
                    # costs no extra Garmin API call.
                    if existing["elevation_gain_m"] is None:
                        backfill_elevation_gain_m = _elevation_gain(activity.get("elevationGain"))
                        if backfill_elevation_gain_m is not None:
                            conn.execute(
                                "UPDATE workouts SET elevation_gain_m = ? WHERE id = ?",
                                (backfill_elevation_gain_m, existing["id"]),
                            )
                    continue

                activity_date = activity["startTimeLocal"][:10]
                sport = _map_sport(activity.get("activityType", {}).get("typeKey", ""))
                duration_minutes = round(activity.get("duration", 0) / 60)
                raw_distance = activity.get("distance", 0) or 0
                distance_km = round(raw_distance / 1000, 2) if raw_distance > 10 else None
                activity_name = activity.get("activityName") or sport.capitalize()
                elevation_gain_m = _elevation_gain(activity.get("elevationGain"))

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
                            garmin_activity_id, elevation_gain_m)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (activity_date, sport, activity_name, duration_minutes, distance_km, garmin_id, elevation_gain_m),
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
                           garmin_activity_id = ?, elevation_gain_m = ?
                           WHERE id = ?""",
                        (duration_minutes, distance_km, garmin_id, elevation_gain_m, match["id"]),
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

        # Commit the core sync before the splits backfill, which does its
        # own per-row commits and can fail/retry independently.
        conn.commit()
        try:
            _backfill_splits(conn, client)
        except Exception:
            logger.exception("Splits backfill failed; core sync is unaffected")

        # Watermark advances only as far as the latest activity date Garmin
        # actually returned - never to "now", never backwards.
        activity_dates = [a["startTimeLocal"][:10] for a in activities if a.get("startTimeLocal")]
        fetched_max_date = max(activity_dates) if activity_dates else None
        existing_watermark = row["data_watermark"] if row else None
        if fetched_max_date and (not existing_watermark or fetched_max_date > existing_watermark):
            data_watermark = fetched_max_date
        else:
            data_watermark = existing_watermark

        last_synced_at = datetime.now(timezone.utc).isoformat()
        result_json = json.dumps({"synced": synced, "unmatched": unmatched, "failed": failed})
        conn.execute(
            """INSERT INTO sync_status (id, last_synced_at, data_watermark, last_synced_result)
               VALUES (1, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET
                 last_synced_at = EXCLUDED.last_synced_at,
                 data_watermark = EXCLUDED.data_watermark,
                 last_synced_result = EXCLUDED.last_synced_result""",
            (last_synced_at, data_watermark, result_json),
        )
        conn.commit()

    return {"synced": synced, "unmatched": unmatched, "failed": failed, "last_synced_at": last_synced_at}


if __name__ == "__main__":
    try:
        result = run_sync()
    except SystemExit as exc:
        logger.error("%s", exc)
        sys.exit(1)
    except Exception:
        logger.exception("Sync failed")
        sys.exit(1)
    logger.info(
        "Done: %d matched, %d unmatched, %d failed (last_synced_at=%s)",
        result["synced"], result["unmatched"], result["failed"], result["last_synced_at"],
    )
