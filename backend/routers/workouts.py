import json
from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from auth import require_auth
from database import get_conn
from models import WorkoutCreate, WorkoutUpdate, WorkoutOut

router = APIRouter(prefix="/workouts", tags=["workouts"], dependencies=[Depends(require_auth)])


@router.get("/", response_model=list[WorkoutOut])
def list_workouts(start: str, end: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workouts WHERE date >= ? AND date <= ? ORDER BY date, id",
            (start, end),
        ).fetchall()
    return [WorkoutOut.from_row(r) for r in rows]


@router.get("/next-events", response_model=list[WorkoutOut])
def get_next_events(limit: int = 3):
    today = date_cls.today().isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM workouts WHERE sport = 'event' AND date >= ? ORDER BY date, id LIMIT ?",
            (today, limit),
        ).fetchall()
    return [WorkoutOut.from_row(r) for r in rows]


@router.post("/", response_model=WorkoutOut, status_code=201)
def create_workout(body: WorkoutCreate):
    gym_exercises = (
        json.dumps([e.model_dump() for e in body.gym_exercises])
        if body.gym_exercises else None
    )
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO workouts
               (date, sport, name, planned_duration_minutes, planned_distance_km,
                actual_duration_minutes, actual_distance_km, description, is_brick,
                gym_exercises)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING id""",
            (
                body.date,
                body.sport.value,
                body.name,
                body.planned_duration_minutes,
                body.planned_distance_km,
                body.actual_duration_minutes,
                body.actual_distance_km,
                body.description,
                body.is_brick,
                gym_exercises,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        row = conn.execute(
            "SELECT * FROM workouts WHERE id = ?", (new_id,)
        ).fetchone()
    return WorkoutOut.from_row(row)


@router.put("/{workout_id}", response_model=WorkoutOut)
def update_workout(workout_id: int, body: WorkoutUpdate):
    # exclude_unset (rather than dropping None values) so a field can be
    # explicitly cleared to null — e.g. deleting a description, or a
    # duration/distance that no longer applies after switching sport —
    # without that clear being silently dropped as if it were never sent.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "sport" in updates:
        updates["sport"] = updates["sport"].value

    if "gym_exercises" in updates:
        updates["gym_exercises"] = json.dumps(updates["gym_exercises"]) if updates["gym_exercises"] else None

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [workout_id]

    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE workouts SET {fields} WHERE id = ?", values
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Workout not found")
        row = conn.execute(
            "SELECT * FROM workouts WHERE id = ?", (workout_id,)
        ).fetchone()
    return WorkoutOut.from_row(row)


@router.delete("/{workout_id}", status_code=204)
def delete_workout(workout_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Workout not found")
