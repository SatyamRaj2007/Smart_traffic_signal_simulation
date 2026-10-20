import pytest

from app.dsa.scheduler import AdaptiveScheduler, SchedulerConfig
from app.services.experiment import make_arrival_schedule, run_comparison, run_controller


def test_queue_pressure_selects_ns_and_bounded_green() -> None:
    scheduler = AdaptiveScheduler()
    decision = scheduler.decide({
        "north": {"queue": 20, "maxWait": 5}, "south": {"queue": 8, "maxWait": 5},
        "east": {"queue": 1, "maxWait": 0}, "west": {"queue": 1, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "NS"
    assert 8 <= decision["greenDuration"] <= 30


def test_long_wait_is_in_priority_and_can_win() -> None:
    scheduler = AdaptiveScheduler(SchedulerConfig(wait_weight=0.2, max_wait_threshold=45))
    decision = scheduler.decide({
        "north": {"queue": 20, "maxWait": 0}, "south": {"queue": 0, "maxWait": 0},
        "east": {"queue": 0, "maxWait": 100}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "EW"
    assert decision["candidateScores"]["EW"]["waitingScore"] == 20


@pytest.mark.parametrize(("wait", "urgent"), [(44.9, False), (45.0, True), (45.1, True)])
def test_fairness_threshold_boundary_is_explicit(wait: float, urgent: bool) -> None:
    decision = AdaptiveScheduler().decide({
        "north": {"queue": 0, "maxWait": wait}, "south": {"queue": 0, "maxWait": 0},
        "east": {"queue": 1500, "maxWait": 0}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["candidateScores"]["NS"]["urgent"] is urgent
    assert decision["selectedPhase"] == ("NS" if urgent else "EW")


@pytest.mark.parametrize(("queue", "duration"), [(0, 8), (10, 16), (100, 30)])
def test_dynamic_green_duration_uses_documented_clamps(queue: int, duration: float) -> None:
    decision = AdaptiveScheduler().decide({
        "north": {"queue": queue, "maxWait": 0}, "south": {"queue": 0, "maxWait": 0},
        "east": {"queue": 0, "maxWait": 0}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "NS"
    assert decision["greenDuration"] == duration


def test_priority_aggregates_axis_queues_and_wait_score() -> None:
    decision = AdaptiveScheduler().decide({
        "north": {"queue": 8, "maxWait": 20}, "south": {"queue": 2, "maxWait": 10},
        "east": {"queue": 3, "maxWait": 0}, "west": {"queue": 1, "maxWait": 0},
    })
    assert decision["candidateScores"]["NS"]["queueScore"] == 10
    assert decision["candidateScores"]["NS"]["waitingScore"] == 4
    assert decision["candidateScores"]["NS"]["priority"] == 14


def test_empty_traffic_is_deterministic() -> None:
    scheduler = AdaptiveScheduler()
    roads = {name: {"queue": 0, "maxWait": 0} for name in ("north", "south", "east", "west")}
    assert scheduler.decide(roads)["selectedPhase"] == "NS"
    assert scheduler.decide(roads)["selectedPhase"] == "EW"


def test_seeded_arrivals_and_full_results_repeat() -> None:
    rates = {"ns": 18, "ew": 30}
    assert make_arrival_schedule(100, 120, rates) == make_arrival_schedule(100, 120, rates)
    first = run_comparison(100, 120, rates)
    second = run_comparison(100, 120, rates)
    assert first == second
    assert first["fixed"]["vehiclesDemanded"] == first["adaptive"]["vehiclesDemanded"]
    assert first["arrivalScheduleHash"] == second["arrivalScheduleHash"]
    assert first["fixed"]["droppedDemand"] == 0


def test_urgent_wait_gets_protection_even_with_a_large_competing_queue() -> None:
    scheduler = AdaptiveScheduler(SchedulerConfig(max_wait_threshold=45))
    decision = scheduler.decide({
        "north": {"queue": 150, "maxWait": 0}, "south": {"queue": 150, "maxWait": 0},
        "east": {"queue": 0, "maxWait": 46}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "EW"


def test_wait_threshold_cannot_be_overridden_by_api_maximum_queue() -> None:
    scheduler = AdaptiveScheduler(SchedulerConfig(max_wait_threshold=45))
    decision = scheduler.decide({
        "north": {"queue": 100_000, "maxWait": 0}, "south": {"queue": 100_000, "maxWait": 0},
        "east": {"queue": 0, "maxWait": 45}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "EW"
    assert decision["candidateScores"]["EW"]["starvationBoost"] > 0


def test_oldest_phase_wins_when_both_phases_exceed_wait_threshold() -> None:
    scheduler = AdaptiveScheduler(SchedulerConfig(max_wait_threshold=45))
    decision = scheduler.decide({
        "north": {"queue": 100_000, "maxWait": 46}, "south": {"queue": 100_000, "maxWait": 45},
        "east": {"queue": 0, "maxWait": 80}, "west": {"queue": 0, "maxWait": 0},
    })
    assert decision["selectedPhase"] == "EW"


def test_empty_and_high_traffic_experiments_have_valid_metrics() -> None:
    empty = run_comparison(5, 60, {"ns": 0, "ew": 0})
    assert empty["fixed"]["vehiclesServed"] == 0
    assert empty["adaptive"]["averageQueueLength"] == 0
    assert empty["adaptive"]["averageWaitingTime"] is None
    assert empty["adaptive"]["averageTravelTime"] is None
    busy = run_comparison(5, 180, {"ns": 40, "ew": 40})
    for controller in (busy["fixed"], busy["adaptive"]):
        assert 0 <= controller["vehiclesServed"] <= controller["vehiclesDemanded"]
        assert controller["maximumQueueLength"] >= 0
        assert controller["averageWaitingTime"] >= 0


def test_experiment_wait_excludes_approach_travel_when_green_is_available() -> None:
    schedule = [(0.0, "north", 1)]
    result = run_controller("fixed", schedule, 20)
    assert result["vehiclesServed"] == 1
    assert result["averageWaitingTime"] == 0
    assert result["averageTravelTime"] > 3


@pytest.mark.parametrize("kwargs", [
    {"min_green": 31, "max_green": 30},
    {"wait_weight": -0.1},
    {"queue_time_factor": float("inf")},
    {"max_wait_threshold": 0},
])
def test_invalid_scheduler_configuration_is_rejected(kwargs: dict[str, float]) -> None:
    with pytest.raises(ValueError):
        SchedulerConfig(**kwargs)
