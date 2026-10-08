import { PostgresUnitOfWork } from "@buy-local-sparta/core";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";
import { issueQaHubReward, listQaHubRewards, revokeQaHubReward } from "../../../../../lib/hub-reward-qa";
import { HubResearchRewardError } from "../../../../../lib/research-reward-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const ledger = () => new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
const scope = { platformAccess: true, marketId: "sparta" };

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "research.manage" });
    if (!productionDatabaseConfigured()) return Response.json({ error: "QA_DATABASE_UNAVAILABLE" }, { status: 503, headers });
    const items = await ledger().withTransaction(
      { ...scope, requestId: "admin-hub-qa-list" },
      tx => listQaHubRewards(tx)
    );
    return Response.json({ items }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json({ error: message === "ADMIN_AUTH_REQUIRED" ? "ADMIN_AUTH_REQUIRED" : "QA_LIST_UNAVAILABLE" }, { status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message.includes("permission") ? 403 : 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    if (!productionDatabaseConfigured()) return Response.json({ error: "QA_DATABASE_UNAVAILABLE" }, { status: 503, headers });
    const raw = await request.text();
    if (raw.length > 2048) return Response.json({ error: "QA_REQUEST_TOO_LARGE" }, { status: 413, headers });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.action === "generate" && body.confirm === "GENERATE ONE QA CODE") {
      const generated = await ledger().withTransaction(
        { ...scope, requestId: "admin-hub-qa-issue" },
        tx => issueQaHubReward(tx, principal.userId),
        { isolation: "serializable" }
      );
      try { await recordAdminAudit(principal, "research.qa_reward.issued", "hub_reward_qa_code", generated.id, "Issue 48-hour QA-only HUB reward"); }
      catch (error) { console.error("hub.qa_reward.audit_failed", error instanceof Error ? error.name : "UnknownError"); }
      // This is the ONLY response where the plaintext code is exposed.
      return Response.json({ ok: true, ...generated }, { status: 201, headers });
    }
    if (body.action === "revoke" && typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
      const success = await ledger().withTransaction(
        { ...scope, requestId: "admin-hub-qa-revoke" },
        tx => revokeQaHubReward(tx, body.id as string)
      );
      if (!success) return Response.json({ error: "QA_CODE_NOT_REVOCABLE" }, { status: 409, headers });
      try { await recordAdminAudit(principal, "research.qa_reward.revoked", "hub_reward_qa_code", body.id, "Revoke unredeemed QA code"); }
      catch (error) { console.error("hub.qa_reward.audit_failed", error instanceof Error ? error.name : "UnknownError"); }
      return Response.json({ ok: true, status: "revoked" }, { headers });
    }
    return Response.json({ error: "QA_ACTION_INVALID" }, { status: 400, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401
      : message.includes("CSRF") || message.includes("permission") ? 403
      : error instanceof HubResearchRewardError ? error.status : 503;
    return Response.json({ error: error instanceof HubResearchRewardError ? error.message : status === 403 ? "ADMIN_FORBIDDEN" : "QA_OPERATION_UNAVAILABLE" }, { status, headers });
  }
}
