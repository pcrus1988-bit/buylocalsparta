#!/usr/bin/env node
/**
 * NYXI Source Atlas v1 rights triage invariant checks.
 * Read-only. Never grants acquisition or mirroring permission.
 * Run: node scripts/nyxi/validate-rights-review-queue.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const atlas = JSON.parse(fs.readFileSync('data/nyxi/source-governance-v1.json', 'utf8'));
const queue = JSON.parse(fs.readFileSync('data/nyxi/rights-review-queue-20261011.json', 'utf8'));
const expected = atlas.sources.filter(s => s.rightsPolicyStatus === 'NOT_REVIEWED');
const byKey = new Map(atlas.sources.map(s => [s.sourceKey, s]));
const allowedApprovalIds = new Set(atlas.release.firstAcquisitionCohort.assetApprovalIds);
const countUnique = (values) => new Set(values).size;
const priorities = ['P0', 'P1', 'P2', 'P3'];

assert.equal(atlas.sources.length, 303, 'frozen governance identity baseline changed');
assert.equal(queue.status, 'REVIEW_QUEUE_ONLY_NOT_AN_AUTHORIZATION');
assert.equal(queue.entries.length, expected.length, 'pending human review coverage changed');
assert.equal(queue.entries.length, 232, '2026-10-11 checkpoint requires explicit regeneration');
assert.equal(countUnique(queue.entries.map(e => e.sourceKey)), queue.entries.length);
assert.equal(countUnique(queue.entries.map(e => e.canonicalUrl)), queue.entries.length);
assert.equal(countUnique(queue.entries.map(e => e.liveSourceId)), queue.entries.length);
assert(queue.entries.every(e => e.liveSourceId && e.liveSourceKey), 'missing live identity mapping');
assert(queue.entries.every(e => priorities.includes(e.priority)));
assert(queue.entries.every(e => e.humanDecision === 'PENDING_HUMAN_REVIEW'));
assert(queue.entries.every(e => !e.sourceWideAcquisitionAuthorized && !e.mirrorAuthorizedByThisQueue));
assert(queue.entries.every(e => e.retentionPolicy === 'UNASSESSED'));
assert(queue.entries.every(e => !e.identityChangeRequested));
assert(queue.entries.every(e => e.exactAssetApprovalIds.every(id => allowedApprovalIds.has(id))));
assert(queue.entries.every(e => {
  const original = byKey.get(e.sourceKey);
  return original?.rightsPolicyStatus === 'NOT_REVIEWED'
    && original.canonicalUrl === e.canonicalUrl
    && original.origin === e.origin
    && (original.liveSourceId === null || original.liveSourceId === e.liveSourceId);
}), 'identity or rights status mismatch');
assert(expected.every(e => queue.entries.some(q => q.sourceKey === e.sourceKey)), 'pending source omitted');
const counts = Object.fromEntries(priorities.map(p => [p, queue.entries.filter(e => e.priority === p).length]));
assert.deepEqual(counts, queue.summary.priorities);
assert.equal(queue.summary.sourceWideAuthorizationsGrantedByQueue, 0);
assert.equal(queue.summary.mirrorAuthorizationsGrantedByQueue, 0);
console.log(JSON.stringify({status:'PASS',reviewQueue:queue.entries.length,priorities:counts,checks:16}, null, 2));
