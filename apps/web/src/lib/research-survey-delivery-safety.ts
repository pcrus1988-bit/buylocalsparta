/** A bounded, sample-size-aware delivery safeguard for continuous research campaigns.
 * Study-level review thresholds are NOT the AWS SES account reputation limit.
 * AWS may review the SES account independently when hard bounces reach 5%.
 */
export const RESEARCH_BOUNCE_POLICY_VERSION = "2026-10-staged-main-bounce-v3" as const;
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
 * Separate validation-suppression safeguard, unchanged by the study-level
 * staged hard-bounce policy: <20 no hold; 20–99 20%; 100–999 8%;
 * 1,000+ a fixed 5% stop. Validation suppressions never count as bounces.
 */
export function graduatedResearchStopRate(decisions: number): number | null {
  if (!Number.isFinite(decisions) || decisions < 20) return null;
  if (decisions < 100) return 0.20;
  if (decisions < 1000) return 0.08;
  return 0.05;
}

/** Requested, study-level hard-bounce stop stages. These do NOT change the
 * independent 5% pre-delivery validation suppression hold, SES account
 * restrictions or complaint and recipient suppression rules.
 * Retain existing conservative early guards below 1,000 decisions. The later
 * stages are 10% for 25,000–74,999 and 8% from 75,000 onward.
 * Independent AWS SES reputation enforcement is NOT relaxed by this policy.
 */
export function graduatedResearchHardBounceStopRate(decisions: number): number | null {
  if (!Number.isFinite(decisions) || decisions < 20) return null;
  if (decisions < 100) return 0.20;
  if (decisions < 1000) return 0.08;
  if (decisions < 5000) return 0.10;
  if (decisions < 10000) return 0.09;
  if (decisions < 25000) return 0.07;
  if (decisions < 75000) return 0.10;
  return 0.08;
}

export function evaluateResearchDeliverySafety(metrics: ResearchDeliveryOutcomes): ResearchSafetyDecision {
  const actualDecisions = metrics.delivered + metrics.hardBounced;
  const hardBounceThreshold = graduatedResearchHardBounceStopRate(actualDecisions);
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

/** Reporting milestones are distinct from stop thresholds and do not send
 * email or automatically authorize new recipients. Evaluated against
 * provider-classified delivery outcomes, not the full cohort population.
 * 1k, 5k, 10k, 25k, 50k, 75k, then every additional 10k.
 */
export function researchDeliveryReviewMilestones(decisions: number): Readonly<{
  completedMilestone: number | null;
  nextMilestone: number;
}> {
  const n = Math.max(0,Math.floor(Number.isFinite(decisions) ? decisions : 0));
  if (n < 1000) return {completedMilestone:null,nextMilestone:1000};
  if (n < 5000) return {completedMilestone:1000,nextMilestone:5000};
  if (n < 10000) return {completedMilestone:5000,nextMilestone:10000};
  if (n < 25000) return {completedMilestone:10000,nextMilestone:25000};
  if (n < 50000) return {completedMilestone:25000,nextMilestone:50000};
  if (n < 75000) return {completedMilestone:50000,nextMilestone:75000};
  const completedMilestone=75000+Math.floor((n-75000)/10000)*10000;
  return {completedMilestone,nextMilestone:completedMilestone+10000};
}

/** Isolated SES submission rejects must not fail an already-approved census.
 * At most one failed submission per 50-recipient step, subject to a cumulative
 * 1% cap (rounded up); failures after SES acceptance are NOT eligible.
 * This does not alter delivery/bounce, validation, complaint or SES-account holds.
 */
export function allowIsolatedResearchSubmissionFailure(input: Readonly<{
  continuous: boolean;
  batchFailures: number;
  postAcceptanceFailures: number;
  previousFailures: number;
  processedAfterBatch: number;
}>): boolean {
  if (!input.continuous || input.batchFailures !== 1 || input.postAcceptanceFailures > 0) return false;
  const processed = Math.floor(input.processedAfterBatch);
  if (!Number.isFinite(processed) || processed < 1) return false;
  const previous = Math.max(0, Math.floor(input.previousFailures));
  return previous + 1 <= Math.max(1, Math.ceil(processed * 0.01));
}

/**
 * SES invitation endpoints receive exactly one mailbox, not a contact-list
 * field. Reject malformed/ambiguous source values before creating an invite
 * or calling SES. Do not silently trim, split, or "repair" the recipient:
 * changing the address here would invalidate its original contact hash and
 * the inbox-level no-repeat/suppression guarantees.
 *
 * This intentionally supports the safe ASCII dot-atom mailbox subset only.
 * Quoted addresses and non-ASCII local parts require a separate verified
 * canonicalization process; they are never guessed here.
 */
export function invalidResearchRecipientAddressReason(value: unknown):
  | "missing_or_too_long" | "whitespace_control_or_non_ascii"
  | "multiple_or_formatted_addresses" | "invalid_local_part"
  | "invalid_domain" | null {
  if (typeof value !== "string" || value.length < 6 || value.length > 254) {
    return "missing_or_too_long";
  }
  if (/[^\x21-\x7e]/.test(value)) return "whitespace_control_or_non_ascii";
  if (/[;,:()<>\[\]\\"]/.test(value)) return "multiple_or_formatted_addresses";
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return "invalid_local_part";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 ||
      !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
      local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return "invalid_local_part";
  }
  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 ||
      labels.some(label => !label || label.length > 63 ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) {
    return "invalid_domain";
  }
  return null;
}
