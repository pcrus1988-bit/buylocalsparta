/** Minimum exploratory base for reporting any attribute-level selection rate. */
export const EXPERIMENT_ATTRIBUTE_MIN_BASE = 30;

/**
 * Chosen profile / presented profile exposures. A 'neither' choice contributes
 * exposures but no chosen profiles, while unanswered tasks contribute neither.
 * Suppress small bases and invalid data rather than displaying a misleading 0%.
 */
export function experimentSelectionRate(chosen: number, exposed: number): number | null {
  if (!Number.isSafeInteger(chosen) || !Number.isSafeInteger(exposed) ||
      exposed < EXPERIMENT_ATTRIBUTE_MIN_BASE || chosen < 0 || chosen > exposed) return null;
  return Math.round((chosen / exposed) * 1000) / 10;
}
