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
                completed INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()
