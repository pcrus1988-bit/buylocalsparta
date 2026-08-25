import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminLocalDeliverySettings = Readonly<{
  active: boolean;
  postcodePrefixes: readonly string[];
  baseChargeMinor: number;
  freeAboveSubtotalMinor?: number;
  minimumSubtotalMinor?: number;
  activeVendorLocations: number;
  coveredVendorLocations: number;
  updatedAt?: number;
}>;

type SettingsRow = {
  active: boolean;
  postcode_prefixes: string[];
  base_charge_minor: string | number;
  free_above_subtotal_minor: string | number | null;
  minimum_subtotal_minor: string | number | null;
  updated_at: Date | null;
  active_vendor_locations: string | number;
  covered_vendor_locations: string | number;
};

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Local delivery settings require the production database");
  return getProductionPostgresRuntime();
}

async function spartaMarketUuid(): Promise<string> {
  const result = await runtime().nativePool.query<{ id: string }>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
  if (!result.rows[0]) throw new Error("Sparta market is not configured");
  return result.rows[0].id;
}

async function actorUuid(principal: SessionPrincipal): Promise<string> {
  const result = await runtime().nativePool.query<{ id: string }>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
  if (!result.rows[0]) throw new Error("Admin user could not be resolved");
  return result.rows[0].id;
}

function integer(value: unknown, label: string, nullable = false): number | undefined {
  if (nullable && (value === undefined || value === null || value === "")) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100_000_000) throw new Error(`${label} is invalid`);
  return parsed;
}

function prefixes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Postcode prefixes are required");
  const normalized = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (normalized.length > 30) throw new Error("Use at most 30 postcode prefixes");
  for (const prefix of normalized) if (!/^\d{1,5}$/.test(prefix)) throw new Error(`Invalid postcode prefix: ${prefix}`);
  return normalized;
}

export async function adminLocalDeliverySettings(_principal: SessionPrincipal): Promise<AdminLocalDeliverySettings> {
  const marketId = await spartaMarketUuid();
  const result = await runtime().nativePool.query<SettingsRow>(`
    SELECT d.active,d.postcode_prefixes,d.base_charge_minor,d.free_above_subtotal_minor,d.minimum_subtotal_minor,d.updated_at,
      (SELECT COUNT(*) FROM vendor_locations l JOIN vendor_businesses v ON v.id=l.vendor_id
        WHERE l.market_id=d.market_id AND l.active=true AND v.status='active') AS active_vendor_locations,
      (SELECT COUNT(DISTINCT z.location_id) FROM fulfilment_service_zones z
        JOIN vendor_locations l ON l.id=z.location_id JOIN vendor_businesses v ON v.id=z.vendor_id
        WHERE z.market_id=d.market_id AND z.mode='local_delivery' AND z.active=true
          AND z.starts_at<=now() AND (z.ends_at IS NULL OR z.ends_at>now())
          AND z.public_id LIKE 'market_default_local_delivery_%'
          AND l.active=true AND v.status='active') AS covered_vendor_locations
    FROM market_local_delivery_defaults d
    WHERE d.market_id=$1
    LIMIT 1
  `, [marketId]);
  const row = result.rows[0];
  if (!row) return { active: false, postcodePrefixes: [], baseChargeMinor: 0, activeVendorLocations: 0, coveredVendorLocations: 0 };
  const freeAbove = row.free_above_subtotal_minor == null ? undefined : Number(row.free_above_subtotal_minor);
  const minimum = row.minimum_subtotal_minor == null ? undefined : Number(row.minimum_subtotal_minor);
  return {
    active: row.active,
    postcodePrefixes: Array.isArray(row.postcode_prefixes) ? row.postcode_prefixes.map(String) : [],
    baseChargeMinor: Number(row.base_charge_minor),
    freeAboveSubtotalMinor: Number.isSafeInteger(freeAbove) ? freeAbove : undefined,
    minimumSubtotalMinor: Number.isSafeInteger(minimum) ? minimum : undefined,
    activeVendorLocations: Number(row.active_vendor_locations ?? 0),
    coveredVendorLocations: Number(row.covered_vendor_locations ?? 0),
    updatedAt: row.updated_at?.getTime(),
  };
}

export async function updateAdminLocalDeliverySettings(
  principal: SessionPrincipal,
  input: Readonly<{
    active: boolean;
    postcodePrefixes: unknown;
    baseChargeMinor: unknown;
    freeAboveSubtotalMinor?: unknown;
    minimumSubtotalMinor?: unknown;
  }>
): Promise<AdminLocalDeliverySettings> {
  const marketId = await spartaMarketUuid();
  const actor = await actorUuid(principal);
  const postcodePrefixes = prefixes(input.postcodePrefixes);
  if (input.active && postcodePrefixes.length === 0) throw new Error("At least one postcode prefix is required while local delivery is active");
  const baseChargeMinor = integer(input.baseChargeMinor, "Delivery charge")!;
  const freeAboveSubtotalMinor = integer(input.freeAboveSubtotalMinor, "Free-delivery threshold", true);
  const minimumSubtotalMinor = integer(input.minimumSubtotalMinor, "Minimum delivery subtotal", true);
  if (freeAboveSubtotalMinor !== undefined && minimumSubtotalMinor !== undefined && freeAboveSubtotalMinor < minimumSubtotalMinor) {
    throw new Error("Free-delivery threshold cannot be below the minimum delivery subtotal");
  }

  await runtime().nativePool.query(`
    INSERT INTO market_local_delivery_defaults(
      market_id,active,postcode_prefixes,base_charge_minor,free_above_subtotal_minor,minimum_subtotal_minor,updated_by_user_id,created_at,updated_at
    ) VALUES($1,$2,$3::text[],$4,$5,$6,$7,now(),now())
    ON CONFLICT(market_id) DO UPDATE SET
      active=EXCLUDED.active,
      postcode_prefixes=EXCLUDED.postcode_prefixes,
      base_charge_minor=EXCLUDED.base_charge_minor,
      free_above_subtotal_minor=EXCLUDED.free_above_subtotal_minor,
      minimum_subtotal_minor=EXCLUDED.minimum_subtotal_minor,
      updated_by_user_id=EXCLUDED.updated_by_user_id,
      updated_at=now()
  `, [marketId, Boolean(input.active), postcodePrefixes, baseChargeMinor, freeAboveSubtotalMinor ?? null, minimumSubtotalMinor ?? null, actor]);

  await runtime().nativePool.query("SELECT bls_private.sync_market_local_delivery_defaults($1::uuid)", [marketId]);
  return adminLocalDeliverySettings(principal);
}
