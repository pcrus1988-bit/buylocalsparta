import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { policyEvidencePreflight } from './policy-evidence-preflight.mjs';

const policyBytes = Buffer.from('first-party policy bytes: test fixture only');
const sha256 = createHash('sha256').update(policyBytes).digest('hex');
function fixture() {
  return {
    source: { id: 'source-1', canonical_url: 'https://www.fda.gov/cosmetics' },
    snapshot: { id: 'snapshot-1', source_id: 'source-1', fetched_at: '2026-10-20T00:00:00Z' },
    evidence: {
      source_id: 'source-1', snapshot_id: 'snapshot-1',
      policy_url: 'https://www.fda.gov/about-fda/policies',
      final_url: 'https://www.fda.gov/about-fda/policies',
      captured_at: '2026-10-19T00:00:00Z',
      http_status: 200, mime_type: 'text/html', no_link_following: true,
      scope: 'original_first_party_html_only', collector_user_id: 'collector-1',
      reviewer_user_id: 'reviewer-2', sha256,
    },
    policyBytes,
  };
}
function expectHold(change, blocker) {
  const input = fixture();
  change(input);
  const r = policyEvidencePreflight(input);
  assert.equal(r.state, 'HOLD');
  assert.ok(r.blockers.includes(blocker), JSON.stringify(r));
  assert.equal(r.acquisition_authorized, false);
  assert.equal(r.mirror_authorized, false);
  assert.equal(r.publication_authorized, false);
}
test('valid verified bytes only queue independent review, never grant rights', () => {
  const r = policyEvidencePreflight(fixture());
  assert.equal(r.state, 'READY_FOR_AUTHENTICATED_HUMAN_REVIEW');
  assert.equal(r.acquisition_authorized, false);
  assert.equal(r.publication_authorized, false);
  assert.equal(r.mirror_authorized, false);
});
const cases = [
  ['reject non-default HTTPS port', x => { x.evidence.policy_url = x.evidence.final_url = 'https://www.fda.gov:8443/policies'; }, 'POLICY_URL_SCOPE'],
  ['reject internal hostname', x => { x.source.canonical_url = 'https://api.internal/doc'; x.evidence.policy_url = x.evidence.final_url = 'https://api.internal/policies'; }, 'POLICY_URL_SCOPE'],
  ['reject IP literal', x => { x.source.canonical_url = 'https://127.0.0.1/doc'; x.evidence.policy_url = x.evidence.final_url = 'https://127.0.0.1/policies'; }, 'POLICY_URL_SCOPE'],
  ['reject URL credentials', x => { x.evidence.policy_url = x.evidence.final_url = 'https://user:pass@www.fda.gov/policies'; }, 'POLICY_URL_SCOPE'],
  ['reject cross-origin policy', x => { x.evidence.policy_url = x.evidence.final_url = 'https://www.gov.uk/policies'; }, 'POLICY_URL_SCOPE'],
  ['reject absent source identity', x => { x.source.id = x.snapshot.source_id = x.evidence.source_id = undefined; }, 'EXACT_SNAPSHOT_BINDING'],
  ['reject changed snapshot binding', x => { x.snapshot.source_id = 'other'; }, 'EXACT_SNAPSHOT_BINDING'],
  ['reject future-dated policy', x => { x.evidence.captured_at = '2099-01-01T00:00:00Z'; x.snapshot.fetched_at = '2099-01-02T00:00:00Z'; }, 'HISTORICAL_POLICY_NOT_PROVEN'],
  ['reject oversized policy payload', x => { x.policyBytes = Buffer.alloc(2 * 1024 * 1024 + 1); }, 'POLICY_BYTES_NOT_VERIFIED'],
  ['reject tampered policy payload', x => { x.policyBytes = Buffer.from('tampered'); }, 'POLICY_BYTES_NOT_VERIFIED'],
  ['reject case-variant same reviewer', x => { x.evidence.reviewer_user_id = 'COLLECTOR-1'; }, 'REVIEWER_SEPARATION_UNPROVEN'],
  ['reject reviewer control characters', x => { x.evidence.reviewer_user_id = 'bad\nreviewer'; }, 'REVIEWER_SEPARATION_UNPROVEN'],
  ['reject revoked policy evidence', x => { x.evidence.revoked_at = '2026-10-20T00:00:00Z'; }, 'RIGHTS_SCOPE'],
  ['reject redirected policy identity', x => { x.evidence.final_url = 'https://www.fda.gov/other'; }, 'POLICY_URL_SCOPE'],
  ['reject non-HTML response', x => { x.evidence.mime_type = 'application/pdf'; }, 'POLICY_RESPONSE_SCOPE'],
];
for (const [name, change, blocker] of cases) test(name, () => expectHold(change, blocker));
