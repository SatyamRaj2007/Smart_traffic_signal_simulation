import pytest

from app.dsa.max_heap import MaxHeap


def test_heap_insert_peek_extract_and_duplicates() -> None:
    heap: MaxHeap[str] = MaxHeap()
    for value, priority in (("a", 10), ("b", 50), ("c", 20), ("d", 40), ("e", 50)):
        heap.insert(value, priority)
    assert heap.peek().priority == 50
    ordered = [heap.extract_max().priority for _ in range(5)]
    assert ordered == [50, 50, 40, 20, 10]
    with pytest.raises(IndexError):
        heap.extract_max()


def test_heap_stable_tie_breaking() -> None:
    heap: MaxHeap[str] = MaxHeap()
    heap.insert("earlier", 2)
    heap.insert("later", 2)
    assert heap.extract_max().value == "earlier"


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_heap_rejects_non_finite_ordering_values(value: float) -> None:
    heap: MaxHeap[str] = MaxHeap()
    with pytest.raises(ValueError):
        heap.insert("invalid", value)
    with pytest.raises(ValueError):
        heap.insert("invalid", 1, value)


def test_heap_randomized_extraction_is_non_increasing() -> None:
    import random

    rng = random.Random(19)
    values = [rng.randint(-1000, 1000) for _ in range(1_000)]
    heap: MaxHeap[int] = MaxHeap()
    for value in values:
        heap.insert(value, value)
    extracted = [heap.extract_max().priority for _ in values]
    assert extracted == sorted(values, reverse=True)
