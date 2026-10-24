import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPrivateInciSequenceCoverage as audit} from './private-inci-sequence-coverage-audit.mjs';
test('INCI sequence validator requires private evidence arrays',()=>{
  assert.throws(()=>audit([],[],[],[],[]),/INVALID_ARRAY/);
});
