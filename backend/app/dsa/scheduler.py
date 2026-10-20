from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Literal

from .max_heap import MaxHeap

Phase = Literal["NS", "EW"]
RoadState = dict[str, dict[str, float | int]]


@dataclass(frozen=True)
class SchedulerConfig:
    wait_weight: float = 0.2
    max_wait_threshold: float = 45.0
    min_green: float = 8.0
    max_green: float = 30.0
    base_green: float = 8.0
    queue_time_factor: float = 0.8

    def __post_init__(self) -> None:
        values = {
            "wait_weight": self.wait_weight,
            "max_wait_threshold": self.max_wait_threshold,
            "min_green": self.min_green,
            "max_green": self.max_green,
            "base_green": self.base_green,
            "queue_time_factor": self.queue_time_factor,
        }
        if any(not isfinite(value) for value in values.values()):
            raise ValueError("scheduler configuration values must be finite")
        if self.wait_weight < 0 or self.queue_time_factor < 0:
            raise ValueError("scheduler weights cannot be negative")
        if self.max_wait_threshold <= 0:
            raise ValueError("max_wait_threshold must be positive")
        if self.min_green <= 0 or self.max_green < self.min_green:
            raise ValueError("green durations must be positive and min_green <= max_green")
        if self.base_green < 0:
            raise ValueError("base_green cannot be negative")


class AdaptiveScheduler:
    def __init__(self, config: SchedulerConfig | None = None) -> None:
        self.config = config or SchedulerConfig()
        self.last_served: Phase | None = None

    def decide(self, roads: RoadState) -> dict[str, object]:
        normalized = {name: roads.get(name, {"queue": 0, "maxWait": 0}) for name in ("north", "south", "east", "west")}
        scores: dict[Phase, dict[str, float]] = {}
        for phase, directions in (("NS", ("north", "south")), ("EW", ("east", "west"))):
            queue_score = sum(float(normalized[d].get("queue", 0)) for d in directions)
            wait_score = max((float(normalized[d].get("maxWait", 0)) for d in directions), default=0.0)
            urgent = wait_score >= self.config.max_wait_threshold
            waiting_score = self.config.wait_weight * wait_score
            scores[phase] = {
                "queueScore": queue_score,
                "waitingScore": waiting_score,
                "maxWait": wait_score,
                "priority": queue_score + waiting_score,
                "starvationBoost": 0.0,
                "urgent": urgent,
            }

        urgent_phases = [phase for phase in ("NS", "EW") if scores[phase]["urgent"]]
        if len(urgent_phases) == 1:
            urgent_phase = urgent_phases[0]
            other_phase = "EW" if urgent_phase == "NS" else "NS"
            required_priority = scores[other_phase]["priority"] + 1.0
            scores[urgent_phase]["starvationBoost"] = max(0.0, required_priority - scores[urgent_phase]["priority"])
        elif len(urgent_phases) == 2:
            # If both phases are overdue, prioritize the oldest wait so the threshold
            # continues to provide a bounded fairness signal under extreme demand.
            older_phase = max(urgent_phases, key=lambda phase: scores[phase]["maxWait"])
            other_phase = "EW" if older_phase == "NS" else "NS"
            required_priority = scores[other_phase]["priority"] + 1.0
            scores[older_phase]["starvationBoost"] = max(0.0, required_priority - scores[older_phase]["priority"])

        for phase in ("NS", "EW"):
            scores[phase]["priority"] += scores[phase]["starvationBoost"]

        heap: MaxHeap[Phase] = MaxHeap()
        for phase in ("NS", "EW"):
            # Longest-waiting tie-break, then prefer the phase not served last; final order is stable NS/EW.
            tie = scores[phase]["maxWait"]
            if phase != self.last_served:
                tie += 1e-6
            heap.insert(phase, scores[phase]["priority"], tie)
        heap_state = heap.snapshot()
        selected = heap.extract_max().value
        self.last_served = selected
        phase_queue = scores[selected]["queueScore"]
        green = min(self.config.max_green, max(self.config.min_green, self.config.base_green + self.config.queue_time_factor * phase_queue))
        return {
            "selectedPhase": selected,
            "priority": scores[selected]["priority"],
            "greenDuration": green,
            "queueScore": scores[selected]["queueScore"],
            "waitingScore": scores[selected]["waitingScore"],
            "candidateScores": scores,
            "heap": heap_state,
            "tieBreak": "priority, urgent max-wait, longest wait, not-last-served, stable phase order",
        }
