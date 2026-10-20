from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Literal

Phase = Literal["NS", "EW"]
SignalState = Literal["NS_GREEN", "NS_YELLOW", "ALL_RED_TO_EW", "EW_GREEN", "EW_YELLOW", "ALL_RED_TO_NS"]

TRANSITIONS: dict[str, str] = {
    "NS_GREEN": "NS_YELLOW",
    "NS_YELLOW": "ALL_RED_TO_EW",
    "ALL_RED_TO_EW": "EW_GREEN",
    "EW_GREEN": "EW_YELLOW",
    "EW_YELLOW": "ALL_RED_TO_NS",
    "ALL_RED_TO_NS": "NS_GREEN",
}


@dataclass
class SignalStateMachine:
    state: SignalState = "NS_GREEN"
    target: Phase = "EW"
    yellow_seconds: float = 3.0
    all_red_seconds: float = 1.0
    elapsed_in_state: float = 0.0

    def __post_init__(self) -> None:
        for name, value in (("yellow_seconds", self.yellow_seconds), ("all_red_seconds", self.all_red_seconds)):
            if not isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be a finite positive duration")

    @property
    def green_phase(self) -> Phase | None:
        if self.state == "NS_GREEN":
            return "NS"
        if self.state == "EW_GREEN":
            return "EW"
        return None

    def request_phase(self, phase: Phase) -> bool:
        """Keep current green or begin a safe clearance to the requested phase."""
        if phase not in ("NS", "EW"):
            raise ValueError("phase must be NS or EW")
        if self.green_phase == phase:
            return False
        if self.state not in ("NS_GREEN", "EW_GREEN"):
            raise RuntimeError("cannot request a phase during a transition")
        self.target = phase
        self.state = "NS_YELLOW" if self.green_phase == "NS" else "EW_YELLOW"
        self.elapsed_in_state = 0.0
        return True

    def advance(self, seconds: float) -> list[str]:
        if not isfinite(seconds) or seconds < 0:
            raise ValueError("seconds must be finite and non-negative")
        events: list[str] = []
        self.elapsed_in_state += seconds
        while True:
            duration = self.yellow_seconds if self.state in ("NS_YELLOW", "EW_YELLOW") else self.all_red_seconds if self.state.startswith("ALL_RED") else float("inf")
            if self.elapsed_in_state + 1e-9 < duration:
                break
            self.elapsed_in_state -= duration
            next_state = TRANSITIONS[self.state]
            if next_state in ("NS_GREEN", "EW_GREEN") and next_state[:2] != self.target:
                # Continue through the opposite clearance when target matches that phase instead.
                if self.target == "EW" and next_state == "NS_GREEN":
                    self.state = "NS_YELLOW"
                    events.append(self.state)
                    continue
                if self.target == "NS" and next_state == "EW_GREEN":
                    self.state = "EW_YELLOW"
                    events.append(self.state)
                    continue
            self.state = next_state  # type: ignore[assignment]
            events.append(self.state)
            if self.green_phase is not None:
                break
        return events
