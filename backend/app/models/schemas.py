from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Rates(BaseModel):
    ns: int = Field(default=12, ge=0, le=40)
    ew: int = Field(default=28, ge=0, le=40)


class RoadTraffic(BaseModel):
    queue: int = Field(ge=0, le=100_000)
    maxWait: float = Field(default=0, ge=0, le=10_000_000)


class ScheduleRequest(BaseModel):
    north: RoadTraffic
    south: RoadTraffic
    east: RoadTraffic
    west: RoadTraffic
    lastServed: Literal["NS", "EW"] | None = None


class ExperimentRequest(BaseModel):
    seed: int = Field(default=12345, ge=0, le=2**32 - 1)
    duration: int = Field(default=300, ge=30, le=1800)
    rates: Rates = Field(default_factory=Rates)
