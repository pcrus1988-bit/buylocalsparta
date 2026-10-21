import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triagePolicyReference } from './rights-origin-triage.mjs';

test('cross-origin policy requires human review', () => {
  const result = triagePolicyReference({
    sourceUrl: 'https://health.ec.europa.eu/policy',
    policyUrl: 'https://commission.europa.eu/legal-notice_en'
  });
  assert.equal(result.status, 'HOLD');
  assert.ok(result.blockers.includes('CROSS_ORIGIN_SCOPE_REQUIRES_HUMAN_REVIEW'));
  assert.equal(result.publication_authorized, false);
});

test('same-origin policy does not confer rights', () => {
  const result = triagePolicyReference({
    sourceUrl: 'https://health.ec.europa.eu/policy',
    policyUrl: 'https://health.ec.europa.eu/legal-notice',
    evidenceHash: 'a'.repeat(64)
  });
  assert.equal(result.status, 'HOLD');
  assert.equal(result.acquisition_authorized, false);
  assert.equal(result.mirror_authorized, false);
  assert.equal(result.publication_authorized, false);
});
