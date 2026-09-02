import { normalizeLaunchControlFilters } from "../../../../../lib/admin-launch-control";
import { adminLaunchControlIntegrityWorkspace } from "../../../../../lib/admin-launch-control-integrity";
import { launchControlTargetCurrentValues } from "../../../../../lib/admin-launch-control-target-progress";
import {
  LAUNCH_CONTROL_TARGETS_KEY,
  writeLaunchControlTargets
} from "../../../../../lib/admin-launch-control-targets";
import { requireAdminSession } from "../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TargetRequest = Readonly<{
  expectedVersion?: unknown;
  targets?: unknown;
}>;

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "analytics.market.read" });
    if (!principal.roles.includes("super_admin")) throw new Error("Only a super admin may change Launch Control targets");
    const body = await request.json() as TargetRequest;
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid Launch Control target version");

    const workspace = await adminLaunchControlIntegrityWorkspace(principal, normalizeLaunchControlFilters({}));
    const currentValues = launchControlTargetCurrentValues(workspace);
    const result = await writeLaunchControlTargets(principal, body.targets, currentValues, expectedVersion);

    await recordAdminAudit(
      principal,
      "launch_control.targets_updated",
      "system_setting",
      LAUNCH_CONTROL_TARGETS_KEY,
      "Governed Launch Control business targets updated",
      {
        market: "sparta",
        version: result.version,
        targetKeys: Object.keys(result.document.targets),
        baselinesCapturedAt: Date.now()
      }
    );

    return Response.json({ ok: true, settings: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "launch_control_targets_update_failed";
    const status = message === "LAUNCH_CONTROL_TARGET_VERSION_CONFLICT" ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
