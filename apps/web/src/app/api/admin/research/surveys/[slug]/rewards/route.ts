import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    if (!productionDatabaseConfigured()) {
      return Response.json({ error: "RESEARCH_DATABASE_UNAVAILABLE" }, { status: 503, headers: noStore });
    }
    const { slug } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.entitlementId === "string" ? body.entitlementId.trim() : "";
    if (body.action !== "revoke" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return Response.json({ error: "RESEARCH_REWARD_ACTION_INVALID" }, { status: 400, headers: noStore });
    }

    const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
    const result = await uow.withTransaction(
      { platformAccess: true, marketId: "sparta", requestId: "admin-research-reward-revoke" },
      tx => tx.query<SqlRow>(`
        UPDATE research_reward_entitlements re
        SET status='cancelled',
            metadata=re.metadata || jsonb_build_object('revokedAt',now(),'reason','admin_revoke')
        WHERE re.id=$1::uuid
          AND re.status IN ('eligible','issued')
          AND EXISTS (
            SELECT 1
            FROM research_responses rr
            JOIN research_studies s ON s.id=rr.study_id
            WHERE rr.id=re.response_id AND s.slug=$2
          )
        RETURNING re.id::text AS id
      `, [id, slug])
    );
    if (!result.rowCount) {
      return Response.json({ error: "RESEARCH_REWARD_NO_LONGER_REVOCABLE" }, { status: 409, headers: noStore });
    }
    await recordAdminAudit(
      principal, "research.reward.revoked", "research_reward_entitlement", id,
      "Revoke unredeemed research thank-you code", { studySlug: slug }
    );
    return Response.json({ status: "cancelled", entitlementId: id }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_REWARD_REVOKE_FAILED";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401
      : message.includes("CSRF") || message.includes("permission") ? 403 : 400;
    return Response.json({ error: message }, { status, headers: noStore });
  }
}
