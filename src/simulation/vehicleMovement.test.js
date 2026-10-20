import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneQueue } from './queue.js';
import { advanceApproachLane, canServeApproach, MIN_VEHICLE_GAP, spawnProgress, STOP_PROGRESS } from './vehicleMovement.js';

function vehicle(direction, progress) {
  return { direction, progress, state: 'APPROACHING', wait: 0 };
}

test('all four approaches stop at their drawn stop lines without crossing on red', () => {
  for (const [direction, stop] of Object.entries(STOP_PROGRESS)) {
    const queue = new LaneQueue();
    queue.enqueue(vehicle(direction, 0));
    for (let i = 0; i < 200; i += 1) advanceApproachLane(queue, 0.05);
    const car = queue.front();
    assert.ok(car.progress <= stop + 1e-9, `${direction} passed its stop line`);
    assert.equal(car.progress, stop);
    assert.equal(car.state, 'QUEUED');
    assert.equal(canServeApproach(direction, direction === 'north' || direction === 'south' ? 'EW' : 'NS', car.progress), false);
  }
});

test('only a vehicle at its stop line under its matching green can be served', () => {
  for (const [direction, stop] of Object.entries(STOP_PROGRESS)) {
    const phase = direction === 'north' || direction === 'south' ? 'NS' : 'EW';
    assert.equal(canServeApproach(direction, phase, stop - 0.01), false);
    assert.equal(canServeApproach(direction, phase, stop), true);
  }
});

test('lane vehicles keep their order and minimum gap as they approach', () => {
  const queue = new LaneQueue();
  queue.enqueue(vehicle('north', 0));
  advanceApproachLane(queue, 0.05);
  queue.enqueue(vehicle('north', spawnProgress(queue)));
  queue.enqueue(vehicle('north', spawnProgress(queue)));
  for (let i = 0; i < 400; i += 1) advanceApproachLane(queue, 0.05);
  const vehicles = queue.values();
  assert.ok(vehicles[0].progress >= vehicles[1].progress);
  assert.ok(vehicles[1].progress >= vehicles[2].progress);
  for (let i = 0; i < vehicles.length - 1; i += 1) {
    assert.ok(vehicles[i].progress - vehicles[i + 1].progress >= MIN_VEHICLE_GAP - 1e-9);
  }
});
