import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectArchivedAsset, duplicateCandidates } from './archived-asset-integrity.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = Buffer.from('<html>Official first-party evidence</html>');
const sourceId = '5e100658-ea96-47d6-8cb3-fab18dbbf78b';
const approvalId = '212bf852-ea98-4772-840c-78dfd36ffd50';
const snapshotId = 'f62c4607-8090-491b-9306-3822762657e7';
const url = 'https://www.fda.gov/cosmetics/cosmetics-laws-regulations/prohibited-restricted-ingredients-cosmetics';
function fixture() {
  return {
    source: { id: sourceId, canonical_url: url },
    approval: {
      id: approvalId, source_id: sourceId, asset_url: url, approved_final_url: url,
      acquisition_authorized: true, approved_at: '2026-10-09T13:50:00Z',
      expires_at: '2027-01-08T22:00:00Z', retention_until: null
    },
    snapshot: {
      id: snapshotId, source_id: sourceId, final_url: url,
      fetched_at: '2026-10-23T02:50:03Z', sha256: sha(bytes),
      byte_length: bytes.length, storage_bucket: 'nyxi-evidence',
      storage_path: sourceId + '/' + sha(bytes) + '/evidence.html',
      provenance: { asset_approval_id: approvalId }
    },
    originalBytes: bytes
  };
}
test('exact original bytes verify but NEVER confer publication permission', () => {
  const result = inspectArchivedAsset(fixture());
  assert.equal(result.original_bytes_verified, true);
  assert.equal(result.publication_authorized, false);
  assert.equal(result.evidence.original_sha256, sha(bytes));
  assert.deepEqual(result.blockers, []);
});
test('missing original bytes are not an independent attestation', () => {
  const input = fixture(); delete input.originalBytes;
  const r = inspectArchivedAsset(input);
  assert.equal(r.original_bytes_verified, false);
  assert.ok(r.blockers.includes('original_storage_bytes_unavailable'));
  assert.equal(r.evidence, null);
});
test('tampered bytes are rejected', () => {
  const input = fixture(); input.originalBytes = Buffer.from('changed');
  assert.ok(inspectArchivedAsset(input).blockers.includes('original_bytes_mismatch'));
});
test('same-length altered bytes are rejected', () => {
  const input = fixture(); input.originalBytes = Buffer.from(bytes);
  input.originalBytes[0] ^= 1;
  assert.ok(inspectArchivedAsset(input).blockers.includes('original_bytes_mismatch'));
});
test('incorrect approval id in provenance is rejected', () => {
  const input = fixture(); input.snapshot.provenance.asset_approval_id = snapshotId;
  assert.ok(inspectArchivedAsset(input).blockers.includes('acquisition_binding_mismatch'));
});
test('missing IDs never compare equal and never pass', () => {
  const input = fixture(); delete input.source.id; delete input.approval.source_id;
  assert.ok(inspectArchivedAsset(input).blockers.includes('invalid_source_id'));
});
test('source identity substitution is rejected', () => {
  const input = fixture(); input.snapshot.source_id = snapshotId;
  assert.ok(inspectArchivedAsset(input).blockers.includes('source_binding_mismatch'));
});
test('redirected URL not preapproved is rejected', () => {
  const input = fixture(); input.snapshot.final_url = 'https://example.org/redirect';
  assert.ok(inspectArchivedAsset(input).blockers.includes('exact_url_mismatch'));
});
test('insecure or credentialed URL is rejected', () => {
  const input = fixture(); input.approval.asset_url = 'http://example.com/x';
  assert.ok(inspectArchivedAsset(input).blockers.includes('invalid_https_url'));
});
test('authorization must be explicit true', () => {
  const input = fixture(); input.approval.acquisition_authorized = null;
  assert.ok(inspectArchivedAsset(input).blockers.includes('acquisition_not_authorized'));
});
test('capture before authorization is rejected', () => {
  const input = fixture(); input.snapshot.fetched_at = '2026-10-01T00:00:00Z';
  assert.ok(inspectArchivedAsset(input).blockers.includes('capture_outside_authorization_window'));
});
test('capture at expiry boundary is rejected', () => {
  const input = fixture(); input.snapshot.fetched_at = input.approval.expires_at;
  assert.ok(inspectArchivedAsset(input).blockers.includes('capture_outside_authorization_window'));
});
test('historically valid capture remains verifiable after approval expiry', () => {
  const input = fixture(); input.approval.expires_at = '2026-10-24T00:00:00Z';
  assert.equal(inspectArchivedAsset(input).original_bytes_verified, true);
});
test('storage path traversal is rejected', () => {
  const input = fixture(); input.snapshot.storage_path = sourceId + '/' + sha(bytes) + '/../secret';
  assert.ok(inspectArchivedAsset(input).blockers.includes('invalid_private_storage_binding'));
});
test('different content-addressed path is rejected', () => {
  const input = fixture(); input.snapshot.storage_path = sourceId + '/' + 'a'.repeat(64) + '/evidence.html';
  assert.ok(inspectArchivedAsset(input).blockers.includes('invalid_private_storage_binding'));
});
test('policy bytes without independently anchored hash are not evidence', () => {
  const input = fixture(); input.rightsDocumentBytes = Buffer.from('license');
  assert.equal(inspectArchivedAsset(input).rights_document_verified, false);
});
test('wrong policy hash is rejected', () => {
  const input = fixture(); input.rightsDocumentBytes = Buffer.from('license');
  input.independentlyAnchoredRightsSha256 = '0'.repeat(64);
  assert.equal(inspectArchivedAsset(input).rights_document_verified, false);
});
test('matching independent policy anchor verifies identity, not publication rights', () => {
  const input = fixture(); input.rightsDocumentBytes = Buffer.from('license');
  input.independentlyAnchoredRightsSha256 = sha(input.rightsDocumentBytes);
  const r = inspectArchivedAsset(input);
  assert.equal(r.rights_document_verified, true);
  assert.equal(r.publication_authorized, false);
});
test('retention gap is flagged but does not rewrite historical capture', () => {
  const r = inspectArchivedAsset(fixture());
  assert.ok(r.warnings.includes('retention_deadline_missing'));
  assert.equal(r.original_bytes_verified, true);
});
test('duplicate candidate grouping never deletes or cross-deduplicates sources', () => {
  const a = fixture().snapshot;
  const b = { ...a, id: '00000000-0000-4000-8000-000000000001' };
  const c = { ...a, id: '00000000-0000-4000-8000-000000000002', source_id: snapshotId };
  const r = duplicateCandidates([a, b, c]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].snapshot_ids, [a.id, b.id]);
});
test('missing records fail closed', () => {
  assert.deepEqual(inspectArchivedAsset().blockers, ['missing_records']);
});
