export function validateScheduleDecision(decision) {
  if (!decision || typeof decision !== 'object' || !['NS', 'EW'].includes(decision.selectedPhase)) {
    throw new Error('Adaptive scheduler returned an invalid phase decision.');
  }
  if (!Number.isFinite(decision.greenDuration) || decision.greenDuration < 8 || decision.greenDuration > 30) {
    throw new Error('Adaptive scheduler returned an invalid green duration.');
  }
  if (!decision.candidateScores || !['NS', 'EW'].every(phase => Number.isFinite(decision.candidateScores[phase]?.priority))) {
    throw new Error('Adaptive scheduler returned invalid candidate scores.');
  }
  if (!Array.isArray(decision.heap) || decision.heap.length !== 2) {
    throw new Error('Adaptive scheduler returned an invalid priority queue snapshot.');
  }
  return true;
}

export function applyDecisionIfCurrent(decision, isCurrent, apply) {
  if (!isCurrent()) return false;
  validateScheduleDecision(decision);
  apply(decision);
  return true;
}

export function matchesDecisionCorrelation(decision, runId, decisionId) {
  return decision?.runId === runId && decision?.decisionId === decisionId;
}
