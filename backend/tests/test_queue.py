import pytest

from app.dsa.queue import Queue


def test_fifo_front_size_and_empty() -> None:
    queue: Queue[str] = Queue()
    assert queue.is_empty()
    assert queue.size() == 0
    with pytest.raises(IndexError):
        queue.dequeue()
    queue.enqueue("A")
    queue.enqueue("B")
    queue.enqueue("C")
    assert queue.front() == "A"
    assert queue.dequeue() == "A"
    assert queue.front() == "B"
    assert queue.size() == 2
    assert list(queue) == ["B", "C"]


def test_queue_compaction_preserves_order() -> None:
    queue: Queue[int] = Queue()
    for value in range(1000):
        queue.enqueue(value)
    assert [queue.dequeue() for _ in range(800)] == list(range(800))
    assert queue.size() == 200
    assert queue.dequeue() == 800


def test_queue_repeated_interleaving_preserves_fifo_and_size() -> None:
    queue: Queue[int] = Queue()
    expected: list[int] = []
    for value in range(10_000):
        queue.enqueue(value)
        expected.append(value)
        if value % 3 == 0:
            assert queue.dequeue() == expected.pop(0)
        assert queue.size() == len(expected)
    assert list(queue) == expected
