from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass
class MetricsAccumulator:
    """Canonical experiment metrics, sampled against simulated time."""

    vehicles_served: int = 0
    total_waiting_time: float = 0.0
    total_travel_time: float = 0.0
    maximum_queue_length: int = 0
    queue_vehicle_seconds: float = 0.0
    queue_sample_seconds: float = 0.0

    def record_queues(self, queues: dict[str, int], seconds: float) -> None:
        if not isfinite(seconds) or seconds < 0 or any(not isfinite(size) or size < 0 for size in queues.values()):
            raise ValueError("queue metrics must be non-negative")
        self.maximum_queue_length = max(self.maximum_queue_length, *queues.values(), 0)
        self.queue_vehicle_seconds += sum(queues.values()) * seconds
        self.queue_sample_seconds += seconds

    def record_completion(self, waiting_time: float, travel_time: float) -> None:
        if not isfinite(waiting_time) or not isfinite(travel_time) or waiting_time < 0 or travel_time < 0:
            raise ValueError("vehicle times must be non-negative")
        self.vehicles_served += 1
        self.total_waiting_time += waiting_time
        self.total_travel_time += travel_time

    def result(self, duration: int, demanded: int, remaining: int, controller: str) -> dict[str, object]:
        served = self.vehicles_served
        return {
            "controller": controller,
            "duration": duration,
            "vehiclesDemanded": demanded,
            "vehiclesServed": served,
            "averageWaitingTime": round(self.total_waiting_time / served, 3) if served else None,
            "averageTravelTime": round(self.total_travel_time / served, 3) if served else None,
            "maximumQueueLength": self.maximum_queue_length,
            "averageQueueLength": round(self.queue_vehicle_seconds / self.queue_sample_seconds, 3) if self.queue_sample_seconds else 0.0,
            "throughputPerMinute": round(served * 60 / duration, 3) if duration else 0.0,
            "remainingVehicles": remaining,
        }
