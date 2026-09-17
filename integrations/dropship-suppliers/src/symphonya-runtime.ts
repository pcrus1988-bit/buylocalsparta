import { SymphonyaHttpTransport } from "./symphonya-http.ts";
import {
  SYMPHONYA_DEFAULT_CURRENCY,
  SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR,
  SymphonyaAdapter,
  type SymphonyaCarrierName
} from "./symphonya-v1.ts";

export type SymphonyaRuntimeConfig = Readonly<{
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  requestTimeoutMs: number;
  carrier: SymphonyaCarrierName;
  minimumProcurementMinor: number;
  currency: string;
  messagePrefix: string;
}>;

export type SymphonyaRuntime = Readonly<{
  transport: SymphonyaHttpTransport;
  adapter: SymphonyaAdapter;
  config: SymphonyaRuntimeConfig;
}>;

/**
 * Parse the server-side transport configuration. SYMPHONYA_ENABLED is a hard
 * runtime kill switch; catalogue/order feature gates remain controlled by the
 * supplier registration/database layer.
 */
export function envSymphonyaRuntime(env: NodeJS.ProcessEnv = process.env): SymphonyaRuntimeConfig {
  const enabled = booleanEnv(env.SYMPHONYA_ENABLED, false);
  const apiKey = optional(env.SYMPHONYA_API_KEY);
  if (enabled && !apiKey) throw new Error("SYMPHONYA_API_KEY is required when SYMPHONYA_ENABLED=true");

  return Object.freeze({
    enabled,
    apiKey,
    baseUrl: optional(env.SYMPHONYA_API_BASE_URL),
    requestTimeoutMs: positiveInteger(env.SYMPHONYA_REQUEST_TIMEOUT_MS, 15_000, "SYMPHONYA_REQUEST_TIMEOUT_MS"),
    carrier: carrier(env.SYMPHONYA_CARRIER),
    minimumProcurementMinor: positiveInteger(
      env.SYMPHONYA_MINIMUM_PROCUREMENT_MINOR,
      SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR,
      "SYMPHONYA_MINIMUM_PROCUREMENT_MINOR"
    ),
    currency: (optional(env.SYMPHONYA_CURRENCY) ?? SYMPHONYA_DEFAULT_CURRENCY).toUpperCase(),
    messagePrefix: optional(env.SYMPHONYA_MESSAGE_PREFIX) ?? "KONTA MOY"
  });
}

/**
 * Construct the live Symphonya transport and adapter only when the runtime kill
 * switch is enabled. Disabled environments do not require or touch the API key.
 */
export function createSymphonyaRuntime(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): SymphonyaRuntime | null {
  const config = envSymphonyaRuntime(env);
  if (!config.enabled) return null;

  const transport = new SymphonyaHttpTransport({
    apiKey: required(config.apiKey, "Symphonya API key"),
    baseUrl: config.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    currency: config.currency
  }, fetchImpl);

  const adapter = new SymphonyaAdapter(transport, {
    enabled: true,
    carrier: config.carrier,
    minimumProcurementMinor: config.minimumProcurementMinor,
    currency: config.currency,
    messagePrefix: config.messagePrefix
  });

  return Object.freeze({ transport, adapter, config });
}

function carrier(value: string | undefined): SymphonyaCarrierName {
  const normalized = (optional(value) ?? "dpd").toLowerCase();
  if (normalized === "sameday" || normalized === "dpd" || normalized === "self") return normalized;
  throw new Error("SYMPHONYA_CARRIER must be one of: sameday, dpd, self");
}

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = optional(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean environment value: ${value}`);
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  const normalized = optional(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function required(value: string | undefined, label: string): string {
  const normalized = optional(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
