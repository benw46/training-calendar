import json
import re

from pydantic import BaseModel, field_validator
from typing import Optional
from enum import Enum


class Sport(str, Enum):
    swim = "swim"
    bike = "bike"
    run = "run"
    strength = "strength"
    other = "other"
    note = "note"
    event = "event"


class GymExercise(BaseModel):
    name: str
    sets: Optional[int] = None
    reps: Optional[int] = None
    weight: Optional[int] = None  # kg
    bodyweight: bool = False


class WorkoutBase(BaseModel):
    date: str  # YYYY-MM-DD
    sport: Sport
    name: str
    planned_duration_minutes: Optional[int] = None
    planned_distance_km: Optional[float] = None
    actual_duration_minutes: Optional[int] = None
    actual_distance_km: Optional[float] = None
    garmin_activity_id: Optional[str] = None
    description: Optional[str] = None
    is_brick: bool = False
    gym_exercises: Optional[list[GymExercise]] = None


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
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_brick: Optional[bool] = None
    gym_exercises: Optional[list[GymExercise]] = None


class WorkoutOut(WorkoutBase):
    id: int
    sort_order: Optional[int] = None

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
            garmin_activity_id=row["garmin_activity_id"],
            description=row["description"],
            sort_order=row["sort_order"],
            is_brick=bool(row["is_brick"]),
            gym_exercises=json.loads(row["gym_exercises"]) if row["gym_exercises"] else None,
        )


class RaceType(str, Enum):
    half_marathon = "half_marathon"
    marathon = "marathon"
    ironman = "ironman"


RACE_TIME_PATTERN = re.compile(r"^\d{1,2}:\d{2}:\d{2}$")


class RaceBestUpdate(BaseModel):
    race_name: Optional[str] = None
    result: Optional[str] = None  # hh:mm:ss, or None to clear
    date: Optional[str] = None    # YYYY-MM-DD, or None to clear

    @field_validator("result")
    @classmethod
    def validate_result(cls, v):
        if v is not None and not RACE_TIME_PATTERN.match(v):
            raise ValueError("result must be in hh:mm:ss format")
        return v


class RaceBestOut(BaseModel):
    race_type: RaceType
    race_name: Optional[str] = None
    result: Optional[str] = None
    date: Optional[str] = None
