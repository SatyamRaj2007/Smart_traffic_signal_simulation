import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneQueue } from './queue.js';

test('lane queue is FIFO and supports constant-time head operations', () => {
  const queue = new LaneQueue();
  queue.enqueue('A'); queue.enqueue('B'); queue.enqueue('C');
  assert.equal(queue.front(), 'A');
  assert.equal(queue.dequeue(), 'A');
  assert.equal(queue.front(), 'B');
  assert.equal(queue.size, 2);
});

test('lane queue compaction preserves order over many operations', () => {
  const queue = new LaneQueue();
  for (let index=0; index<1000; index+=1) queue.enqueue(index);
  for (let index=0; index<800; index+=1) assert.equal(queue.dequeue(), index);
  assert.deepEqual(queue.values(), Array.from({length:200},(_,index)=>index+800));
});
