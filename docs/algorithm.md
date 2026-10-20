# DSA and Signal-Control Algorithm

## Lane queues and road map

Each direction owns a FIFO queue. New simulated vehicles enter at the rear; the oldest vehicle is served first. Both the Python and JavaScript queues use an array with a head index and occasional compaction, so enqueue, front, and dequeue are amortized O(1). The Python scheduler receives a road-name dictionary for average O(1) lookups.

## Adaptive phase selection

The only candidates are the compatible movement groups `NS = north + south` and `EW = east + west`. For each phase:

```text
queueScore   = sum of the two approach queue lengths
waitingScore = 0.2 × oldest vehicle's time in the modeled lane queue
priority     = queueScore + waitingScore
```

When a phase's oldest vehicle reaches 45 seconds, it is promoted above a non-urgent competing phase even under the API's maximum queue bounds. If both phases are overdue, the older wait receives the promotion. A Max Heap selects the largest score. Remaining ties use longest wait, then the phase not served last, then stable NS/EW insertion order. The two-candidate heap is an educational implementation; its purpose is to demonstrate a Priority Queue and support a larger candidate set later.

The selected phase's green duration is:

```text
clamp(8 + 0.8 × selected phase queue, minimum 8, maximum 30) seconds
```

Scheduler configuration rejects non-finite values, negative weights, invalid wait thresholds, and green bounds where the minimum exceeds the maximum. The Max Heap also rejects non-finite priorities so NaN/Infinity cannot silently invalidate its ordering.

The scheduler returns the candidate scores and heap snapshot so the UI can show its reasoning. It requests either an extension of the current phase or a different phase; it never directly activates signal lamps.

## Signal transition graph

```text
NS_GREEN → NS_YELLOW → ALL_RED_TO_EW → EW_GREEN
EW_GREEN → EW_YELLOW → ALL_RED_TO_NS → NS_GREEN
```

The state machine is the only authority for signal changes. NS and EW green cannot coexist. Yellow lasts 3 seconds and all-red clearance lasts 1 second. A scheduler request for the current phase extends the green without entering a conflicting state.

## Fixed and adaptive experiment

The fixed controller alternates NS and EW with 20-second greens. The adaptive controller requests phase and green-time decisions from FastAPI at decision boundaries. For experiments, Python generates one seeded exponential inter-arrival schedule and feeds that exact schedule to both controllers. The experiment records completed-vehicle wait and travel time, time-weighted total queue, maximum per-approach queue, throughput, and vehicles served.

## Complexity

Let `V` be active vehicles and `P` be candidate phases:

| Operation | Complexity |
|---|---:|
| Queue enqueue / front / dequeue | Amortized O(1) |
| Road dictionary lookup | Average O(1) |
| Max Heap insert / extract max | O(log P) |
| Max Heap peek | O(1) |
| Vehicle update and Canvas draw | O(V) |
| Simulation update and phase scheduling | Approximately O(V + P log P) |

In the two-phase version, `P = 2`; vehicle movement dominates runtime. The heap demonstrates the DSA mechanism but does not make the entire simulation O(log n).

## Limits

This is a rule-based educational heuristic, not machine learning or traffic-engineering software. The model omits turn conflicts, pedestrians, lane changes, sensors, and real-world calibration. Results are scenario-specific and do not imply adaptive control always performs better.
