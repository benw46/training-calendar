from fastapi import APIRouter, HTTPException
from database import get_conn
from models import RaceBestUpdate, RaceBestOut, RaceType

router = APIRouter(prefix="/race-bests", tags=["race-bests"])


@router.get("/", response_model=list[RaceBestOut])
def list_race_bests():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT race_type, race_name, result, date FROM race_bests ORDER BY rowid"
        ).fetchall()
    return [
        RaceBestOut(race_type=row["race_type"], race_name=row["race_name"], result=row["result"], date=row["date"])
        for row in rows
    ]


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
