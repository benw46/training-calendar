import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS workouts (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        sport TEXT NOT NULL,
        name TEXT NOT NULL,
        planned_duration_minutes INTEGER,
        planned_distance_km REAL,
        actual_duration_minutes INTEGER,
        actual_distance_km REAL,
        garmin_activity_id TEXT,
        description TEXT,
        sort_order INTEGER
    );

    -- CREATE TABLE IF NOT EXISTS is a no-op against the already-existing
    -- table (this deploy isn't creating workouts fresh), so a new column
    -- needs its own migration statement — ADD COLUMN IF NOT EXISTS is
    -- safe to re-run on every startup, same as the CREATE TABLEs above.
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS is_brick BOOLEAN NOT NULL DEFAULT FALSE;

    -- Gym (strength) exercise breakdown: JSON-encoded array of
    -- {name, sets, reps, weight}, stored as text since only the backend
    -- ever reads/writes it as a whole (no per-exercise SQL querying needed).
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS gym_exercises TEXT;

    -- Run/Bike/Swim's structured-interval breakdown: JSON-encoded array of
    -- {name, distance, reps} — same storage approach as gym_exercises above,
    -- one column per sport since a workout is only ever one of them.
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS run_exercises TEXT;
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS bike_exercises TEXT;
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS swim_exercises TEXT;

    -- Total elevation gain in metres for the whole workout, straight from
    -- Garmin's elevationGain (never netted against elevationLoss, so a
    -- net-downhill activity still shows the metres actually climbed rather
    -- than 0 or negative). Per-split elevation below is netted instead - see
    -- the run_splits/bike_splits comment. Written only by the Garmin sync
    -- (see sync_garmin.py); there is no API path or form field that lets a
    -- user set it directly, same as garmin_activity_id.
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS elevation_gain_m REAL;
    ALTER TABLE workouts DROP COLUMN IF EXISTS elevation_net_m;

    -- Per-kilometre splits, JSON-encoded array of
    -- {distance_km, duration_s, elevation_net_m} — same storage approach as
    -- gym_exercises, one column per sport since a workout is only ever one
    -- of them (same reasoning as run_exercises/bike_exercises above). Only
    -- backfilled from SPLITS_START_DATE onward (see sync_garmin.py) since
    -- it costs one extra Garmin API call per activity; written only by the
    -- Garmin sync, never user-editable.
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS run_splits TEXT;
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS bike_splits TEXT;

    -- A workout-level "done" column was briefly added here and never
    -- shipped — the "Done" checkbox lives per-exercise instead (a `done`
    -- field inside each entry of gym_exercises/run_exercises/bike_exercises/
    -- swim_exercises, no schema change needed since those are JSON text).
    -- Drop it from any database that still has it from that.
    ALTER TABLE workouts DROP COLUMN IF EXISTS done;

    -- completed was write-only (set on insert/Garmin sync, never read —
    -- actual card status is derived from planned vs. actual numbers
    -- instead) and has been fully removed from the model/code; drop it
    -- from any database that still has it from before this cleanup.
    ALTER TABLE workouts DROP COLUMN IF EXISTS completed;

    -- User-entered hh:mm:ss (e.g. a race finish time), stored as text like
    -- race_bests.result rather than derived from actual_duration_minutes —
    -- that column is whole minutes only, too coarse for a race clock time.
    ALTER TABLE workouts ADD COLUMN IF NOT EXISTS event_time TEXT;

    CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_synced_at TEXT,
        data_watermark TEXT
    );

    -- On-demand sync plumbing: the "Sync" button (via the Render API) stamps
    -- sync_requested_at and NOTIFYs; the Raspberry Pi daemon does the actual
    -- Garmin fetch and records the run's counts in last_synced_result (JSON)
    -- so the frontend can show "N new activities added" without the fetch
    -- ever happening on this datacenter-IP host. See routers/garmin.py.
    ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS sync_requested_at TEXT;
    ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS last_synced_result TEXT;

    -- Liveness: the Pi daemon rewrites pi_heartbeat_at every ~15s while it's
    -- running, so the UI can show whether the Pi (and therefore on-demand
    -- syncing) is currently online — a recent timestamp means alive.
    ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS pi_heartbeat_at TEXT;

    -- Garmin's Garth session (oauth1 + oauth2 tokens), base64-encoded via
    -- garth.Client.dumps(). Stored here rather than on local disk so a
    -- cached session survives Render redeploys/spin-downs, which wipe the
    -- backend's ephemeral filesystem and would otherwise force a fresh
    -- SSO login on every sync — and Garmin's SSO endpoint rate-limits those.
    CREATE TABLE IF NOT EXISTS garmin_tokens (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token_data TEXT,
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS race_bests (
        race_type TEXT PRIMARY KEY,
        race_name TEXT,
        result TEXT,
        date TEXT,
        sort_order INTEGER
    );

    -- sort_order drives the (user-draggable) display order of the races.
    -- Backfill the original fixed order for any pre-existing rows that predate
    -- this column; only touches NULLs, so a user's chosen order is never reset.
    ALTER TABLE race_bests ADD COLUMN IF NOT EXISTS sort_order INTEGER;
    UPDATE race_bests SET sort_order = CASE race_type
            WHEN 'half_marathon' THEN 0
            WHEN 'marathon' THEN 1
            WHEN 'ironman' THEN 2
            ELSE 99
        END
        WHERE sort_order IS NULL;
"""

SEED_RACE_TYPES_SQL = """
    INSERT INTO race_bests (race_type, race_name, result, date, sort_order) VALUES
        ('half_marathon', NULL, NULL, NULL, 0),
        ('marathon', NULL, NULL, NULL, 1),
        ('ironman', NULL, NULL, NULL, 2)
    ON CONFLICT (race_type) DO NOTHING;
"""


class ConnWrapper:
    """Thin shim over a psycopg2 connection so call sites can keep using
    sqlite3's `conn.execute(sql, params)` convenience method and `?`
    placeholders unchanged. RealDictCursor makes rows support `row["col"]`
    access, matching sqlite3.Row's behavior.
    """

    def __init__(self, pg_conn):
        self._conn = pg_conn

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        pg_sql = sql.replace("?", "%s")
        # Passing even an empty tuple as `vars` switches psycopg2 to its
        # extended query protocol, which rejects the semicolon-separated
        # multi-statement SQL used in init_db() — only pass params when the
        # caller actually gave us some, so the simple protocol (which allows
        # multiple statements) is used otherwise.
        if params:
            cur.execute(pg_sql, params)
        else:
            cur.execute(pg_sql)
        return cur

    def commit(self):
        self._conn.commit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()


def get_conn():
    return ConnWrapper(psycopg2.connect(DATABASE_URL))


def init_db():
    with get_conn() as conn:
        conn.execute(SCHEMA_SQL)
        conn.execute(SEED_RACE_TYPES_SQL)
        conn.commit()
