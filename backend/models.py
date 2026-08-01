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
    # Timed exercises (planks, holds) count seconds rather than reps, so
    # `reps` carries total seconds whenever `is_time` is set — one integer
    # either way. Rows written before the flag existed simply default to False.
    reps: Optional[int] = None
    weight: Optional[int] = None  # kg
    bodyweight: bool = False
    is_time: bool = False
    # User-toggled "Done" checkbox, one per exercise row.
    done: bool = False


# A Run/Bike/Swim's structured-interval breakdown (e.g. "6 x Strides,
# 0.1km") — same per-exercise-row idea as GymExercise, but reps/sets/weight/
# bodyweight/time don't apply to a distance-based interval, so it only
# carries a distance alongside the shared name/reps fields. One shared shape
# across all three sports, but stored per-sport (run_exercises/
# bike_exercises/swim_exercises below) since a workout is only ever one
# sport at a time — same reasoning as gym_exercises being its own column.
class IntervalExercise(BaseModel):
    name: str
    distance: Optional[float] = None  # km
    reps: Optional[int] = None
    # User-toggled "Done" checkbox, one per exercise row.
    done: bool = False


# One entry per kilometre of a run or ride, sourced from Garmin's splits
# endpoint — see sync_garmin.py. Pace/speed isn't stored; the frontend
# derives it from duration_s/distance_km the same way it derives the overall
# figure. Shared shape across sports (like IntervalExercise above), stored
# per-sport as run_splits/bike_splits since a workout is only ever one sport.
class DistanceSplit(BaseModel):
    distance_km: float
    duration_s: int
    elevation_net_m: Optional[float] = None


class WorkoutBase(BaseModel):
    date: str  # YYYY-MM-DD
    sport: Sport
    name: str
    planned_duration_minutes: Optional[int] = None
    planned_distance_km: Optional[float] = None
    actual_duration_minutes: Optional[int] = None
    actual_distance_km: Optional[float] = None
    garmin_activity_id: Optional[str] = None
    elevation_gain_m: Optional[float] = None
    run_splits: Optional[list[DistanceSplit]] = None
    bike_splits: Optional[list[DistanceSplit]] = None
    description: Optional[str] = None
    is_brick: bool = False
    gym_exercises: Optional[list[GymExercise]] = None
    run_exercises: Optional[list[IntervalExercise]] = None
    bike_exercises: Optional[list[IntervalExercise]] = None
    swim_exercises: Optional[list[IntervalExercise]] = None


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
    run_exercises: Optional[list[IntervalExercise]] = None
    bike_exercises: Optional[list[IntervalExercise]] = None
    swim_exercises: Optional[list[IntervalExercise]] = None


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
            elevation_gain_m=row["elevation_gain_m"],
            run_splits=json.loads(row["run_splits"]) if row["run_splits"] else None,
            bike_splits=json.loads(row["bike_splits"]) if row["bike_splits"] else None,
            description=row["description"],
            sort_order=row["sort_order"],
            is_brick=bool(row["is_brick"]),
            gym_exercises=json.loads(row["gym_exercises"]) if row["gym_exercises"] else None,
            run_exercises=json.loads(row["run_exercises"]) if row["run_exercises"] else None,
            bike_exercises=json.loads(row["bike_exercises"]) if row["bike_exercises"] else None,
            swim_exercises=json.loads(row["swim_exercises"]) if row["swim_exercises"] else None,
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


class RaceBestsReorder(BaseModel):
    # The race types in the desired display order; each row's sort_order is set
    # to its index in this list.
    order: list[RaceType]
