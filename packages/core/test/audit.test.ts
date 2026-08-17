import test from "node:test";
import assert from "node:assert/strict";
import { AuditLog } from "../src/index.ts";

test("audit log is append-only and filterable", () => {
  const audit = new AuditLog();
  const event = audit.record({ actorId: "admin-1", actorRole: "super_admin", action: "inventory.override", entityType: "offer", entityId: "offer-1", reason: "verified cycle count", before: { onHand: 2 }, after: { onHand: 4 }, createdAt: 1 });
  assert.equal(audit.events({ entityId: "offer-1" })[0].id, event.id);
  const external = audit.events()[0] as any;
  external.action = "tampered";
  assert.equal(audit.events()[0].action, "inventory.override");
});
