import { runCatalogueIntakeAutomationCycle } from "../../../../lib/catalogue-intake-automation-runtime";
import {
  verifyCatalogueIntakeGithubToken
} from "../../../../lib/github-actions-oidc";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 700;

export async function POST(request: Request): Promise<Response> {
  const bearer = bearerToken(request.headers.get("authorization"));
  if (!bearer) return noStore({ error: "unauthorized" }, 401);

  let claims;
  try {
    claims = await verifyCatalogueIntakeGithubToken(bearer);
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "catalogue_intake.oidc_rejected",
      message: safeError(error)
    }));
    return noStore({ error: "unauthorized" }, 401);
  }

  const readiness = await productionDatabaseReadiness();
  if (!readiness.ok) {
    console.error(JSON.stringify({
      level: "error",
      event: "catalogue_intake.database_not_ready",
      runId: claims.run_id,
      message: readiness.message
    }));
    return noStore({ error: "database_not_ready", message: readiness.message }, 503);
  }

  const workerId = `github-actions:${claims.run_id}:${claims.run_attempt}`;
  try {
    const result = await runCatalogueIntakeAutomationCycle(
      getProductionPostgresRuntime(),
      { workerId, intelligenceLimit: 25, maxGroups: 3 }
    );

    const ok = result.failedGroups === 0;
    console.log(JSON.stringify({
      level: ok ? "info" : "error",
      event: "catalogue_intake.oidc_cycle_completed",
      githubEvent: claims.event_name,
      githubWorkflowRef: claims.workflow_ref,
      ...result
    }));
    return noStore({ ok, ...result }, ok ? 200 : 500);
  } catch (error) {
    const message = safeError(error);
    console.error(JSON.stringify({
      level: "error",
      event: "catalogue_intake.oidc_cycle_failed",
      runId: claims.run_id,
      message
    }));
    return noStore({ error: "cycle_failed", message }, 500);
  }
}

function bearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function noStore(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
