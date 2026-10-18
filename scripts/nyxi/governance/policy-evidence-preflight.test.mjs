import {test} from 'node:test';
import assert from 'node:assert/strict';
import {policyEvidencePreflight} from './policy-evidence-preflight.mjs';

test('missing evidence holds without granting permissions', () => {
 const result=policyEvidencePreflight({});
 assert.equal(result.state,'HOLD');
 assert.equal(result.publication_authorized,false);
 assert.ok(result.blockers.includes('POLICY_BYTES_NOT_VERIFIED'));
});

test('unverified policy bytes hold', () => {
 const result=policyEvidencePreflight({
  source:{id:'s1',canonical_url:'https://example.com/page'},
  snapshot:{id:'v1',source_id:'s1',fetched_at:'2026-10-10T00:00:00Z'},
  evidence:{source_id:'s1',snapshot_id:'v1',policy_url:'https://example.com/policy',
   final_url:'https://example.com/policy',captured_at:'2026-10-01T00:00:00Z',
   http_status:200,mime_type:'text/html',no_link_following:true,
   scope:'original_first_party_html_only',collector_user_id:'a',reviewer_user_id:'b'}
 });
 assert.equal(result.state,'HOLD');
 assert.equal(result.publication_authorized,false);
});
