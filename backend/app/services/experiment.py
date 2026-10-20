from __future__ import annotations

import random
import hashlib
from dataclasses import dataclass
from typing import Literal

try:
    from app.dsa.queue import Queue
    from app.dsa.scheduler import AdaptiveScheduler, SchedulerConfig
    from app.dsa.signal_graph import SignalStateMachine
    from app.services.metrics import MetricsAccumulator
except ModuleNotFoundError:
    from backend.app.dsa.queue import Queue
    from backend.app.dsa.scheduler import AdaptiveScheduler, SchedulerConfig
    from backend.app.dsa.signal_graph import SignalStateMachine
    from backend.app.services.metrics import MetricsAccumulator

Direction = Literal["north", "south", "east", "west"]
Phase = Literal["NS", "EW"]
DIRECTIONS: tuple[Direction, ...] = ("north", "south", "east", "west")
PHASE_DIRECTIONS: dict[Phase, tuple[Direction, Direction]] = {"NS": ("north", "south"), "EW": ("east", "west")}


@dataclass
class Vehicle:
    id: int
    spawned_at: float
    queued_at: float
    ready_at: float
    waiting: float = 0.0


def make_arrival_schedule(seed: int, duration: int, rates: dict[str, int]) -> list[tuple[float, Direction, int]]:
    """Generate one seeded Poisson arrival schedule, shared by both controllers."""
    rng = random.Random(seed)
    arrivals: list[tuple[float, Direction, int]] = []
    vehicle_id = 0
    for direction in DIRECTIONS:
        axis = "ns" if direction in ("north", "south") else "ew"
        rate_per_second = max(0, rates[axis]) / 120.0  # axis rate split across two approaches
        if rate_per_second <= 0:
            continue
        time = rng.expovariate(rate_per_second)
        while time < duration:
            vehicle_id += 1
            arrivals.append((time, direction, vehicle_id))
            time += rng.expovariate(rate_per_second)
    arrivals.sort(key=lambda event: (event[0], DIRECTIONS.index(event[1]), event[2]))
    return arrivals


def run_controller(
    controller: Literal["fixed", "adaptive"],
    schedule: list[tuple[float, Direction, int]],
    duration: int,
) -> dict[str, object]:
    roads: dict[Direction, Queue[Vehicle]] = {direction: Queue() for direction in DIRECTIONS}
    machine = SignalStateMachine()
    scheduler = AdaptiveScheduler(SchedulerConfig())
    active_phase: Phase = "NS"
    green_remaining = 20.0 if controller == "fixed" else 8.0
    pending_green = green_remaining
    arrival_index = 0
    metrics = MetricsAccumulator()
    service_ready = {direction: 0.0 for direction in DIRECTIONS}
    crossing: list[tuple[Vehicle, float]] = []
    decisions: list[dict[str, object]] = []

    for second in range(duration):
        while arrival_index < len(schedule) and schedule[arrival_index][0] <= second:
            arrival_time, direction, vehicle_id = schedule[arrival_index]
            roads[direction].enqueue(Vehicle(vehicle_id, arrival_time, arrival_time, arrival_time + 3.0))
            arrival_index += 1

        if machine.green_phase is not None and green_remaining <= 0:
            if controller == "fixed":
                selected: Phase = "EW" if machine.green_phase == "NS" else "NS"
                pending_green = 20.0
            else:
                road_state = {
                    name: {"queue": len(roads[name]), "maxWait": max((second - vehicle.queued_at for vehicle in roads[name]), default=0.0)}
                    for name in DIRECTIONS
                }
                decision = scheduler.decide(road_state)
                selected = decision["selectedPhase"]  # type: ignore[assignment]
                pending_green = float(decision["greenDuration"])
                decisions.append({"at": second, **decision})
            changed = machine.request_phase(selected)
            if not changed:
                green_remaining = pending_green

        previous_state = machine.state
        events = machine.advance(1.0)
        if machine.green_phase is not None and previous_state != machine.state:
            green_remaining = pending_green

        for direction in DIRECTIONS:
            queue = roads[direction]
            for vehicle in queue:
                vehicle.waiting += 1.0
        metrics.record_queues({direction: len(roads[direction]) for direction in DIRECTIONS}, 1.0)

        green = machine.green_phase
        if green:
            for direction in PHASE_DIRECTIONS[green]:
                if second >= service_ready[direction] and not roads[direction].is_empty() and roads[direction].front().ready_at <= second:
                    vehicle = roads[direction].dequeue()
                    crossing.append((vehicle, second + 1 + (0.51 / 0.19)))
                    service_ready[direction] = second + 2.4
        still_crossing: list[tuple[Vehicle, float]] = []
        for vehicle, exit_time in crossing:
            if exit_time <= second + 1:
                metrics.record_completion(vehicle.waiting, exit_time - vehicle.spawned_at)
            else:
                still_crossing.append((vehicle, exit_time))
        crossing = still_crossing
        if green:
            green_remaining -= 1.0

    result = metrics.result(
        duration, len(schedule),
        sum(len(roads[d]) for d in DIRECTIONS) + len(crossing), controller,
    )
    result["decisions"] = decisions
    return result


def run_comparison(seed: int, duration: int, rates: dict[str, int]) -> dict[str, object]:
    schedule = make_arrival_schedule(seed, duration, rates)
    fixed = run_controller("fixed", schedule, duration)
    adaptive = run_controller("adaptive", schedule, duration)
    return {
        "seed": seed,
        "duration": duration,
        "rates": rates,
        "arrivalScheduleHash": hashlib.sha256(repr(schedule).encode("utf-8")).hexdigest()[:16],
        "basis": "deterministic simulation with identical seeded arrivals",
        "fixed": fixed,
        "adaptive": adaptive,
    }
