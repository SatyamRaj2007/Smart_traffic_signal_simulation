export const SIGNAL_GRAPH = Object.freeze({
  NS_GREEN: ['NS_GREEN', 'NS_YELLOW'],
  NS_YELLOW: ['ALL_RED_TO_EW'],
  ALL_RED_TO_EW: ['EW_GREEN'],
  EW_GREEN: ['EW_GREEN', 'EW_YELLOW'],
  EW_YELLOW: ['ALL_RED_TO_NS'],
  ALL_RED_TO_NS: ['NS_GREEN'],
});

export function isLegalSignalTransition(from, to) {
  return SIGNAL_GRAPH[from]?.includes(to) ?? false;
}

export function signalAspectForPhase(phase, group) {
  if (phase === `${group}_GREEN`) return 'green';
  if (phase === `${group}_YELLOW`) return 'yellow';
  return 'red';
}

export function assertNoConflictingGreens(nsGreen, ewGreen) {
  if (nsGreen && ewGreen) throw new Error('Conflicting green phases');
  return true;
}
