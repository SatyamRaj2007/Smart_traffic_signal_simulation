export const MIN_VEHICLE_GAP = 0.075;

export const STOP_PROGRESS = Object.freeze({
  north: 0.395,
  south: 0.395,
  east: 0.448,
  west: 0.448,
});

const LANE_SPEED = 0.16;
const STOP_EPSILON = 1e-6;

export function spawnProgress(queue) {
  const rear = queue.rear();
  return rear ? Math.min(0, rear.progress - MIN_VEHICLE_GAP) : 0;
}

export function advanceApproachLane(queue, dt, simulationTime = 0) {
  let ahead = Infinity;
  queue.forEach(vehicle => {
    const wasQueued = vehicle.state === 'QUEUED';
    const previous = vehicle.progress;
    const target = Math.min(STOP_PROGRESS[vehicle.direction], previous + LANE_SPEED * dt);
    const constrained = Math.min(target, ahead - MIN_VEHICLE_GAP);
    vehicle.progress = Math.max(previous, constrained);
    ahead = vehicle.progress;
    const atStopLine = vehicle.progress >= STOP_PROGRESS[vehicle.direction] - STOP_EPSILON;
    const stoppedBehindVehicle = target - constrained > STOP_EPSILON && constrained <= previous + STOP_EPSILON;
    vehicle.state = atStopLine || stoppedBehindVehicle ? 'QUEUED' : 'APPROACHING';
    if (vehicle.state === 'QUEUED' && vehicle.queueEntryTime == null) vehicle.queueEntryTime = simulationTime;
    if (wasQueued && vehicle.state === 'QUEUED') vehicle.waitingTime = (vehicle.waitingTime || 0) + dt;
  });
}

export function canServeApproach(direction, greenPhase, progress) {
  const requiredPhase = direction === 'north' || direction === 'south' ? 'NS' : 'EW';
  return greenPhase === requiredPhase && progress >= STOP_PROGRESS[direction] - STOP_EPSILON;
}
