/** A bounded, sample-size-aware delivery safeguard for continuous research campaigns.
 * A 20% threshold on very early results is NOT a safe SES account reputation limit.
 * At sustained volume the stop returns to 5%; SES may independently pause accounts.
 */
export type ResearchDeliveryOutcomes = Readonly<{
  delivered: number;
  hardBounced: number;
  validationSuppressed: number;
  decided: number;
}>;

export type ResearchSafetyDecision = Readonly<{
  hardBounceThreshold: number | null;
  validationThreshold: number | null;
  hardBounceRate: number;
  validationSuppressionRate: number;
  hardBounceHold: boolean;
  validationHold: boolean;
  earlyWarning: boolean;
}>;

/**
 * Under 50 outcomes: report rates without automatic study-level pause.
 * 50-99 outcomes: 20% emergency guard; 100-499: 8% early guard.
 * 500+ outcomes: return to the 5% sustained-quality threshold.
 * Actual hard bounces and SES pre-delivery validation suppressions are
 * evaluated separately; suppressions are not counted as actual hard bounces.
 */
export function graduatedResearchStopRate(decisions: number): number | null {
  if (!Number.isFinite(decisions) || decisions < 50) return null;
  if (decisions < 100) return 0.20;
  if (decisions < 500) return 0.08;
  return 0.05;
}

export function evaluateResearchDeliverySafety(metrics: ResearchDeliveryOutcomes): ResearchSafetyDecision {
  const actualDecisions = metrics.delivered + metrics.hardBounced;
  const hardBounceThreshold = graduatedResearchStopRate(actualDecisions);
  const validationThreshold = graduatedResearchStopRate(metrics.decided);
  const hardBounceRate = actualDecisions > 0 ? metrics.hardBounced / actualDecisions : 0;
  const validationSuppressionRate = metrics.decided > 0 ? metrics.validationSuppressed / metrics.decided : 0;
  return {
    hardBounceThreshold,
    validationThreshold,
    hardBounceRate,
    validationSuppressionRate,
    hardBounceHold: hardBounceThreshold !== null && hardBounceRate >= hardBounceThreshold,
    validationHold: validationThreshold !== null && validationSuppressionRate >= validationThreshold,
    earlyWarning: actualDecisions >= 100 && hardBounceRate >= 0.05
  };
}
