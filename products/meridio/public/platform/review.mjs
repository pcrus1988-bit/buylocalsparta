/**
 * MERIDIO v0.3 REVIEW CONTRACT — educational, non-persistent simulation.
 * Browser role selection and the audit timeline are NOT identity security.
 * All rules must be independently re-enforced server-side with authenticated
 * principals, atomic DB transitions, RLS and durable append-only event records.
 */
export const REVIEW_MODE = "fictional_review_only";
export const REQUIRED_DOCUMENTS = Object.freeze([
  ["title", "Asset title or operator control"],
  ["policy", "Operational and utilization policy"],
  ["risk", "Risk and consumer disclosures"],
  ["governance", "Governance and decision terms"]
]);
export const REVIEW_STAGES = Object.freeze([
  "evidence_pending", "under_review_demo", "approved_demo",
  "publish_ready_demo", "rejected_demo", "suspended_demo"
]);
export const REVIEW_ACTIONS = Object.freeze([
  "verify_document", "request_review", "approve", "reject",
  "mark_publish_ready", "suspend"
]);

const demoPeople = {
  alpha: [
    { id: "demo-alpha-operator", role: "operator", display: "Alex · Operator", tenantId: "demo-tenant-alpha", status: "active" },
    { id: "demo-alpha-reviewer", role: "reviewer", display: "Morgan · Reviewer", tenantId: "demo-tenant-alpha", status: "active" },
    { id: "demo-alpha-auditor", role: "auditor", display: "Taylor · Auditor", tenantId: "demo-tenant-alpha", status: "active" }
  ],
  beta: [
    { id: "demo-beta-operator", role: "operator", display: "Riley · Operator", tenantId: "demo-tenant-beta", status: "active" },
    { id: "demo-beta-reviewer", role: "reviewer", display: "Drew · Reviewer", tenantId: "demo-tenant-beta", status: "active" },
    { id: "demo-beta-auditor", role: "auditor", display: "Casey · Auditor", tenantId: "demo-tenant-beta", status: "active" }
  ]
};

export function createReviewDemo(tenantKey = "alpha") {
  if (!Object.hasOwn(demoPeople, tenantKey)) throw new Error("Unknown demo tenant");
  const tenantId = "demo-tenant-" + tenantKey;
  const members = demoPeople[tenantKey].map((member) => ({ ...member }));
  return {
    mode: REVIEW_MODE,
    tenantId,
    tenantName: tenantKey === "alpha" ? "Aurora Asset Cooperative (fictional)" : "Riverfront Shared Resources (fictional)",
    members,
    asset: {
      id: "demo-review-" + tenantKey,
      tenantId,
      name: tenantKey === "alpha" ? "Aurora Coastal House" : "Riverfront Equipment Hub",
      category: tenantKey === "alpha" ? "Real estate" : "Equipment",
      createdBy: members[0].id,
      jurisdiction: "GR",
      disclosureVersion: "DEMO-v1",
      stage: "evidence_pending",
      approvedBy: null,
      evidence: REQUIRED_DOCUMENTS.map(([kind, label], index) => ({
        id: "demo-evidence-" + tenantKey + "-" + kind,
        kind,
        label,
        state: "submitted_mock",
        submitter: members[0].id,
        reviewer: null,
        // Placeholder only: there are NO documents or trusted hashes stored.
        mockEvidenceLabel: "Illustrative attachment " + (index + 1)
      }))
    },
    history: []
  };
}

export function reviewBlockers(state) {
  assertDemoState(state);
  const blockers = [];
  const kinds = new Map(state.asset.evidence.map((item) => [item.kind, item]));
  for (const [kind, label] of REQUIRED_DOCUMENTS) {
    const item = kinds.get(kind);
    if (!item) blockers.push(label + " not provided");
    else if (item.state !== "reviewed_mock") blockers.push(label + " not reviewed");
  }
  if (!state.asset.jurisdiction) blockers.push("Missing jurisdiction");
  if (!state.asset.disclosureVersion) blockers.push("Missing disclosure version");
  return blockers;
}

function assertDemoState(state) {
  if (!state || state.mode !== REVIEW_MODE || typeof state.tenantId !== "string" ||
      !state.tenantId.startsWith("demo-tenant-")) throw new Error("Only fictional review state is allowed");
  if (!state.asset || state.asset.tenantId !== state.tenantId ||
      !state.asset.id.startsWith("demo-review-") ||
      !REVIEW_STAGES.includes(state.asset.stage)) throw new Error("Untrusted asset state");
  if (!Array.isArray(state.history) || !Array.isArray(state.members) || !Array.isArray(state.asset.evidence)) throw new Error("Incomplete preview state");
}

function getMember(state, userId) {
  const member = state.members.find((candidate) => candidate.id === userId);
  if (!member || member.status !== "active" ||
      member.tenantId !== state.tenantId ||
      !member.id.startsWith("demo-")) throw new Error("Not an active member of this asset tenant");
  return member;
}

function assertRole(member, allowed) {
  if (!allowed.includes(member.role)) throw new Error("This role cannot perform that review action");
}

function assertEvidenceShape(state) {
  const seen = new Set();
  for (const document of state.asset.evidence) {
    if (!REQUIRED_DOCUMENTS.some(([kind]) => kind === document.kind)) throw new Error("Unknown evidence type");
    if (seen.has(document.kind)) throw new Error("Duplicate evidence type");
    seen.add(document.kind);
    if (!["submitted_mock", "reviewed_mock"].includes(document.state)) throw new Error("Untrusted evidence state");
    if (document.submitter === document.reviewer && document.reviewer) throw new Error("Self-reviewed evidence is not allowed");
  }
}

export function reviewPermissions(state, userId) {
  assertDemoState(state);
  const member = getMember(state, userId);
  const stage = state.asset.stage;
  const eligible = reviewBlockers(state).length === 0;
  return {
    role: member.role,
    canVerify: member.role === "reviewer" && stage === "evidence_pending",
    canRequestReview: member.role === "operator" && stage === "evidence_pending" && eligible,
    canApprove: member.role === "reviewer" && stage === "under_review_demo" && eligible &&
      member.id !== state.asset.createdBy,
    canReject: member.role === "reviewer" && stage === "under_review_demo",
    canMarkReady: member.role === "operator" && stage === "approved_demo" && eligible,
    canSuspend: ["operator", "reviewer"].includes(member.role) && stage === "publish_ready_demo"
  };
}

/**
 * Returns a fresh state object. Never changes the supplied state or records.
 * In production, the backend—not the browser—must authenticate the actor and
 * enforce transitions in a transaction with a version precondition.
 */
export function simulateReviewTransition(state, { actorId, action, evidenceId, expectedSequence } = {}) {
  assertDemoState(state);
  if (!REVIEW_ACTIONS.includes(action)) throw new Error("Unsupported or regulated action");
  if (!Number.isSafeInteger(expectedSequence) || expectedSequence !== state.history.length)
    throw new Error("Stale review revision");
  const member = getMember(state, actorId);
  const next = structuredClone(state);
  assertEvidenceShape(next);
  const stage = next.asset.stage;
  const blocked = () => reviewBlockers(next).length > 0;
  const isStage = (expected) => {
    if (stage !== expected) throw new Error("Illegal state transition");
  };
  let detail = "";

  switch (action) {
    case "verify_document": {
      assertRole(member, ["reviewer"]);
      isStage("evidence_pending");
      const document = next.asset.evidence.find((row) => row.id === evidenceId);
      if (!document || document.state !== "submitted_mock") throw new Error("Document not awaiting review");
      if (document.submitter === member.id || member.id === next.asset.createdBy) throw new Error("Independent review required");
      document.state = "reviewed_mock";
      document.reviewer = member.id;
      detail = "Fictional checklist marked reviewed: " + document.label;
      break;
    }
    case "request_review":
      assertRole(member, ["operator"]);
      isStage("evidence_pending");
      if (blocked()) throw new Error("Unreviewed evidence blocks submission");
      next.asset.stage = "under_review_demo";
      detail = "Fictional asset submitted for approval";
      break;
    case "approve":
      assertRole(member, ["reviewer"]);
      isStage("under_review_demo");
      if (blocked()) throw new Error("Unreviewed evidence blocks approval");
      if (member.id === next.asset.createdBy) throw new Error("Creator cannot approve own asset");
      next.asset.approvedBy = member.id;
      next.asset.stage = "approved_demo";
      detail = "Fictional asset approved in preview only";
      break;
    case "reject":
      assertRole(member, ["reviewer"]);
      isStage("under_review_demo");
      next.asset.stage = "rejected_demo";
      detail = "Fictional asset rejected";
      break;
    case "mark_publish_ready":
      assertRole(member, ["operator"]);
      isStage("approved_demo");
      if (blocked() || !next.asset.approvedBy) throw new Error("Approval and documentation required");
      next.asset.stage = "publish_ready_demo";
      detail = "Fictional readiness milestone only — no live publication";
      break;
    case "suspend":
      assertRole(member, ["operator", "reviewer"]);
      isStage("publish_ready_demo");
      next.asset.stage = "suspended_demo";
      detail = "Fictional asset suspended";
      break;
    default:
      throw new Error("Unsupported action");
  }

  const seq = next.history.length + 1;
  next.history.push({
    sequence: seq,
    prevSequence: seq - 1,
    tenantId: next.tenantId,
    actorId: member.id,
    role: member.role,
    action,
    assetId: next.asset.id,
    detail,
    binding: false
  });
  // This is only a displayed in-memory audit preview, NOT a secure ledger.
  return next;
}
