import "server-only";

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCustomerDetail } from "../admin-customer-management";
import { adminCustomer360 } from "../admin-customer-support";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

export type AdminAssistantCustomerState = Readonly<{
  id: string;
  status: string;
  emailVerified: boolean;
  activeSessionCount: number;
  orderCount: number;
  grossOrderValueMinor: number;
  lastOrderAt?: number;
  lastSeenAt?: number;
  orders: readonly Readonly<{ id: string; orderNumber: string; status: string; fulfilmentPreference: string; totalMinor: number; currency: string; createdAt: number; confirmedAt?: number }>[];
  engagement: Readonly<{
    activeCarts: number;
    cartItems: number;
    notifications: number;
    notificationFailures: number;
    openPrivacyRequests: number;
    openSupportCases: number;
    conversations: number;
    messages: number;
  }>;
  privacyRequests: readonly Readonly<{ id: string; type: string; status: string; dueAt?: number; createdAt: number; completedAt?: number }>[];
  supportCases: readonly Readonly<{ id: string; category: string; priority: string; status: string; assignedTo?: string; followUpAt?: number; createdAt: number; updatedAt: number }>[];
  recentAudit: readonly Readonly<{ action: string; createdAt: number; beforeState: Record<string, unknown>; afterState: Record<string, unknown> }>[];
}>;

export async function getAdminAssistantCustomerState(principal: SessionPrincipal, customerId: string): Promise<AdminAssistantCustomerState | undefined> {
  const id = customerId.trim().slice(0, 200);
  if (!id) return undefined;
  const [detailResult, customer360] = await Promise.all([
    adminCustomerDetail(principal, id).catch(() => undefined),
    adminCustomer360(principal, id).catch(() => undefined)
  ]);
  if (!detailResult || !customer360) return undefined;
  const { customer, orders, audit } = detailResult.detail;
  const { engagement, privacyRequests, supportCases } = customer360;
  return {
    id: customer.id,
    status: customer.status,
    emailVerified: customer.emailVerified,
    activeSessionCount: customer.activeSessionCount,
    orderCount: customer.orderCount,
    grossOrderValueMinor: customer.grossOrderValueMinor,
    lastOrderAt: customer.lastOrderAt,
    lastSeenAt: customer.lastSeenAt,
    orders: orders.slice(0, 20),
    engagement: {
      activeCarts: engagement.activeCarts,
      cartItems: engagement.cartItems,
      notifications: engagement.notifications,
      notificationFailures: engagement.notificationFailures,
      openPrivacyRequests: engagement.openPrivacyRequests,
      openSupportCases: engagement.openSupportCases,
      conversations: engagement.conversations,
      messages: engagement.messages
    },
    privacyRequests: privacyRequests.slice(0, 20).map((item) => ({ id: item.id, type: item.type, status: item.status, dueAt: item.dueAt, createdAt: item.createdAt, completedAt: item.completedAt })),
    supportCases: supportCases.slice(0, 30).map((item) => ({ id: item.id, category: item.category, priority: item.priority, status: item.status, assignedTo: item.assignedTo, followUpAt: item.followUpAt, createdAt: item.createdAt, updatedAt: item.updatedAt })),
    recentAudit: audit.slice(0, 20).map((item) => ({ action: item.action, createdAt: item.createdAt, beforeState: item.beforeState, afterState: item.afterState }))
  };
}

export async function customerOperationalIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot,
  customerId: string
): Promise<AdminAssistantSnapshot> {
  const customer = await getAdminAssistantCustomerState(principal, customerId).catch(() => undefined);
  if (!customer) return base;
  const now = Date.now();
  const findings: AdminAssistantFinding[] = [];
  const evidence: AdminAssistantEvidence[] = [...(base.evidence ?? [])];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => { findings.push(finding); candidates.push({ finding, dimensions }); };

  const openSupport = customer.supportCases.filter((item) => !["resolved", "closed"].includes(item.status));
  const urgentOpen = openSupport.filter((item) => item.priority === "urgent");
  const unassignedHigh = openSupport.filter((item) => ["urgent", "high"].includes(item.priority) && !item.assignedTo);
  const overdueFollowUp = openSupport.filter((item) => item.followUpAt !== undefined && item.followUpAt < now);
  const openPrivacy = customer.privacyRequests.filter((item) => ["submitted", "processing"].includes(item.status));
  const overduePrivacy = openPrivacy.filter((item) => item.dueAt !== undefined && item.dueAt < now);

  evidence.push(
    { id: "customer:account", kind: "kontamou", label: "Account state", detail: `${customer.id} · status ${customer.status} · email verified ${customer.emailVerified ? "yes" : "no"} · ${customer.activeSessionCount} active session(s).`, metric: customer.status, sourceTool: "getCustomerOperationalIntelligence" },
    { id: "customer:commerce", kind: "kontamou", label: "Commerce", detail: `${customer.orderCount} order(s) · ${(customer.grossOrderValueMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })} recorded non-cancelled EUR order value.`, metric: customer.orderCount, sourceTool: "getCustomerOperationalIntelligence" },
    { id: "customer:support", kind: "kontamou", label: "Support", detail: `${openSupport.length} open support case(s); ${urgentOpen.length} urgent; ${unassignedHigh.length} high/urgent and unassigned; ${overdueFollowUp.length} follow-up(s) overdue.`, metric: openSupport.length, sourceTool: "getCustomerOperationalIntelligence" },
    { id: "customer:privacy", kind: "kontamou", label: "Privacy", detail: `${openPrivacy.length} open privacy request(s); ${overduePrivacy.length} past their recorded due time.`, metric: openPrivacy.length, sourceTool: "getCustomerOperationalIntelligence" }
  );

  if (customer.status === "active" && !customer.emailVerified) add({
    id: "customer-active-unverified",
    ruleId: "customer_active_without_email_verification",
    severity: "critical",
    category: "customer_security",
    title: "Active customer account is not email-verified",
    detail: "Customer Management normally blocks activation until email verification. This state should be treated as an identity-gate contradiction.",
    evidence: ["status = active", "emailVerified = false"], evidenceIds: ["customer:account"],
    recommendation: "Review the customer audit history and verification state before performing recovery or account actions.",
    href: base.context.route, affectedCount: 1, confidence: "high"
  }, { customerImpact: 9, complianceRisk: 7, urgency: 9, effort: 4 });

  if (["restricted", "suspended", "closed"].includes(customer.status) && customer.activeSessionCount > 0) add({
    id: "customer-nonactive-sessions",
    ruleId: "customer_restricted_with_active_sessions",
    severity: "critical",
    category: "customer_security",
    title: `${customer.activeSessionCount} active session(s) remain on a non-active account`,
    detail: "The governed account-state workflow normally revokes sessions when a customer becomes non-active.",
    evidence: [`status = ${customer.status}`, `activeSessionCount = ${customer.activeSessionCount}`], evidenceIds: ["customer:account"],
    recommendation: "Inspect the latest status-change audit and session state before taking another account action.",
    href: `${base.context.route}/manage`, affectedCount: customer.activeSessionCount, confidence: "high"
  }, { customerImpact: 8, complianceRisk: 9, urgency: 10, effort: 3 });

  if (overduePrivacy.length) add({
    id: "customer-overdue-privacy",
    ruleId: "customer_privacy_request_overdue",
    severity: "critical",
    category: "privacy",
    title: `${overduePrivacy.length} privacy request(s) are past their recorded due time`,
    detail: "The customer has an open privacy workflow whose persisted due time has passed.",
    evidence: overduePrivacy.slice(0, 5).map((item) => `${item.id}: ${item.type} · ${item.status} · due ${item.dueAt}`), evidenceIds: ["customer:privacy"],
    recommendation: "Open the Privacy workspace and prioritize the overdue request; do not resolve it from Customer 360.",
    href: `/admin/privacy?customer=${encodeURIComponent(customer.id)}`, affectedCount: overduePrivacy.length, confidence: "high"
  }, { customerImpact: 10, complianceRisk: 10, urgency: 10, effort: 5 });

  if (unassignedHigh.length) add({
    id: "customer-high-support-unassigned",
    ruleId: "customer_urgent_support_unassigned",
    severity: "warning",
    category: "support",
    title: `${unassignedHigh.length} high/urgent support case(s) are unassigned`,
    detail: "High-priority customer issues exist without a current owner.",
    evidence: unassignedHigh.slice(0, 5).map((item) => `${item.id}: ${item.priority} · ${item.status}`), evidenceIds: ["customer:support"],
    recommendation: "Open Support Queue, assign an owner and verify the next follow-up time.",
    href: "/admin/customers/support", affectedCount: unassignedHigh.length, confidence: "high"
  }, { customerImpact: 10, urgency: 9, effort: 2 });

  if (overdueFollowUp.length) add({
    id: "customer-support-followup-overdue",
    ruleId: "customer_support_followup_overdue",
    severity: "warning",
    category: "support",
    title: `${overdueFollowUp.length} support follow-up(s) are overdue`,
    detail: "The persisted follow-up time has passed while the support case remains open.",
    evidence: overdueFollowUp.slice(0, 5).map((item) => `${item.id}: ${item.status} · followUpAt ${item.followUpAt}`), evidenceIds: ["customer:support"],
    recommendation: "Review those cases in Support and update ownership/status/follow-up based on the actual customer conversation.",
    href: "/admin/customers/support", affectedCount: overdueFollowUp.length, confidence: "high"
  }, { customerImpact: 8, urgency: 8, effort: 3 });

  if (customer.engagement.notificationFailures > 0) add({
    id: "customer-notification-failures",
    ruleId: "customer_notification_failures",
    severity: "warning",
    category: "support",
    title: `${customer.engagement.notificationFailures} customer notification(s) have failed`,
    detail: "Failed notification records can explain missing verification, recovery or operational communication, but they do not prove the customer did not receive information through another channel.",
    evidence: [`notificationFailures = ${customer.engagement.notificationFailures}`], evidenceIds: ["customer:account"],
    recommendation: "Inspect the relevant notification/audit evidence before resending communication.",
    href: base.context.route, affectedCount: customer.engagement.notificationFailures, confidence: "high"
  }, { customerImpact: 7, urgency: 6, effort: 4 });

  const recommendations = prioritizeRecommendations(candidates, 5);
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const merged = new Map<string, AdminAssistantFinding>();
  for (const item of [...findings, ...base.findings]) if (!merged.has(item.id)) merged.set(item.id, item);

  return {
    ...base,
    summary: `Customer ${customer.id}: ${customer.status}, ${customer.orderCount} order(s), ${openSupport.length} open support case(s), ${openPrivacy.length} open privacy request(s), ${customer.activeSessionCount} active session(s). ${findings.length ? `${findings.length} deterministic customer issue(s) need attention.` : "No high-signal account/support/privacy contradiction crossed the current checks."}`,
    facts: [
      `Account: ${customer.status} · email verified ${customer.emailVerified ? "yes" : "no"} · ${customer.activeSessionCount} active session(s).`,
      `Commerce: ${customer.orderCount} order(s) · ${(customer.grossOrderValueMinor / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" })} recorded EUR order value.`,
      `Support: ${openSupport.length} open · ${urgentOpen.length} urgent · ${overdueFollowUp.length} overdue follow-up(s).`,
      `Privacy: ${openPrivacy.length} open · ${overduePrivacy.length} overdue.`,
      `Notifications: ${customer.engagement.notifications} total · ${customer.engagement.notificationFailures} failed.`
    ],
    evidence,
    findings: [...merged.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
