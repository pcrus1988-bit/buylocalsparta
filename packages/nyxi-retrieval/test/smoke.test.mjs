import test from 'node:test';
import assert from 'node:assert/strict';
import { compareShades } from '../src/index.mjs';
test('RGB alone is not enough', () => assert.deepEqual(compareShades([], { rgb: [1,2,3] }), []));
