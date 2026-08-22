import type { SessionPrincipal } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter, type ActivationCheckKind, type ActivationProvider, type ActivationStatus } from "@buy-local-sparta/postgres-runtime";
import { ResendEmailProvider, resendConfigFromEnv, resendDeliveryEnabled } from "@buy-local-sparta/resend-notifications";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { vivaPaymentsProviderReadiness } from "./viva-runtime";
import { myDataConnectivityCheck, myDataReadiness } from "./mydata-runtime";
import { mediaPipelineReadiness } from "./media-upload-service";
import { WEB_BUILD_VERSION } from "./build";

export type ProductionActivationCheck = Readonly<{
  provider: ActivationProvider;
  environment: string;
  checkName: string;
  checkKind: ActivationCheckKind;
  status: ActivationStatus;
  details: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type ProductionActivationRun = Readonly<{
  buildVersion: string;
  observedAt: number;
  expiresAt: number;
  checks: readonly ProductionActivationCheck[];
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
}>;

export async function runProductionActivationReadiness(principal: SessionPrincipal): Promise<ProductionActivationRun> {
  if (!principal.roles.includes("super_admin")) throw new Error("Only a super admin may record production activation evidence");
  if (process.env.VERCEL_ENV !== "production" && process.env.BLS_DEPLOYMENT_ENVIRONMENT !== "production") {
    throw new Error("Production activation evidence can only be recorded from the production runtime");
  }
  if (!productionDatabaseConfigured()) throw new Error("Production activation evidence requires PostgreSQL");

  const runtime = getProductionPostgresRuntime();
  const limiter = new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  const now = Date.now();
  const rate = await limiter.consume({ route: "admin-production-activation", key: principal.userId, limit: 3, windowMs: 15 * 60 * 1000, now });
  if (!rate.allowed) throw new Error("Production activation checks were run too recently. Try again later.");

  const ttlHours = activationEvidenceTtlHours();
  const expiresAt = now + ttlHours * 60 * 60 * 1000;
  const checks: ProductionActivationCheck[] = [];

  checks.push(await databaseCheck());
  checks.push(await vivaCheck());
  checks.push(await myDataCheck());
  checks.push(await emailCheck());
  checks.push(await searchCheck());
  checks.push(await objectStorageCheck());
  checks.push(clamAvCheck());
  checks.push(await boxNowCheck());
  checks.push(await deployedWebCheck());

  for (const check of checks) {
    await runtime.activationEvidence.record({
      provider: check.provider,
      environment: check.environment,
      buildVersion: WEB_BUILD_VERSION,
      checkName: check.checkName,
      checkKind: check.checkKind,
      status: check.status,
      details: check.details,
      observedAt: now,
      expiresAt
    });
  }

  return {
    buildVersion: WEB_BUILD_VERSION,
    observedAt: now,
    expiresAt,
    checks,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    skipped: checks.filter((check) => check.status === "skipped").length
  };
}

async function databaseCheck(): Promise<ProductionActivationCheck> {
  const state = await getProductionPostgresRuntime().readiness();
  return {
    provider: "database",
    environment: "production",
    checkName: "postgres-readiness",
    checkKind: "connectivity",
    status: state.ok ? "passed" : "failed",
    details: {
      serverVersion: state.serverVersion ?? "unknown",
      postgisVersion: state.postgisVersion ?? "missing",
      schemaVersion: state.appliedSchemaVersion ?? 0,
      expectedSchemaVersion: state.expectedSchemaVersion,
      pendingMigrations: state.pendingMigrations ?? -1,
      message: state.message
    }
  };
}

async function vivaCheck(): Promise<ProductionActivationCheck> {
  if (process.env.VIVA_PAYMENTS_ENABLED !== "true") return skipped("viva", "disabled", "viva-live-readiness", "Viva payments are intentionally disabled");
  const result = await vivaPaymentsProviderReadiness();
  return {
    provider: "viva",
    environment: result.environment,
    checkName: "viva-live-readiness",
    checkKind: "connectivity",
    status: result.ready ? "passed" : "failed",
    details: {
      enabled: result.enabled,
      smartCheckoutScope: result.smartCheckoutScope ?? false,
      webhookKeyAvailable: result.webhookKeyAvailable ?? false,
      message: result.message ?? (result.ready ? "Viva OAuth and webhook-key checks passed" : "Viva readiness failed")
    }
  };
}

async function myDataCheck(): Promise<ProductionActivationCheck> {
  const readiness = await myDataReadiness();
  if (!readiness.configured) return skipped("mydata", "production", "mydata-readonly-connectivity", readiness.message ?? "AADE myDATA is not configured");
  try {
    const result = await myDataConnectivityCheck();
    return {
      provider: "mydata",
      environment: result.environment,
      checkName: "mydata-readonly-connectivity",
      checkKind: "connectivity",
      status: result.ok ? "passed" : "failed",
      details: {
        operation: result.operation,
        readOnly: result.readOnly,
        specVersion: result.specVersion,
        credentialSource: result.credentialSource,
        responseBytes: result.responseBytes,
        policyReady: readiness.ready,
        message: readiness.message ?? "AADE myDATA read-only connectivity passed"
      }
    };
  } catch (error) {
    return failed("mydata", readiness.environment ?? "production", "mydata-readonly-connectivity", error);
  }
}

async function emailCheck(): Promise<ProductionActivationCheck> {
  if (!resendDeliveryEnabled()) return skipped("email", "production", "resend-domain-readiness", "Transactional email delivery is intentionally disabled");
  try {
    const result = await new ResendEmailProvider(resendConfigFromEnv()).readiness();
    return {
      provider: "email",
      environment: "production",
      checkName: "resend-domain-readiness",
      checkKind: "connectivity",
      status: result.ok ? "passed" : "failed",
      details: {
        fromDomain: result.fromDomain,
        domainStatus: result.domainStatus ?? "unknown",
        sending: result.sending ?? "unknown",
        message: result.message
      }
    };
  } catch (error) {
    return failed("email", "production", "resend-domain-readiness", error);
  }
}

async function searchCheck(): Promise<ProductionActivationCheck> {
  if (process.env.BLS_SEARCH_ENABLED !== "true") return skipped("search", "production", "meilisearch-health", "Search provider is intentionally disabled");
  try {
    const result = await getProductionPostgresRuntime().search?.readiness();
    if (!result) return failed("search", "production", "meilisearch-health", new Error("Search runtime is not configured"));
    return {
      provider: "search",
      environment: "production",
      checkName: "meilisearch-health",
      checkKind: "connectivity",
      status: result.ok ? "passed" : "failed",
      details: { status: result.status ?? "unknown", message: result.ok ? "Meilisearch health passed" : "Meilisearch health failed" }
    };
  } catch (error) {
    return failed("search", "production", "meilisearch-health", error);
  }
}

async function objectStorageCheck(): Promise<ProductionActivationCheck> {
  if (process.env.BLS_MEDIA_PIPELINE_ENABLED !== "true") return skipped("object_storage", "production", "object-storage-readiness", "Media/object-storage pipeline is intentionally disabled");
  const result = await mediaPipelineReadiness();
  return {
    provider: "object_storage",
    environment: "production",
    checkName: "object-storage-readiness",
    checkKind: "connectivity",
    status: result.ready ? "passed" : "failed",
    details: { enabled: result.enabled, message: result.message }
  };
}

function clamAvCheck(): ProductionActivationCheck {
  if (process.env.BLS_MEDIA_PIPELINE_ENABLED !== "true") return skipped("clamav", "production", "clamav-worker-readiness", "Media malware scanning is intentionally disabled");
  return {
    provider: "clamav",
    environment: "production",
    checkName: "clamav-worker-readiness",
    checkKind: "connectivity",
    status: "blocked",
    details: { message: "ClamAV is private worker infrastructure and must be certified from the worker network, not the public Vercel runtime" }
  };
}

async function boxNowCheck(): Promise<ProductionActivationCheck> {
  if (process.env.BLS_BOXNOW_ENABLED !== "true") return skipped("boxnow", "production", "boxnow-readiness", "BOX NOW shipping is intentionally disabled");
  try {
    const result = await getProductionPostgresRuntime().boxNowShipping?.readiness();
    if (!result) return failed("boxnow", process.env.BOXNOW_ENVIRONMENT ?? "production", "boxnow-readiness", new Error("BOX NOW runtime is not configured"));
    return {
      provider: "boxnow",
      environment: process.env.BOXNOW_ENVIRONMENT ?? "production",
      checkName: "boxnow-readiness",
      checkKind: "connectivity",
      status: result.ok ? "passed" : "failed",
      details: { message: result.message }
    };
  } catch (error) {
    return failed("boxnow", process.env.BOXNOW_ENVIRONMENT ?? "production", "boxnow-readiness", error);
  }
}

async function deployedWebCheck(): Promise<ProductionActivationCheck> {
  const target = (process.env.BLS_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
  try {
    const response = await fetch(`${target}/api/health/ready`, { headers: { accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => ({})) as { ok?: unknown; build?: unknown };
    const reportedBuild = typeof body.build === "string" ? body.build : "unknown";
    const ok = response.ok && body.ok === true && reportedBuild === WEB_BUILD_VERSION;
    return {
      provider: "web",
      environment: "production",
      checkName: "deployed-readiness-endpoint",
      checkKind: "deployment",
      status: ok ? "passed" : "failed",
      details: { httpStatus: response.status, reportedBuild, targetBuild: WEB_BUILD_VERSION, targetOrigin: new URL(target).origin, message: ok ? "Canonical production readiness endpoint matches this build" : "Production readiness endpoint failed or reported a different build" }
    };
  } catch (error) {
    return failed("web", "production", "deployed-readiness-endpoint", error);
  }
}

function skipped(provider: ActivationProvider, environment: string, checkName: string, message: string): ProductionActivationCheck {
  return { provider, environment, checkName, checkKind: "configuration", status: "skipped", details: { message } };
}

function failed(provider: ActivationProvider, environment: string, checkName: string, error: unknown): ProductionActivationCheck {
  return { provider, environment, checkName, checkKind: "connectivity", status: "failed", details: { message: safeError(error) } };
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/(secret|token|password|api.?key|client.?secret|subscription.?key|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 500);
}

function activationEvidenceTtlHours(): number {
  const raw = process.env.BLS_PRODUCTION_ACTIVATION_EVIDENCE_TTL_HOURS?.trim();
  if (!raw) return 24;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > 168) return 24;
  return value;
}
