import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorStorefrontSettings = Readonly<{
  accentColor: string;
  heroStyle: "split" | "centered" | "editorial";
  heroTitle: string;
  showFeatured: boolean;
  showFlashSale: boolean;
  showBazaar: boolean;
  showAbout: boolean;
  showLocation: boolean;
  showContact: boolean;
}>;

export type VendorStorefrontWorkspace = Readonly<{
  vendorId: string;
  vendorName: string;
  status: string;
  demoMode: boolean;
  shortDescription: string;
  story: string;
  settings: VendorStorefrontSettings;
  location?: Readonly<{
    locality: string;
    postcode: string;
    addressLine1: string;
  }>;
}>;

const DEFAULT_SETTINGS: VendorStorefrontSettings = {
  accentColor: "#0f766e",
  heroStyle: "split",
  heroTitle: "",
  showFeatured: true,
  showFlashSale: true,
  showBazaar: true,
  showAbout: true,
  showLocation: true,
  showContact: true
};

export async function vendorStorefrontWorkspace(principal: SessionPrincipal): Promise<VendorStorefrontWorkspace> {
  const vendorId = requiredVendorId(principal);
  if (!productionDatabaseConfigured()) throw new Error("Storefront settings require the production database");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        vendor.public_id,
        vendor.trading_name,
        vendor.status::text AS status,
        vendor.demo_mode,
        vendor.storefront_settings,
        profile.short_description,
        profile.story,
        location.address_line1,
        location.locality,
        location.postcode
      FROM vendor_businesses vendor
      LEFT JOIN vendor_profile_translations profile
        ON profile.vendor_id=vendor.id AND profile.locale='el'
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode
        FROM vendor_locations
        WHERE vendor_id=vendor.id AND active=true
        ORDER BY is_primary DESC,created_at,id
        LIMIT 1
      ) location ON true
      WHERE vendor.public_id=$1 OR vendor.id::text=$1
      LIMIT 1
    `, [vendorId]);
    const row = result.rows[0];
    if (!row) throw new Error("Vendor storefront was not found");
    return workspaceFromRow(row);
  }, { readOnly: true });
}

export async function updateVendorStorefront(principal: SessionPrincipal, input: {
  shortDescription?: unknown;
  story?: unknown;
  settings?: unknown;
}): Promise<VendorStorefrontWorkspace> {
  const vendorId = requiredVendorId(principal);
  if (!productionDatabaseConfigured()) throw new Error("Storefront settings require the production database");
  const shortDescription = boundedText(input.shortDescription, 320);
  const story = boundedText(input.story, 5000);
  const settings = normalizeSettings(input.settings);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction({ actorUserId: principal.userId, vendorId }, async (tx) => {
    const vendorResult = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,status::text AS status,demo_mode
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      LIMIT 1
      FOR UPDATE
    `, [vendorId]);
    const vendor = vendorResult.rows[0];
    if (!vendor) throw new Error("Vendor storefront was not found");
    const status = String(vendor.status ?? "");
    const demoMode = vendor.demo_mode === true;
    if (!demoMode && status !== "active") throw new Error("Storefront editing is available only during the trial or for an active vendor");

    await tx.query(
      "UPDATE vendor_businesses SET storefront_settings=$2::jsonb,updated_at=now() WHERE id=$1::uuid",
      [String(vendor.vendor_uuid), JSON.stringify(settings)]
    );
    await tx.query(`
      INSERT INTO vendor_profile_translations(vendor_id,locale,short_description,story)
      VALUES($1::uuid,'el',$2,$3)
      ON CONFLICT(vendor_id,locale) DO UPDATE
      SET short_description=EXCLUDED.short_description,
          story=EXCLUDED.story
    `, [String(vendor.vendor_uuid), shortDescription || null, story || null]);

    const readback = await tx.query<SqlRow>(`
      SELECT
        vendor.public_id,
        vendor.trading_name,
        vendor.status::text AS status,
        vendor.demo_mode,
        vendor.storefront_settings,
        profile.short_description,
        profile.story,
        location.address_line1,
        location.locality,
        location.postcode
      FROM vendor_businesses vendor
      LEFT JOIN vendor_profile_translations profile
        ON profile.vendor_id=vendor.id AND profile.locale='el'
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode
        FROM vendor_locations
        WHERE vendor_id=vendor.id AND active=true
        ORDER BY is_primary DESC,created_at,id
        LIMIT 1
      ) location ON true
      WHERE vendor.id=$1::uuid
      LIMIT 1
    `, [String(vendor.vendor_uuid)]);
    if (!readback.rows[0]) throw new Error("Unable to read back storefront settings");
    return workspaceFromRow(readback.rows[0]);
  }, { isolation: "serializable" });
}

export async function storefrontPreviewWorkspace(vendorId: string): Promise<VendorStorefrontWorkspace> {
  if (!productionDatabaseConfigured()) throw new Error("Storefront preview requires the production database");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction({ platformAccess: true, marketId: "sparta", requestId: `vendor-storefront-preview:${vendorId}` }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        vendor.public_id,
        vendor.trading_name,
        vendor.status::text AS status,
        vendor.demo_mode,
        vendor.storefront_settings,
        profile.short_description,
        profile.story,
        location.address_line1,
        location.locality,
        location.postcode
      FROM vendor_businesses vendor
      LEFT JOIN vendor_profile_translations profile
        ON profile.vendor_id=vendor.id AND profile.locale='el'
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode
        FROM vendor_locations
        WHERE vendor_id=vendor.id AND active=true
        ORDER BY is_primary DESC,created_at,id
        LIMIT 1
      ) location ON true
      WHERE vendor.public_id=$1 OR vendor.id::text=$1
      LIMIT 1
    `, [vendorId]);
    const row = result.rows[0];
    if (!row) throw new Error("Vendor storefront preview was not found");
    return workspaceFromRow(row);
  }, { readOnly: true });
}

function workspaceFromRow(row: SqlRow): VendorStorefrontWorkspace {
  const addressLine1 = optionalText(row.address_line1);
  const locality = optionalText(row.locality);
  const postcode = optionalText(row.postcode);
  return {
    vendorId: requiredText(row.public_id),
    vendorName: requiredText(row.trading_name),
    status: requiredText(row.status),
    demoMode: row.demo_mode === true,
    shortDescription: optionalText(row.short_description) ?? "",
    story: optionalText(row.story) ?? "",
    settings: normalizeSettings(row.storefront_settings),
    location: addressLine1 && locality && postcode ? { addressLine1, locality, postcode } : undefined
  };
}

function normalizeSettings(value: unknown): VendorStorefrontSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const accent = typeof source.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(source.accentColor)
    ? source.accentColor.toLowerCase()
    : DEFAULT_SETTINGS.accentColor;
  const heroStyle = source.heroStyle === "centered" || source.heroStyle === "editorial" || source.heroStyle === "split"
    ? source.heroStyle
    : DEFAULT_SETTINGS.heroStyle;
  return {
    accentColor: accent,
    heroStyle,
    heroTitle: boundedText(source.heroTitle, 100),
    showFeatured: booleanValue(source.showFeatured, DEFAULT_SETTINGS.showFeatured),
    showFlashSale: booleanValue(source.showFlashSale, DEFAULT_SETTINGS.showFlashSale),
    showBazaar: booleanValue(source.showBazaar, DEFAULT_SETTINGS.showBazaar),
    showAbout: booleanValue(source.showAbout, DEFAULT_SETTINGS.showAbout),
    showLocation: booleanValue(source.showLocation, DEFAULT_SETTINGS.showLocation),
    showContact: booleanValue(source.showContact, DEFAULT_SETTINGS.showContact)
  };
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  if (result.length > max) throw new Error(`Text may contain up to ${max} characters`);
  return result;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function requiredVendorId(principal: SessionPrincipal): string {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return vendorId;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid storefront field");
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
