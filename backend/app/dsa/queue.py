from __future__ import annotations

from typing import Generic, TypeVar

T = TypeVar("T")


class Queue(Generic[T]):
    """FIFO queue backed by an array and head index (amortized O(1) ops)."""

    def __init__(self) -> None:
        self._items: list[T | None] = []
        self._head = 0

    def enqueue(self, item: T) -> None:
        self._items.append(item)

    def dequeue(self) -> T:
        if self.is_empty():
            raise IndexError("dequeue from empty queue")
        item = self._items[self._head]
        self._items[self._head] = None
        self._head += 1
        if self._head >= 64 and self._head * 2 >= len(self._items):
            self._items = self._items[self._head :]
            self._head = 0
        return item  # type: ignore[return-value]

    def front(self) -> T:
        if self.is_empty():
            raise IndexError("front from empty queue")
        return self._items[self._head]  # type: ignore[return-value]

    def is_empty(self) -> bool:
        return self._head >= len(self._items)

    def size(self) -> int:
        return len(self._items) - self._head

    def __len__(self) -> int:
        return self.size()

    def __iter__(self):
        return iter(self._items[self._head :])
