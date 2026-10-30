/** Public descriptive disclosure threshold for Greek Retail 2026.
 * Amended on 2026-10-30 before publication; the locked historical plan is
 * preserved and a versioned supersession records the change.
 * A cell with n=5 is descriptive only and must not imply representativeness.
 */
export const RESEARCH_PUBLIC_MINIMUM_UNWEIGHTED_BASE = 5;

/** Keep experimental contrast arms at their original stricter threshold.
 * Lowering the descriptive publication base does not authorize publication
 * of underpowered experimental results or small cross-tab intersections.
 */
export const RESEARCH_EXPERIMENT_MINIMUM_ARM_BASE = 30;
