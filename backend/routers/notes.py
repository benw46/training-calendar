from fastapi import APIRouter, Depends, HTTPException
from auth import require_auth
from database import get_conn
from models import NoteCreate, NoteUpdate, NoteOut, NotesReorder, NoteMode

router = APIRouter(prefix="/notes", tags=["notes"], dependencies=[Depends(require_auth)])


def _row_to_out(row):
    return NoteOut(id=row["id"], title=row["title"], content=row["content"], mode=row["mode"])


def _list_ordered(conn, mode: NoteMode):
    rows = conn.execute(
        "SELECT id, title, content, mode FROM notes WHERE mode = ? ORDER BY sort_order, id",
        (mode.value,),
    ).fetchall()
    return [_row_to_out(row) for row in rows]


@router.get("/", response_model=list[NoteOut])
def list_notes(mode: NoteMode = NoteMode.training):
    with get_conn() as conn:
        return _list_ordered(conn, mode)


@router.post("/", response_model=NoteOut)
def create_note(body: NoteCreate):
    with get_conn() as conn:
        # New tabs open at the end of their own mode's tab list, so the next
        # sort_order is one past whatever's currently highest within that
        # mode (0 for that mode's very first note).
        max_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes WHERE mode = ?",
            (body.mode.value,),
        ).fetchone()
        next_order = max_row["m"] + 1
        row = conn.execute(
            "INSERT INTO notes (title, content, mode, sort_order) VALUES (?, ?, ?, ?) "
            "RETURNING id, title, content, mode",
            (body.title, body.content, body.mode.value, next_order),
        ).fetchone()
        conn.commit()
    return _row_to_out(row)


# Defined before PUT /{note_id} so "reorder" isn't matched as a note_id.
@router.put("/reorder", response_model=list[NoteOut])
def reorder_notes(body: NotesReorder, mode: NoteMode = NoteMode.training):
    with get_conn() as conn:
        for index, note_id in enumerate(body.order):
            conn.execute(
                "UPDATE notes SET sort_order = ? WHERE id = ?",
                (index, note_id),
            )
        conn.commit()
        return _list_ordered(conn, mode)


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
            "SELECT id, title, content, mode FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
    return _row_to_out(row)


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Note not found")
