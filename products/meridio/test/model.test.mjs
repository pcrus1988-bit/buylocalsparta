import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ASSET_CATEGORIES, DEMO_STATUS, assertPreviewAsset, evidenceReadiness,
  findAssets, previewAccessChecks, previewProposalOutcome, previewSlotSelection
} from "../public/platform/model.mjs";
import { demoAssets, getExample } from "../public/platform/examples.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "../public/workspace/index.html"), "utf8");
const landing = readFileSync(join(here, "../public/index.html"), "utf8");
const siteConfig = readFileSync(join(here, "../vercel.json"), "utf8");

test("all eight example assets are clearly fictional and well-formed", () => {
  assert.equal(demoAssets.length, 8);
  assert.equal(new Set(demoAssets.map((asset) => asset.id)).size, demoAssets.length);
  for (const asset of demoAssets) {
    assert.ok(assertPreviewAsset(asset));
    assert.equal(asset.status, DEMO_STATUS);
    assert.match(asset.location, /fictional/i);
    assert.match(asset.valueDisclosure, /No price, valuation, returns or ownership interests/i);
    assert.equal(asset.proposals.length, 1);
    assert.equal(asset.slots.length, 3);
  }
});

test("each category is recognized and domain taxonomy covers ten worlds", () => {
  assert.equal(ASSET_CATEGORIES.length, 10);
  assert.deepEqual([...new Set(ASSET_CATEGORIES)], ASSET_CATEGORIES);
});

test("asset discovery filters names, summaries and categories case-insensitively", () => {
  assert.equal(findAssets(demoAssets, { query: "solAR" }).length, 1);
  assert.equal(findAssets(demoAssets, { category: "Hospitality" })[0].name, "Olive Retreat");
  assert.equal(findAssets(demoAssets, { query: "No match here" }).length, 0);
  assert.equal(findAssets(demoAssets, {}).length, demoAssets.length);
  assert.equal(getExample("something-external"), null);
});

test("preview asset validation fails closed for non-demo records", () => {
  const asset = structuredClone(demoAssets[0]);
  asset.status = "published";
  assert.throws(() => assertPreviewAsset(asset), /Cannot expose an active asset/);
  asset.status = DEMO_STATUS;
  asset.id = "../database";
  assert.throws(() => assertPreviewAsset(asset), /Invalid demo asset ID/);
});

test("evidence checklists never claim verified completion", () => {
  for (const asset of demoAssets) {
    const readiness = evidenceReadiness(asset);
    assert.equal(readiness.complete, false);
    assert.ok(readiness.missing > 0);
    assert.match(readiness.label, /not verified/i);
  }
});

test("access simulation never authorizes real bookings", () => {
  const asset = demoAssets[0];
  const empty = previewAccessChecks(asset);
  assert.equal(empty.hypotheticalEligible, false);
  assert.equal(empty.canBook, false);
  const passing = previewAccessChecks(asset, { verifiedIdentity: true, recordedRights: true, acceptedRules: true });
  assert.equal(passing.hypotheticalEligible, true);
  assert.equal(passing.canBook, false);
});

test("selected windows are preview-only, never booked", () => {
  const asset = demoAssets[0];
  const result = previewSlotSelection(asset, asset.slots[0].id);
  assert.equal(result.selected, true);
  assert.equal(result.reserved, false);
  assert.equal(previewSlotSelection(asset, "unknown").reserved, false);
});

test("governance quorum and approval thresholds operate independently", () => {
  const examplePass = demoAssets[0].proposals[0];
  const exampleFail = demoAssets[1].proposals[0];
  const passed = previewProposalOutcome(examplePass);
  assert.equal(passed.quorumMet, true);
  assert.equal(passed.approvalMet, true);
  assert.equal(passed.illustrativePass, true);
  assert.equal(passed.binding, false);
  const failed = previewProposalOutcome(exampleFail);
  assert.equal(failed.quorumMet, true);
  assert.equal(failed.approvalMet, false);
  assert.equal(failed.illustrativePass, false);
});

test("abstentions count for quorum but not decisive majority", () => {
  const proposal = { id: "proposal-test", title: "Test", eligibleWeight: 100, quorumBps: 6000, approvalBps: 6000, tally: { yes: 29, no: 20, abstain: 11 } };
  const result = previewProposalOutcome(proposal);
  assert.equal(result.turnout, 60);
  assert.equal(result.quorumMet, true);
  assert.equal(result.approvalMet, false);
  const after = previewProposalOutcome(proposal, "abstain");
  assert.equal(after.tally.abstain, 12);
  assert.equal(after.tally.yes, 29);
});

test("hypothetical vote does not mutate original tally", () => {
  const proposal = demoAssets[0].proposals[0];
  const before = { ...proposal.tally };
  previewProposalOutcome(proposal, "yes");
  previewProposalOutcome(proposal, "no");
  assert.deepEqual(proposal.tally, before);
});

test("invalid vote scenarios or over-allocation are rejected", () => {
  const proposal = demoAssets[0].proposals[0];
  assert.throws(() => previewProposalOutcome(proposal, "buy"), /Invalid scenario/);
  assert.throws(() => previewProposalOutcome({ ...proposal, tally: { yes: 101, no: 0, abstain: 0 } }), /Invalid proposal/);
  const full = { ...proposal, tally: { yes: 100, no: 0, abstain: 0 } };
  assert.throws(() => previewProposalOutcome(full, "no"), /No hypothetical voting weight/);
});

test("workspaces disclose illustrative-only status and do not collect credentials", () => {
  assert.match(workspace, /Fictional examples/i);
  assert.match(workspace, /No real assets/i);
  assert.match(workspace, /noindex,nofollow/);
  assert.doesNotMatch(workspace, /type="password"/);
  assert.doesNotMatch(workspace, /<form\b/i);
  assert.match(workspace, /type="module" src="\/workspace\/workspace.mjs"/);
});

test("homepage links to interactive preview and noindex remains enforced", () => {
  assert.match(landing, /href="\/workspace\/"/);
  const config = JSON.parse(siteConfig);
  const globalHeaders = config.headers.find((item) => item.source === "/(.*)").headers;
  assert.ok(globalHeaders.some((header) => header.key === "X-Robots-Tag" && /noindex/.test(header.value)));
  assert.ok(globalHeaders.some((header) => header.key === "X-Frame-Options" && header.value === "DENY"));
});
