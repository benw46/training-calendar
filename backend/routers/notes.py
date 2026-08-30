from fastapi import APIRouter, Depends, HTTPException
from auth import require_auth
from database import get_conn
from models import NoteCreate, NoteUpdate, NoteOut, NotesReorder

router = APIRouter(prefix="/notes", tags=["notes"], dependencies=[Depends(require_auth)])


def _list_ordered(conn):
    rows = conn.execute(
        "SELECT id, title, content FROM notes ORDER BY sort_order, id"
    ).fetchall()
    return [NoteOut(id=row["id"], title=row["title"], content=row["content"]) for row in rows]


@router.get("/", response_model=list[NoteOut])
def list_notes():
    with get_conn() as conn:
        return _list_ordered(conn)


@router.post("/", response_model=NoteOut)
def create_note(body: NoteCreate):
    with get_conn() as conn:
        # New tabs open at the end, so the next sort_order is one past
        # whatever's currently highest (0 for the very first note).
        max_row = conn.execute("SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes").fetchone()
        next_order = max_row["m"] + 1
        row = conn.execute(
            "INSERT INTO notes (title, content, sort_order) VALUES (?, ?, ?) "
            "RETURNING id, title, content",
            (body.title, body.content, next_order),
        ).fetchone()
        conn.commit()
    return NoteOut(id=row["id"], title=row["title"], content=row["content"])


# Defined before PUT /{note_id} so "reorder" isn't matched as a note_id.
@router.put("/reorder", response_model=list[NoteOut])
def reorder_notes(body: NotesReorder):
    with get_conn() as conn:
        for index, note_id in enumerate(body.order):
            conn.execute(
                "UPDATE notes SET sort_order = ? WHERE id = ?",
                (index, note_id),
            )
        conn.commit()
        return _list_ordered(conn)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, body: NoteUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [note_id]

    with get_conn() as conn:
        cur = conn.execute(f"UPDATE notes SET {fields} WHERE id = ?", values)
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        row = conn.execute(
            "SELECT id, title, content FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
    return NoteOut(id=row["id"], title=row["title"], content=row["content"])


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Note not found")
