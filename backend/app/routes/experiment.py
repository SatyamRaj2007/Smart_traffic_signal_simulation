from __future__ import annotations

from fastapi import APIRouter, Query

try:
    from app.models.schemas import ExperimentRequest, Rates
    from app.services.experiment import run_comparison
except ModuleNotFoundError:
    from backend.app.models.schemas import ExperimentRequest, Rates
    from backend.app.services.experiment import run_comparison

router = APIRouter(prefix="/api", tags=["experiments"])
PRESETS = {
    "lowBalanced": {"label": "Low balanced", "ns": 8, "ew": 8},
    "mediumBalanced": {"label": "Medium balanced", "ns": 12, "ew": 12},
    "highBalanced": {"label": "High balanced", "ns": 28, "ew": 28},
    "nsHeavy": {"label": "NS heavy", "ns": 32, "ew": 8},
    "ewHeavy": {"label": "EW heavy", "ns": 8, "ew": 32},
}


@router.get("/scenarios")
def scenarios() -> dict[str, object]:
    return {"scenarios": PRESETS}


@router.post("/experiment")
def experiment(payload: ExperimentRequest) -> dict[str, object]:
    return run_comparison(payload.seed, payload.duration, payload.rates.model_dump())


@router.get("/comparison")
def comparison(
    ns: int = Query(default=12, ge=0, le=40),
    ew: int = Query(default=28, ge=0, le=40),
    seed: int = Query(default=12345, ge=0, le=2**32 - 1),
    duration: int = Query(default=300, ge=30, le=1800),
) -> dict[str, object]:
    payload = ExperimentRequest(seed=seed, duration=duration, rates=Rates(ns=ns, ew=ew))
    return experiment(payload)
