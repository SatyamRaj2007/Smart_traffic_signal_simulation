import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_GRAPH, assertNoConflictingGreens, isLegalSignalTransition, signalAspectForPhase } from './signalGraph.js';

test('signal graph allows every safe cycle transition', () => {
  for (const [from, next] of Object.entries(SIGNAL_GRAPH)) {
    for (const to of next) assert.equal(isLegalSignalTransition(from, to), true);
  }
});

test('signal graph rejects direct conflicting greens', () => {
  assert.equal(isLegalSignalTransition('NS_GREEN', 'EW_GREEN'), false);
  assert.equal(isLegalSignalTransition('EW_GREEN', 'NS_GREEN'), false);
  assert.equal(assertNoConflictingGreens(true, false), true);
  assert.throws(() => assertNoConflictingGreens(true, true), /Conflicting green phases/);
});

test('signal aspects show both approaches red during all-red clearance', () => {
  assert.equal(signalAspectForPhase('ALL_RED_TO_EW', 'NS'), 'red');
  assert.equal(signalAspectForPhase('ALL_RED_TO_EW', 'EW'), 'red');
  assert.equal(signalAspectForPhase('ALL_RED_TO_NS', 'NS'), 'red');
  assert.equal(signalAspectForPhase('ALL_RED_TO_NS', 'EW'), 'red');
});

test('signal aspects identify green and yellow only for the matching group', () => {
  assert.equal(signalAspectForPhase('NS_GREEN', 'NS'), 'green');
  assert.equal(signalAspectForPhase('NS_GREEN', 'EW'), 'red');
  assert.equal(signalAspectForPhase('NS_YELLOW', 'NS'), 'yellow');
  assert.equal(signalAspectForPhase('NS_YELLOW', 'EW'), 'red');
  assert.equal(signalAspectForPhase('EW_GREEN', 'EW'), 'green');
  assert.equal(signalAspectForPhase('EW_YELLOW', 'EW'), 'yellow');
});
