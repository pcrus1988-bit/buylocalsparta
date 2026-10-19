import test from "node:test";
import assert from "node:assert/strict";
import {
  createReviewDemo, REVIEW_ACTIONS, REVIEW_MODE, REQUIRED_DOCUMENTS,
  reviewBlockers, reviewPermissions, simulateReviewTransition
} from "../public/platform/review.mjs";

function use(state, actor, action, extra = {}) {
  return simulateReviewTransition(state, { actorId: actor, action, expectedSequence: state.history.length, ...extra });
}

function approvedState() {
  let state = createReviewDemo();
  for (const document of state.asset.evidence) {
    state = use(state, "demo-alpha-reviewer", "verify_document", { evidenceId: document.id });
  }
  state = use(state, "demo-alpha-operator", "request_review");
  state = use(state, "demo-alpha-reviewer", "approve");
  return state;
}

test("starting review snapshots are isolated fictional non-persistent fixtures", () => {
  const a = createReviewDemo("alpha");
  const b = createReviewDemo("beta");
  assert.equal(a.mode, REVIEW_MODE);
  assert.notEqual(a.tenantId, b.tenantId);
  assert.notEqual(a.asset.id, b.asset.id);
  assert.equal(a.asset.stage, "evidence_pending");
  assert.equal(a.asset.evidence.length, REQUIRED_DOCUMENTS.length);
  assert.equal(a.history.length, 0);
  assert.throws(() => createReviewDemo("production"), /Unknown demo tenant/);
});

test("separate operator/reviewer/auditor roles are enforced", () => {
  const state = createReviewDemo();
  assert.equal(reviewPermissions(state, "demo-alpha-operator").canVerify, false);
  assert.equal(reviewPermissions(state, "demo-alpha-reviewer").canVerify, true);
  assert.equal(reviewPermissions(state, "demo-alpha-auditor").canVerify, false);
  assert.throws(() => use(state, "demo-alpha-operator", "verify_document", { evidenceId: state.asset.evidence[0].id }), /role cannot/);
  assert.throws(() => use(state, "demo-alpha-auditor", "verify_document", { evidenceId: state.asset.evidence[0].id }), /role cannot/);
});

test("cross-tenant identities are always refused", () => {
  const state = createReviewDemo("alpha");
  assert.throws(() => use(state, "demo-beta-reviewer", "verify_document", { evidenceId: state.asset.evidence[0].id }), /Not an active member/);
  assert.throws(() => reviewPermissions(state, "demo-beta-operator"), /Not an active member/);
});

test("unreviewed evidence fails closed", () => {
  const state = createReviewDemo();
  assert.equal(reviewBlockers(state).length, 4);
  assert.equal(reviewPermissions(state, "demo-alpha-operator").canRequestReview, false);
  assert.throws(() => use(state, "demo-alpha-operator", "request_review"), /Unreviewed evidence/);
});

test("reviewer can independently review mock checklist in sequence", () => {
  let state = createReviewDemo();
  const initial = state;
  for (const document of initial.asset.evidence) state = use(state, "demo-alpha-reviewer", "verify_document", { evidenceId: document.id });
  assert.equal(reviewBlockers(state).length, 0);
  assert.equal(initial.asset.evidence[0].state, "submitted_mock");
  assert.equal(state.history.length, 4);
  assert.deepEqual(state.history.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(state.history[0].prevSequence, 0);
  assert.ok(state.history.every((event) => event.binding === false));
  assert.throws(() => use(state, "demo-alpha-reviewer", "verify_document", { evidenceId: initial.asset.evidence[0].id }), /not awaiting review/);
});

test("approval requires a reviewed stage and independent reviewer", () => {
  const state = createReviewDemo();
  assert.throws(() => use(state, "demo-alpha-reviewer", "approve"), /Illegal state/);
  const approved = approvedState();
  assert.equal(approved.asset.stage, "approved_demo");
  assert.equal(approved.asset.approvedBy, "demo-alpha-reviewer");
  assert.equal(reviewPermissions(approved, "demo-alpha-operator").canMarkReady, true);
});

test("publish-ready is deliberately non-public and reversible to suspended", () => {
  let state = approvedState();
  state = use(state, "demo-alpha-operator", "mark_publish_ready");
  assert.equal(state.asset.stage, "publish_ready_demo");
  state = use(state, "demo-alpha-reviewer", "suspend");
  assert.equal(state.asset.stage, "suspended_demo");
  assert.equal(state.history.at(-1).action, "suspend");
});

test("review can be rejected and cannot progress from rejected stage", () => {
  let state = createReviewDemo();
  for (const document of state.asset.evidence) state = use(state, "demo-alpha-reviewer", "verify_document", { evidenceId: document.id });
  state = use(state, "demo-alpha-operator", "request_review");
  state = use(state, "demo-alpha-reviewer", "reject");
  assert.equal(state.asset.stage, "rejected_demo");
  assert.throws(() => use(state, "demo-alpha-reviewer", "approve"), /Illegal state/);
});

test("optimistic revisions protect against stale replay", () => {
  const state = createReviewDemo();
  assert.throws(() => simulateReviewTransition(state, {
    actorId:"demo-alpha-reviewer", action:"verify_document",
    evidenceId:state.asset.evidence[0].id, expectedSequence:100
  }), /Stale review revision/);
  assert.throws(() => simulateReviewTransition(state, {
    actorId:"demo-alpha-reviewer", action:"verify_document",
    evidenceId:state.asset.evidence[0].id
  }), /Stale review revision/);
});

test("unsupported ownership, payment and token commands never execute", () => {
  const state = createReviewDemo();
  for (const name of ["issue_token", "pay", "grant_rights", "publish", "create_ownership"]) {
    assert.equal(REVIEW_ACTIONS.includes(name), false);
    assert.throws(() => use(state, "demo-alpha-operator", name), /Unsupported or regulated action/);
  }
});

test("the preview fails closed on tampered states", () => {
  const state = createReviewDemo();
  const copy = structuredClone(state);
  copy.mode = "live";
  assert.throws(() => reviewBlockers(copy), /Only fictional review/);
  const copy2 = structuredClone(state);
  copy2.asset.tenantId = "demo-tenant-beta";
  assert.throws(() => use(copy2, "demo-alpha-reviewer", "verify_document", { evidenceId:copy2.asset.evidence[0].id }), /Untrusted asset state/);
  const copy3 = structuredClone(state);
  copy3.asset.evidence.push({ ...copy3.asset.evidence[0] });
  assert.throws(() => use(copy3, "demo-alpha-reviewer", "verify_document", { evidenceId:copy3.asset.evidence[0].id }), /Duplicate evidence type/);
});

test("review does not mutate caller state", () => {
  const original = createReviewDemo();
  const copy = structuredClone(original);
  use(original, "demo-alpha-reviewer", "verify_document", { evidenceId: original.asset.evidence[0].id });
  assert.deepEqual(original, copy);
});
