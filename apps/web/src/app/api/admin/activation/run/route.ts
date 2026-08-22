import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { runProductionActivationReadiness } from "../../../../../lib/admin-activation-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "admin.audit.read" });
    if (!principal.roles.includes("super_admin")) throw new Error("Only a super admin may run production activation checks");
    const result = await runProductionActivationReadiness(principal);
    await recordAdminAudit(
      principal,
      "activation.production_readiness_checked",
      "deployment",
      result.buildVersion,
      "Fresh read-only provider activation checks executed from production",
      { passed: result.passed, failed: result.failed, blocked: result.blocked, skipped: result.skipped, observedAt: result.observedAt, expiresAt: result.expiresAt }
    );
    const warning = result.failed || result.blocked
      ? `Οι έλεγχοι καταγράφηκαν: ${result.passed} passed · ${result.failed} failed · ${result.blocked} blocked · ${result.skipped} skipped.`
      : undefined;
    return Response.json({ ok: true, ...result, warning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "production_activation_run_failed" }, { status: 400 });
  }
}
