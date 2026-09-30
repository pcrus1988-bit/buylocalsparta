import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCatalogueOperationsWorkspace } from "../apps/web/src/lib/admin-catalogue-operations.ts";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";

const runtime = getProductionPostgresRuntime();

try {
  const readiness = await productionDatabaseReadiness();
  assert(readiness.ok, `catalogue operations smoke requires a ready database: ${readiness.message}`);

  const actor = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.users(email,password_hash,status,email_verified_at)
    VALUES('ci-catalogue-operations@example.test','ci-only-not-a-runtime-password','active',now())
    ON CONFLICT (email) DO UPDATE SET status='active'
    RETURNING id::text
  `);
  const userId = required(actor.rows[0]?.id, "catalogue operations CI actor");

  const principal: SessionPrincipal = {
    sessionId: "ci-catalogue-operations-session",
    userId,
    email: "ci-catalogue-operations@example.test",
    roles: ["super_admin"],
    csrfToken: "ci-catalogue-operations-csrf"
  };

  const workspace = await adminCatalogueOperationsWorkspace(principal);
  assert(workspace.queues.length === 5, "unified catalogue operations must expose five governed decision lanes");
  assert(workspace.queues.some((queue) => queue.key === "identity"), "identity lane is required");
  assert(workspace.queues.some((queue) => queue.key === "intelligence"), "intelligence lane is required");
  assert(workspace.queues.some((queue) => queue.key === "attribute"), "attribute lane is required");
  assert(workspace.queues.some((queue) => queue.key === "controlled_value"), "controlled value lane is required");
  assert(workspace.queues.some((queue) => queue.key === "matching"), "matching lane is required");
  assert(workspace.humanDecisionCount >= 0, "human decision count must be non-negative");
  assert(workspace.automation.intelligenceRefreshPending >= 0, "intelligence automation backlog must be non-negative");
  assert(workspace.automation.canonicalizationRowsPending >= 0, "canonicalization automation backlog must be non-negative");

  console.log(JSON.stringify({
    ok: true,
    humanDecisionCount: workspace.humanDecisionCount,
    queues: workspace.queues.map((queue) => ({ key: queue.key, count: queue.count, affected: queue.affected })),
    automation: workspace.automation
  }));
} finally {
  await runtime.close();
}

function required(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
