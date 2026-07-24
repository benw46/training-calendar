from fastapi import APIRouter, Depends, HTTPException
from auth import require_auth
from database import get_conn
from models import RaceBestUpdate, RaceBestOut, RaceBestsReorder, RaceType

router = APIRouter(prefix="/race-bests", tags=["race-bests"], dependencies=[Depends(require_auth)])


def _list_ordered(conn):
    rows = conn.execute(
        # NULLS LAST keeps any un-ordered row from jumping to the top; race_type
        # is a stable tiebreaker so equal/!null orders don't shuffle per query.
        "SELECT race_type, race_name, result, date FROM race_bests "
        "ORDER BY sort_order NULLS LAST, race_type"
    ).fetchall()
    return [
        RaceBestOut(race_type=row["race_type"], race_name=row["race_name"], result=row["result"], date=row["date"])
        for row in rows
    ]


@router.get("/", response_model=list[RaceBestOut])
def list_race_bests():
    with get_conn() as conn:
        return _list_ordered(conn)


# Defined before PUT /{race_type} so "reorder" isn't matched as a race_type.
@router.put("/reorder", response_model=list[RaceBestOut])
def reorder_race_bests(body: RaceBestsReorder):
    with get_conn() as conn:
        for index, race_type in enumerate(body.order):
            conn.execute(
                "UPDATE race_bests SET sort_order = ? WHERE race_type = ?",
                (index, race_type.value),
            )
        conn.commit()
        return _list_ordered(conn)


@router.put("/{race_type}", response_model=RaceBestOut)
def update_race_best(race_type: RaceType, body: RaceBestUpdate):
    # exclude_unset (rather than dropping None values) so a field can be
    # explicitly cleared to null without also wiping the other two fields
    # that simply weren't part of this particular request.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    fields = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [race_type.value]

    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE race_bests SET {fields} WHERE race_type = ?", values
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Unknown race type")
        row = conn.execute(
            "SELECT race_type, race_name, result, date FROM race_bests WHERE race_type = ?",
            (race_type.value,),
        ).fetchone()
    return RaceBestOut(race_type=row["race_type"], race_name=row["race_name"], result=row["result"], date=row["date"])
