import test from "node:test";
import assert from "node:assert/strict";

// Type-only import intentionally pulls the production reconciliation worker into
// the dropship runtime TypeScript project without executing its top-level worker
// loop during tests. This prevents the deployed Nova reconciliation entrypoint
// from drifting outside CI type coverage.
import type {} from "../../../workers/nova-order-reconciliation-worker.ts";

test("Nova order reconciliation worker remains in dropship TypeScript coverage", () => {
  assert.equal(true, true);
});
