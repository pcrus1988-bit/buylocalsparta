import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observeDocumentaryRightsEvidence } from './documentary-rights-evidence.mjs';

const uuid = c => c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12);
const hash = c => c.repeat(64);
const bytes = Buffer.from('Public policy text - not a license grant.');
const sha = createHash('sha256').update(bytes).digest('hex');
const make = () => {
  const sourceId = uuid('a'), approvalId = uuid('b'), snapshotHash = hash('c');
  return {
    source: { id: sourceId, canonical_url: 'https://agency.gov/nail' },
    approval: { id: approvalId, source_id: sourceId, asset_url: 'https://agency.gov/nail',
      approved_final_url: 'https://agency.gov/nail', rights_policy_url: 'https://agency.gov/rights',
      approved_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-31T00:00:00Z',
      acquisition_authorized: true, metadata: {} },
    snapshot: { id: uuid('d'), source_id: sourceId, sha256: snapshotHash,
      byte_length: 120, fetched_at: '2026-10-20T00:00:00Z',
      final_url: 'https://agency.gov/nail', storage_bucket: 'nyxi-evidence',
      storage_path: sourceId+'/'+snapshotHash+'/original.html',
      provenance: { asset_approval_id: approvalId } },
    policyUrl: 'https://agency.gov/rights', policyBytes: bytes,
    observedAt: '2026-10-23T12:00:00Z'
  };
};
test('exact bytes produce a metadata-only rights HOLD', () => {
  const event = observeDocumentaryRightsEvidence(make());
  assert.equal(event.document_sha256, sha);
  assert.equal(event.document_byte_length, bytes.byteLength);
  assert.equal(event.publication_authorized, false);
  assert.equal(event.rights_review_required, true);
  assert.equal(event.independently_archived, false);
  assert.equal(event.independent_rights_review_complete, false);
  assert.equal(event.recorded_anchor_matches, false);
  assert.ok(Object.isFrozen(event));
  assert.ok(!JSON.stringify(event).includes('policy text'));
  assert.ok(!JSON.stringify(event).includes('original.html'));
  assert.ok(!JSON.stringify(event).includes('agency.gov'));
});
test('matching recorded hash is not publication permission', () => {
  const input = make(); input.approval.metadata.rights_policy_sha256 = sha;
  const event = observeDocumentaryRightsEvidence(input);
  assert.equal(event.recorded_anchor_matches, true);
  assert.equal(event.publication_authorized, false);
});
test('conflicting recorded hash rejected', () => {
  const input = make(); input.approval.metadata.rights_policy_sha256 = hash('e');
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_anchor_conflict/);
});
test('malformed recorded hash rejected', () => {
  const input = make(); input.approval.metadata.rights_policy_sha256 = 'bad';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_anchor_conflict/);
});
test('modified policy bytes rejected against recorded hash', () => {
  const input = make(); input.approval.metadata.rights_policy_sha256 = sha;
  input.policyBytes = Buffer.from('tampered');
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_anchor_conflict/);
});
test('different policy URL rejected', () => {
  const input = make(); input.policyUrl = 'https://agency.gov/other';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_url_not_authorized/);
});
test('HTTP policy URL rejected', () => {
  const input = make(); input.policyUrl = input.approval.rights_policy_url = 'http://agency.gov/rights';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_url_not_authorized/);
});
test('URL credentials rejected', () => {
  const input = make(); input.policyUrl = input.approval.rights_policy_url = 'https://user:pass@agency.gov/rights';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_url_not_authorized/);
});
test('URL fragment rejected', () => {
  const input = make(); input.policyUrl = input.approval.rights_policy_url = 'https://agency.gov/rights#excerpt';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /rights_policy_url_not_authorized/);
});
test('string bytes rejected', () => {
  const input = make(); input.policyBytes = 'not original bytes';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /invalid_rights_policy_bytes/);
});
test('empty bytes rejected', () => {
  const input = make(); input.policyBytes = Buffer.alloc(0);
  assert.throws(() => observeDocumentaryRightsEvidence(input), /invalid_rights_policy_bytes/);
});
test('oversized policy rejected', () => {
  const input = make(); input.policyBytes = Buffer.alloc(8 * 1024 * 1024 + 1);
  assert.throws(() => observeDocumentaryRightsEvidence(input), /invalid_rights_policy_bytes/);
});
test('mismatched acquisition rejected', () => {
  const input = make(); input.snapshot.provenance.asset_approval_id = uuid('e');
  assert.throws(() => observeDocumentaryRightsEvidence(input), /acquisition_binding_invalid/);
});
test('unauthorized acquisition rejected', () => {
  const input = make(); input.approval.acquisition_authorized = false;
  assert.throws(() => observeDocumentaryRightsEvidence(input), /acquisition_binding_invalid/);
});
test('observation before capture rejected', () => {
  const input = make(); input.observedAt = '2026-10-19T00:00:00Z';
  assert.throws(() => observeDocumentaryRightsEvidence(input), /invalid_event_fields/);
});
test('missing observedAt rejected', () => {
  const input = make(); delete input.observedAt;
  assert.throws(() => observeDocumentaryRightsEvidence(input), /invalid_observed_at/);
});
