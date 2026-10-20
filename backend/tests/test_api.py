import pytest
from pydantic import ValidationError

from app.models.schemas import ExperimentRequest, ScheduleRequest
from app.routes.experiment import experiment
from app.routes.schedule import schedule
from main import health


def test_health_and_schedule_handler() -> None:
    assert health()["status"] == "ok"
    payload = ScheduleRequest(
        north={"queue": 9, "maxWait": 10}, south={"queue": 6, "maxWait": 5},
        east={"queue": 2, "maxWait": 2}, west={"queue": 1, "maxWait": 1},
    )
    result = schedule(payload)
    assert result["selectedPhase"] == "NS"
    assert len(result["heap"]) == 2


def test_schedule_schema_rejects_negative_queue() -> None:
    with pytest.raises(ValidationError):
        ScheduleRequest(
            north={"queue": -1}, south={"queue": 0}, east={"queue": 0}, west={"queue": 0},
        )


def test_experiment_handler_returns_measured_seeded_results() -> None:
    payload = ExperimentRequest(seed=42, duration=60, rates={"ns": 12, "ew": 28})
    result = experiment(payload)
    assert result["basis"] == "deterministic simulation with identical seeded arrivals"
    assert result["fixed"]["vehiclesDemanded"] == result["adaptive"]["vehiclesDemanded"]
    assert result["fixed"]["averageWaitingTime"] >= 0
