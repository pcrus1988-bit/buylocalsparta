import { getProductionPostgresRuntime } from "./postgres-runtime";

export function vivaPaymentsEnabled(): boolean { return process.env.VIVA_PAYMENTS_ENABLED === "true"; }
export function vivaPaymentsReady(): boolean {
  if (!vivaPaymentsEnabled() || !process.env.DATABASE_URL?.trim()) return false;
  if (process.env.NODE_ENV === "production" && process.env.VIVA_ENVIRONMENT !== "live" && process.env.BLS_ALLOW_VIVA_DEMO_PREVIEW !== "true") return false;
  try { return Boolean(getProductionPostgresRuntime().vivaPayments); } catch { return false; }
}
export function requireVivaPayments() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Viva payments require PostgreSQL runtime");
  if (!vivaPaymentsEnabled()) throw new Error("Viva payments are not enabled");
  const service = getProductionPostgresRuntime().vivaPayments;
  if (!service) throw new Error("Viva payments are not configured");
  return service;
}
