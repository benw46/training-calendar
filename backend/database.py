import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "workouts.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                sport TEXT NOT NULL,
                name TEXT NOT NULL,
                planned_duration_minutes INTEGER,
                planned_distance_km REAL,
                actual_duration_minutes INTEGER,
                actual_distance_km REAL,
                completed INTEGER NOT NULL DEFAULT 0,
                garmin_activity_id TEXT,
                description TEXT,
                sort_order INTEGER
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sync_status (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_synced_at TEXT,
                data_watermark TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS race_bests (
                race_type TEXT PRIMARY KEY,
                race_name TEXT,
                result TEXT,
                date TEXT
            )
        """)

        # CREATE TABLE IF NOT EXISTS is a no-op against an existing DB file,
        # so a genuinely new column added above needs an explicit migration
        # for databases that already existed before this column was added.
        # This must run before the seed INSERTs below, which reference these
        # columns.
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(workouts)")}
        if "sort_order" not in existing_columns:
            conn.execute("ALTER TABLE workouts ADD COLUMN sort_order INTEGER")

        existing_sync_columns = {row["name"] for row in conn.execute("PRAGMA table_info(sync_status)")}
        if "data_watermark" not in existing_sync_columns:
            conn.execute("ALTER TABLE sync_status ADD COLUMN data_watermark TEXT")

        existing_race_columns = {row["name"] for row in conn.execute("PRAGMA table_info(race_bests)")}
        if "race_name" not in existing_race_columns:
            conn.execute("ALTER TABLE race_bests ADD COLUMN race_name TEXT")
        if "date" not in existing_race_columns:
            conn.execute("ALTER TABLE race_bests ADD COLUMN date TEXT")

        for race_type in ("half_marathon", "marathon", "ironman"):
            conn.execute(
                "INSERT OR IGNORE INTO race_bests (race_type, race_name, result, date) VALUES (?, NULL, NULL, NULL)",
                (race_type,),
            )

        conn.commit()
