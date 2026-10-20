import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneQueue } from './queue.js';
import { advanceApproachLane, canServeApproach, MIN_VEHICLE_GAP, spawnProgress, STOP_PROGRESS } from './vehicleMovement.js';

function vehicle(direction, progress) {
  return { direction, progress, state: 'APPROACHING', waitingTime: 0, queueEntryTime: null };
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

test('approach travel does not count as waiting, while stopped time does', () => {
  const queue = new LaneQueue();
  const car = vehicle('north', 0);
  queue.enqueue(car);

  advanceApproachLane(queue, 1, 1);
  assert.equal(car.state, 'APPROACHING');
  assert.equal(car.waitingTime, 0);
  assert.equal(car.queueEntryTime, null);

  for (let index = 0; index < 40 && car.state !== 'QUEUED'; index += 1) {
    advanceApproachLane(queue, 0.05, 1.05 + index * 0.05);
  }
  assert.equal(car.state, 'QUEUED');
  assert.equal(car.waitingTime, 0);
  assert.ok(car.queueEntryTime > 1);

  advanceApproachLane(queue, 10, car.queueEntryTime + 10);
  assert.equal(car.waitingTime, 10);
});

test('vehicles blocked behind the lead vehicle are marked queued and accumulate wait', () => {
  const queue = new LaneQueue();
  const front = { ...vehicle('north', STOP_PROGRESS.north), state: 'QUEUED' };
  const follower = vehicle('north', STOP_PROGRESS.north - MIN_VEHICLE_GAP);
  queue.enqueue(front);
  queue.enqueue(follower);

  advanceApproachLane(queue, 0.05, 1);
  assert.equal(follower.state, 'QUEUED');
  assert.equal(follower.waitingTime, 0);
  advanceApproachLane(queue, 0.05, 1.05);
  assert.equal(follower.waitingTime, 0.05);
});
