import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminOperationsWorkspace, hasAdminPermission } from "../admin-runtime";
import { recordAssistantToolAudit } from "./repository";
import type { AdminAssistantActionEvaluation, AdminAssistantActionStateChange, AdminAssistantFinding, AdminAssistantRecentAction, AdminAssistantSnapshot } from "./types";

const ACTION_WINDOW_MS = 15 * 60 * 1_000;
const SAFE_STATE_FIELDS = [
  "status", "state", "active", "enabled", "visible", "visibility", "verified", "approved", "published", "indexable", "redeemable",
  "approvalStatus", "reviewStatus", "transmissionStatus", "paymentStatus", "fulfilmentStatus", "freshnessStatus"
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function safeScalar(value: unknown): string | undefined {
  if (typeof value === "boolean" || typeof value === "number") return String(value).slice(0, 80);
  if (typeof value === "string" && value.length <= 80 && !/[\r\n]/.test(value)) return value;
  return undefined;
}

function safeStateChanges(beforeValue: unknown, afterValue: unknown): readonly AdminAssistantActionStateChange[] {
  const before = record(beforeValue);
  const after = record(afterValue);
  const changes: AdminAssistantActionStateChange[] = [];
  for (const field of SAFE_STATE_FIELDS) {
    const previous = safeScalar(before?.[field]);
    const next = safeScalar(after?.[field]);
    if (previous === undefined && next === undefined) continue;
    if (previous === next && previous !== undefined) continue;
    changes.push({ field, before: previous, after: next });
  }
  return changes.slice(0, 8);
}

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

function evaluationFinding(evaluation: AdminAssistantActionEvaluation, route: string): AdminAssistantFinding {
  return {
    id: `finding:${evaluation.id}`,
    ruleId: "admin_action_impact_evaluated",
    severity: evaluation.residualFindings.length ? "warning" : "info",
    category: "action_impact",
    title: evaluation.outcome === "confirmed" ? "Latest Admin action reached its recorded target state" : "Latest Admin action impact evaluated",
    detail: `${evaluation.summary} ${evaluation.recommendation}`,
    evidence: evaluation.changes.length ? evaluation.changes : ["Admin audit event recorded; no allowlisted scalar state transition available."],
    recommendation: evaluation.recommendation,
    href: route,
    affectedCount: 1,
    confidence: evaluation.confidence
  };
}

export async function evaluateRecentAdminActions(
  principal: SessionPrincipal,
  snapshot: AdminAssistantSnapshot,
  now = Date.now()
): Promise<AdminAssistantSnapshot> {
  if (!hasAdminPermission(principal, "admin.audit.read")) return { ...snapshot, actionEvaluations: [] };
  const startedAt = Date.now();
  const operations = await adminOperationsWorkspace(principal).catch(() => undefined);
  if (!operations) {
    await recordAssistantToolAudit(principal, { toolName: "evaluateAdminActionImpact", parameters: { route: snapshot.context.route }, resultState: "error", error: "audit_unavailable", durationMs: Date.now() - startedAt }).catch(() => undefined);
    return { ...snapshot, actionEvaluations: [] };
  }

  const safeActions: AdminAssistantRecentAction[] = operations.audit
    .filter((entry) => !entry.actorId || entry.actorId === principal.userId)
    .slice(0, 8)
    .map((entry) => ({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      createdAt: entry.createdAt,
      stateChanges: safeStateChanges(entry.before, entry.after),
      hasBeforeState: Boolean(record(entry.before)),
      hasAfterState: Boolean(record(entry.after))
    }));

  const recent = safeActions
    .filter((action) => action.createdAt !== undefined && now - action.createdAt <= ACTION_WINDOW_MS)
    .filter((action) => relevantToContext(action, snapshot))
    .slice(0, 3);

  const evaluations: AdminAssistantActionEvaluation[] = recent.map((action, index) => {
    const changes = summarizeChanges(action);
    const expected = expectedState(action.action);
    const observed = stateValue(action);
    const targetConfirmed = expected !== undefined && observed === expected;
    const outcome: AdminAssistantActionEvaluation["outcome"] = targetConfirmed ? "confirmed" : changes.length ? "changed" : "recorded";
    const residual = snapshot.findings
      .filter((finding) => finding.severity === "critical" || finding.severity === "warning")
      .slice(0, 3)
      .map((finding) => finding.title);
    const entity = `${action.entityType} ${action.entityId}`;
    const summary = targetConfirmed
      ? `${action.action} on ${entity} is confirmed by the recorded resulting state (${expected}).`
      : changes.length
        ? `${action.action} on ${entity} produced ${changes.length} allowlisted operational state change${changes.length === 1 ? "" : "s"} in the Admin audit evidence.`
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

  await recordAssistantToolAudit(principal, {
    toolName: "evaluateAdminActionImpact",
    parameters: { route: snapshot.context.route, inspectedEvents: safeActions.length },
    resultState: "ok",
    durationMs: Date.now() - startedAt
  }).catch(() => undefined);

  if (!evaluations.length) return { ...snapshot, recentActions: safeActions, actionEvaluations: [] };
  const latest = evaluations[0];
  const actionFindings = evaluations.map((evaluation) => evaluationFinding(evaluation, snapshot.context.route));
  const existing = snapshot.findings.filter((finding) => !actionFindings.some((item) => item.id === finding.id));
  return {
    ...snapshot,
    summary: `Latest Admin action: ${latest.summary} ${latest.recommendation} ${snapshot.summary}`.slice(0, 1_800),
    facts: [`Action impact: ${latest.changes.length ? latest.changes.join(" · ") : "audit recorded; no safe scalar transition available"}.`, ...snapshot.facts].slice(0, 7),
    findings: [...actionFindings, ...existing].slice(0, 8),
    recentActions: safeActions,
    actionEvaluations: evaluations
  };
}
