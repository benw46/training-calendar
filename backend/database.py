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

    -- completed was write-only (set on insert/Garmin sync, never read —
    -- actual card status is derived from planned vs. actual numbers
    -- instead) and has been fully removed from the model/code; drop it
    -- from any database that still has it from before this cleanup.
    ALTER TABLE workouts DROP COLUMN IF EXISTS completed;

    CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_synced_at TEXT,
        data_watermark TEXT
    );

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
        date TEXT
    );
"""

SEED_RACE_TYPES_SQL = """
    INSERT INTO race_bests (race_type, race_name, result, date) VALUES
        ('half_marathon', NULL, NULL, NULL),
        ('marathon', NULL, NULL, NULL),
        ('ironman', NULL, NULL, NULL)
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
