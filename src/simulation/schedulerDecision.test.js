import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecisionIfCurrent, matchesDecisionCorrelation, validateScheduleDecision } from './schedulerDecision.js';

const validDecision = {
  selectedPhase: 'NS',
  greenDuration: 16,
  candidateScores: { NS: { priority: 10 }, EW: { priority: 4 } },
  heap: [{ value: 'NS', priority: 10 }, { value: 'EW', priority: 4 }],
};

test('accepts a well-formed bounded scheduler response', () => {
  assert.equal(validateScheduleDecision(validDecision), true);
});

test('rejects malformed scheduler fields and out-of-range green times', () => {
  for (const decision of [
    { ...validDecision, selectedPhase: 'NORTH' },
    { ...validDecision, greenDuration: Number.NaN },
    { ...validDecision, greenDuration: 31 },
    { ...validDecision, candidateScores: { NS: { priority: Infinity }, EW: { priority: 4 } } },
    { ...validDecision, heap: [] },
  ]) assert.throws(() => validateScheduleDecision(decision));
});

test('an old scheduler response cannot mutate a reset run', () => {
  let generation = 1;
  let selected = null;
  const isCurrent = () => generation === 1;
  generation = 2;
  assert.equal(applyDecisionIfCurrent(validDecision, isCurrent, decision => { selected = decision.selectedPhase; }), false);
  assert.equal(selected, null);
});

test('scheduler response correlation rejects a prior run or duplicate decision', () => {
  const response = { runId: 27, decisionId: 5 };
  assert.equal(matchesDecisionCorrelation(response, 27, 5), true);
  assert.equal(matchesDecisionCorrelation(response, 28, 5), false);
  assert.equal(matchesDecisionCorrelation(response, 27, 6), false);
});
