import pytest

from app.services.metrics import MetricsAccumulator


def test_metrics_are_time_weighted_and_average_completed_vehicles() -> None:
    metrics = MetricsAccumulator()
    metrics.record_queues({"north": 2, "south": 0, "east": 1, "west": 0}, 2)
    metrics.record_queues({"north": 0, "south": 1, "east": 0, "west": 0}, 1)
    metrics.record_completion(4, 7)
    metrics.record_completion(2, 5)
    result = metrics.result(duration=60, demanded=4, remaining=2, controller="adaptive")
    assert result["averageQueueLength"] == 2.333
    assert result["maximumQueueLength"] == 2
    assert result["averageWaitingTime"] == 3
    assert result["averageTravelTime"] == 6
    assert result["throughputPerMinute"] == 2


def test_metrics_reject_negative_inputs_and_handle_no_completions() -> None:
    metrics = MetricsAccumulator()
    with pytest.raises(ValueError):
        metrics.record_queues({"north": -1}, 1)
    with pytest.raises(ValueError):
        metrics.record_completion(-1, 0)
    result = metrics.result(duration=0, demanded=0, remaining=0, controller="fixed")
    assert result["averageWaitingTime"] is None
    assert result["averageTravelTime"] is None
    assert result["throughputPerMinute"] == 0


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_metrics_reject_non_finite_inputs(value: float) -> None:
    metrics = MetricsAccumulator()
    with pytest.raises(ValueError):
        metrics.record_queues({"north": 0}, value)
    with pytest.raises(ValueError):
        metrics.record_completion(value, 0)
    with pytest.raises(ValueError):
        metrics.record_completion(0, value)
