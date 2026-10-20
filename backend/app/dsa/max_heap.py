from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class HeapItem(Generic[T]):
    priority: float
    tie_break: float
    sequence: int
    value: T

    @property
    def key(self) -> tuple[float, float, int]:
        return (self.priority, self.tie_break, -self.sequence)


class MaxHeap(Generic[T]):
    """Max-heap. Stable sequence ordering makes ties reproducible."""

    def __init__(self) -> None:
        self._items: list[HeapItem[T]] = []
        self._sequence = 0

    def insert(self, value: T, priority: float, tie_break: float = 0) -> None:
        priority = float(priority)
        tie_break = float(tie_break)
        if not isfinite(priority) or not isfinite(tie_break):
            raise ValueError("heap priority and tie-break values must be finite")
        item = HeapItem(priority, tie_break, self._sequence, value)
        self._sequence += 1
        self._items.append(item)
        self._sift_up(len(self._items) - 1)

    def peek(self) -> HeapItem[T]:
        if not self._items:
            raise IndexError("peek from empty heap")
        return self._items[0]

    def extract_max(self) -> HeapItem[T]:
        if not self._items:
            raise IndexError("extract_max from empty heap")
        maximum = self._items[0]
        tail = self._items.pop()
        if self._items:
            self._items[0] = tail
            self._sift_down(0)
        return maximum

    def snapshot(self) -> list[dict[str, object]]:
        return [{"value": item.value, "priority": item.priority} for item in self._items]

    def __len__(self) -> int:
        return len(self._items)

    def _sift_up(self, index: int) -> None:
        while index:
            parent = (index - 1) // 2
            if self._items[parent].key >= self._items[index].key:
                break
            self._items[parent], self._items[index] = self._items[index], self._items[parent]
            index = parent

    def _sift_down(self, index: int) -> None:
        size = len(self._items)
        while True:
            left, right, largest = 2 * index + 1, 2 * index + 2, index
            if left < size and self._items[left].key > self._items[largest].key:
                largest = left
            if right < size and self._items[right].key > self._items[largest].key:
                largest = right
            if largest == index:
                return
            self._items[index], self._items[largest] = self._items[largest], self._items[index]
            index = largest
