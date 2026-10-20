import pytest

from app.dsa.signal_graph import SignalStateMachine


def test_safe_transition_ns_to_ew() -> None:
    machine = SignalStateMachine()
    assert machine.request_phase("EW")
    assert machine.state == "NS_YELLOW"
    machine.advance(3)
    assert machine.state == "ALL_RED_TO_EW"
    assert machine.green_phase is None
    machine.advance(1)
    assert machine.state == "EW_GREEN"
    assert machine.green_phase == "EW"


def test_safe_transition_ew_to_ns() -> None:
    machine = SignalStateMachine(state="EW_GREEN", target="NS")
    assert machine.request_phase("NS")
    machine.advance(3)
    assert machine.state == "ALL_RED_TO_NS"
    assert machine.green_phase is None
    machine.advance(1)
    assert machine.state == "NS_GREEN"
    assert machine.green_phase == "NS"


def test_keeping_current_phase_does_not_force_clearance() -> None:
    machine = SignalStateMachine()
    assert not machine.request_phase("NS")
    assert machine.state == "NS_GREEN"


def test_invalid_phase_is_rejected() -> None:
    machine = SignalStateMachine()
    with pytest.raises(ValueError):
        machine.request_phase("NORTH")  # type: ignore[arg-type]


@pytest.mark.parametrize("duration", [-1, float("nan"), float("inf")])
def test_invalid_clearance_durations_are_rejected(duration: float) -> None:
    with pytest.raises(ValueError):
        SignalStateMachine(yellow_seconds=duration)


@pytest.mark.parametrize("seconds", [-1, float("nan"), float("inf")])
def test_invalid_advance_time_is_rejected(seconds: float) -> None:
    with pytest.raises(ValueError):
        SignalStateMachine().advance(seconds)
