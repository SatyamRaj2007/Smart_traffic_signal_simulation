from __future__ import annotations

from fastapi import APIRouter

try:
    from app.dsa.scheduler import AdaptiveScheduler
    from app.models.schemas import ScheduleRequest
except ModuleNotFoundError:
    from backend.app.dsa.scheduler import AdaptiveScheduler
    from backend.app.models.schemas import ScheduleRequest

router = APIRouter(prefix="/api", tags=["scheduler"])


@router.post("/schedule")
def schedule(payload: ScheduleRequest) -> dict[str, object]:
    roads = {name: getattr(payload, name).model_dump() for name in ("north", "south", "east", "west")}
    scheduler = AdaptiveScheduler()
    scheduler.last_served = payload.lastServed
    return {**scheduler.decide(roads), "runId": payload.runId, "decisionId": payload.decisionId}
