import type { AdminAssistantActionEvaluation, AdminAssistantRecentAction, AdminAssistantSnapshot } from "./types";

const ACTION_WINDOW_MS = 15 * 60 * 1_000;

function actionDomain(action: string): AdminAssistantSnapshot["context"]["domain"] | undefined {
  const normalized = action.toLocaleLowerCase("en");
  if (/^(?:catalog|product|category|attribute|pim|icecat)[._]/.test(normalized)) return "catalogue";
  if (/^(?:order|return|fulfil|fulfill|payment)[._]/.test(normalized)) return "orders";
  if (/^(?:vendor|partner)[._]/.test(normalized)) return "partners";
  if (/^(?:tax|mydata|finance)[._]/.test(normalized)) return "tax";
  if (/^seo[._]/.test(normalized)) return "seo";
  if (/^(?:gift|gift_card)[._]/.test(normalized)) return "gift_cards";
  if (/^(?:system|job|maintenance|security)[._]/.test(normalized)) return "platform";
  return undefined;
}

function expectedState(action: string): string | undefined {
  const normalized = action.toLocaleLowerCase("en");
  const vendor = normalized.match(/^vendor\.application_(application_started|verification_pending|catalog_onboarding|test_ready|active|restricted|suspended|closed)$/)?.[1];
  if (vendor) return vendor;
  const fairness = normalized.match(/^fairness\.appeal_(under_review|resolved|rejected)$/)?.[1];
  if (fairness) return fairness;
  if (normalized === "finance.procurement_payable") return "payable";
  if (normalized === "finance.settlement_submit") return "approval_required";
  if (normalized === "finance.settlement_approve") return "approved";
  if (normalized === "finance.settlement_pay") return "paid";
  return undefined;
}

function stateValue(action: AdminAssistantRecentAction): string | undefined {
  const preferred = ["status", "state", "approvalStatus", "reviewStatus", "transmissionStatus", "paymentStatus", "fulfilmentStatus", "visibility"];
  for (const key of preferred) {
    const changed = action.stateChanges?.find((item) => item.field === key && item.after !== undefined);
    if (changed?.after !== undefined) return changed.after.toLocaleLowerCase("en");
  }
  return action.stateChanges?.find((item) => item.after !== undefined)?.after?.toLocaleLowerCase("en");
}

function relevantToContext(action: AdminAssistantRecentAction, snapshot: AdminAssistantSnapshot): boolean {
  if (snapshot.context.entityId && action.entityId === snapshot.context.entityId) return true;
  const domain = actionDomain(action.action);
  return Boolean(domain && domain === snapshot.context.domain);
}

function summarizeChanges(action: AdminAssistantRecentAction): readonly string[] {
  return (action.stateChanges ?? []).slice(0, 5).map((item) => {
    if (item.before !== undefined && item.after !== undefined) return `${item.field}: ${item.before} → ${item.after}`;
    if (item.after !== undefined) return `${item.field}: now ${item.after}`;
    return `${item.field}: previous value ${item.before ?? "recorded"}`;
  });
}

export function evaluateRecentAdminActions(snapshot: AdminAssistantSnapshot, now = Date.now()): AdminAssistantSnapshot {
  const recent = snapshot.recentActions
    .filter((action) => action.createdAt !== undefined && now - action.createdAt <= ACTION_WINDOW_MS)
    .filter((action) => relevantToContext(action, snapshot))
    .slice(0, 3);
  if (!recent.length) return { ...snapshot, actionEvaluations: [] };

  const evaluations: AdminAssistantActionEvaluation[] = recent.map((action, index) => {
    const changes = summarizeChanges(action);
    const expected = expectedState(action.action);
    const observed = stateValue(action);
    const targetConfirmed = expected !== undefined && observed === expected;
    const outcome: AdminAssistantActionEvaluation["outcome"] = targetConfirmed
      ? "confirmed"
      : changes.length
        ? "changed"
        : "recorded";
    const residual = snapshot.findings
      .filter((finding) => finding.severity === "critical" || finding.severity === "warning")
      .slice(0, 3)
      .map((finding) => finding.title);
    const entity = `${action.entityType} ${action.entityId}`;
    const summary = targetConfirmed
      ? `${action.action} on ${entity} is confirmed by the recorded resulting state (${expected}).`
      : changes.length
        ? `${action.action} on ${entity} produced ${changes.length} safe operational state change${changes.length === 1 ? "" : "s"} in the Admin audit evidence.`
        : `${action.action} on ${entity} is recorded in the Admin audit trail, but no allowlisted scalar before/after state was stored, so the assistant will not invent an impact.`;
    const recommendation = residual.length
      ? `The refreshed page still reports ${residual.length} warning/critical finding${residual.length === 1 ? "" : "s"}; review those before treating the action as full resolution.`
      : outcome === "recorded"
        ? "Use the refreshed domain state to verify the operational result; the audit event alone is not enough to prove outcome."
        : "No warning/critical contradiction is currently reported by the refreshed deterministic checks for this context.";
    return {
      id: `action-evaluation:${action.action}:${action.entityType}:${action.entityId}:${action.createdAt ?? index}`,
      action: action.action,
      entityType: action.entityType,
      entityId: action.entityId,
      occurredAt: action.createdAt,
      outcome,
      summary,
      changes,
      residualFindings: residual,
      recommendation,
      confidence: targetConfirmed || changes.length ? "high" : "medium"
    };
  });

  return { ...snapshot, actionEvaluations: evaluations };
}
