from fastapi import APIRouter, Depends, HTTPException
from auth import require_auth
from database import get_conn
from models import StudyCreate, StudyUpdate, StudyOut

router = APIRouter(prefix="/study", tags=["study"], dependencies=[Depends(require_auth)])


@router.get("/", response_model=list[StudyOut])
def list_study_sessions(start: str, end: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM study_sessions WHERE date >= ? AND date <= ? ORDER BY date, id",
            (start, end),
        ).fetchall()
    return [StudyOut.from_row(r) for r in rows]


@router.post("/", response_model=StudyOut, status_code=201)
def create_study_session(body: StudyCreate):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO study_sessions
               (date, sport, name, description, planned_duration_minutes, actual_duration_minutes)
               VALUES (?, ?, ?, ?, ?, ?)
               RETURNING id""",
            (
                body.date,
                body.sport.value,
                body.name,
                body.description,
                body.planned_duration_minutes,
                body.actual_duration_minutes,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        row = conn.execute(
            "SELECT * FROM study_sessions WHERE id = ?", (new_id,)
        ).fetchone()
    return StudyOut.from_row(row)


@router.put("/{session_id}", response_model=StudyOut)
def update_study_session(session_id: int, body: StudyUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "sport" in updates:
        # sport is NOT NULL in the schema — reject an explicit null cleanly
        # rather than crashing on None.value below or hitting a raw
        # constraint-violation 500 from the UPDATE itself.
        if updates["sport"] is None:
            raise HTTPException(status_code=400, detail="sport cannot be null")
        updates["sport"] = updates["sport"].value

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [session_id]

    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE study_sessions SET {fields} WHERE id = ?", values
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Study session not found")
        row = conn.execute(
            "SELECT * FROM study_sessions WHERE id = ?", (session_id,)
        ).fetchone()
    return StudyOut.from_row(row)


@router.delete("/{session_id}", status_code=204)
def delete_study_session(session_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM study_sessions WHERE id = ?", (session_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Study session not found")
