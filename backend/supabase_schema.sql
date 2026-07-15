-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- to set up the schema. This is the final shape of the three tables — since
-- it's a fresh database, there's no need for the incremental ALTER TABLE
-- migrations that database.py carries for the old SQLite file.

CREATE TABLE IF NOT EXISTS workouts (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    sport TEXT NOT NULL,
    name TEXT NOT NULL,
    planned_duration_minutes INTEGER,
    planned_distance_km REAL,
    actual_duration_minutes INTEGER,
    actual_distance_km REAL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    garmin_activity_id TEXT,
    description TEXT,
    sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS sync_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_synced_at TEXT,
    data_watermark TEXT
);

CREATE TABLE IF NOT EXISTS race_bests (
    race_type TEXT PRIMARY KEY,
    race_name TEXT,
    result TEXT,
    date TEXT
);

INSERT INTO race_bests (race_type, race_name, result, date) VALUES
    ('half_marathon', NULL, NULL, NULL),
    ('marathon', NULL, NULL, NULL),
    ('ironman', NULL, NULL, NULL)
ON CONFLICT (race_type) DO NOTHING;
