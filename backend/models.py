from pydantic import BaseModel
from typing import Optional
from enum import Enum


class Sport(str, Enum):
    swim = "swim"
    bike = "bike"
    run = "run"
    strength = "strength"
    other = "other"


class WorkoutBase(BaseModel):
    date: str  # YYYY-MM-DD
    sport: Sport
    name: str
    planned_duration_minutes: Optional[int] = None
    planned_distance_km: Optional[float] = None
    actual_duration_minutes: Optional[int] = None
    actual_distance_km: Optional[float] = None
    completed: bool = False


class WorkoutCreate(WorkoutBase):
    pass


class WorkoutUpdate(BaseModel):
    date: Optional[str] = None
    sport: Optional[Sport] = None
    name: Optional[str] = None
    planned_duration_minutes: Optional[int] = None
    planned_distance_km: Optional[float] = None
    actual_duration_minutes: Optional[int] = None
    actual_distance_km: Optional[float] = None
    completed: Optional[bool] = None


class WorkoutOut(WorkoutBase):
    id: int

    @classmethod
    def from_row(cls, row) -> "WorkoutOut":
        return cls(
            id=row["id"],
            date=row["date"],
            sport=row["sport"],
            name=row["name"],
            planned_duration_minutes=row["planned_duration_minutes"],
            planned_distance_km=row["planned_distance_km"],
            actual_duration_minutes=row["actual_duration_minutes"],
            actual_distance_km=row["actual_distance_km"],
            completed=bool(row["completed"]),
        )
