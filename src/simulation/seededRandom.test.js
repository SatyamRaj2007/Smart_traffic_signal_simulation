import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSeededRandom } from './seededRandom.js';

function sequence(seed, length) {
  const values = [];
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    const next = nextSeededRandom(state);
    state = next.seed;
    values.push(next.value);
  }
  return values;
}

test('live arrival generator is deterministic for the same non-zero seed', () => {
  assert.deepEqual(sequence(12345, 100), sequence(12345, 100));
});

test('different live seeds normally generate different arrival sequences', () => {
  assert.notDeepEqual(sequence(12345, 20), sequence(54321, 20));
});

test('zero seed is normalized to a non-zero xorshift state', () => {
  assert.deepEqual(nextSeededRandom(0), nextSeededRandom(1));
});
