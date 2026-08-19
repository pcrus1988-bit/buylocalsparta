import { VivaPaymentsClient, vivaConfigFromEnv } from "@buy-local-sparta/viva-payments";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export function vivaPaymentsEnabled(): boolean { return process.env.VIVA_PAYMENTS_ENABLED === "true"; }

export function vivaPaymentsReady(): boolean {
  if (!vivaPaymentsEnabled() || !process.env.DATABASE_URL?.trim()) return false;
  if (process.env.NODE_ENV === "production" && process.env.VIVA_ENVIRONMENT !== "live" && process.env.BLS_ALLOW_VIVA_DEMO_PREVIEW !== "true") return false;
  try { return Boolean(getProductionPostgresRuntime().vivaPayments); } catch { return false; }
}

export async function vivaPaymentsProviderReadiness(): Promise<{
  enabled: boolean;
  ready: boolean;
  environment: string;
  smartCheckoutScope?: boolean;
  webhookKeyAvailable?: boolean;
  message?: string;
}> {
  const enabled = vivaPaymentsEnabled();
  const environment = process.env.VIVA_ENVIRONMENT ?? "disabled";
  if (!enabled) return { enabled: false, ready: true, environment: "disabled" };
  if (!process.env.DATABASE_URL?.trim()) return { enabled: true, ready: false, environment, message: "Viva payments require PostgreSQL runtime" };
  if (process.env.NODE_ENV === "production" && environment !== "live" && process.env.BLS_ALLOW_VIVA_DEMO_PREVIEW !== "true") {
    return { enabled: true, ready: false, environment, message: "Production Viva payments require VIVA_ENVIRONMENT=live" };
  }
  try {
    if (!getProductionPostgresRuntime().vivaPayments) throw new Error("Viva payments are not configured");
    const provider = await new VivaPaymentsClient(vivaConfigFromEnv()).readiness();
    return {
      enabled: true,
      ready: provider.ok,
      environment: provider.environment,
      smartCheckoutScope: provider.smartCheckoutScope,
      webhookKeyAvailable: provider.webhookKeyAvailable
    };
  } catch (error) {
    return { enabled: true, ready: false, environment, message: error instanceof Error ? error.message : "Viva readiness failed" };
  }
}

export function requireVivaPayments() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Viva payments require PostgreSQL runtime");
  if (!vivaPaymentsEnabled()) throw new Error("Viva payments are not enabled");
  const service = getProductionPostgresRuntime().vivaPayments;
  if (!service) throw new Error("Viva payments are not configured");
  return service;
}
