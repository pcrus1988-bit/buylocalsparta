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

export type VendorStorefrontPreviewProduct = Readonly<{
  id: string;
  canonicalVariantId?: string;
  title: string;
  brand?: string;
  category: string;
  priceMinor?: number;
  price: string;
  availableToSell: number;
  status: string;
  visible: boolean;
  mediaId?: string;
  mediaAlt?: string;
  source: "offer" | "submission";
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

export async function storefrontPreviewProducts(vendorId: string, requestedLimit = 12): Promise<readonly VendorStorefrontPreviewProduct[]> {
  if (!productionDatabaseConfigured()) throw new Error("Storefront preview requires the production database");
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(24, requestedLimit)) : 12;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `vendor-storefront-preview-products:${vendorId}` },
    async (tx) => {
      const result = await tx.query<SqlRow>(`
        WITH vendor AS (
          SELECT id
          FROM vendor_businesses
          WHERE public_id=$1 OR id::text=$1
          LIMIT 1
        ),
        offer_items AS (
          SELECT
            vo.public_id AS id,
            cv.public_id AS canonical_public_id,
            COALESCE(ptel.title,pten.title,cv.model,cv.slug,vo.vendor_sku,'Προϊόν') AS title,
            brand.name AS brand,
            COALESCE(ctel.name,cten.name,category.code) AS category,
            vo.customer_price_minor AS price_minor,
            GREATEST(
              0,
              COALESCE(inventory.on_hand,0)
                - COALESCE(inventory.active_reservations,0)
                - COALESCE(inventory.safety_stock,0)
                - COALESCE(inventory.blocked,0)
            )::integer AS available_to_sell,
            vo.status::text AS status,
            (
              vo.status::text='approved'
              AND vo.merchant_visible=true
              AND vo.merchant_pause_active=false
              AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
            ) AS visible,
            media.public_id AS media_id,
            media.alt_text AS media_alt,
            'offer'::text AS source_kind,
            vo.updated_at
          FROM vendor_offers vo
          JOIN vendor ON vendor.id=vo.vendor_id
          JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
          JOIN categories category ON category.id=cv.category_id
          LEFT JOIN product_families family ON family.id=cv.family_id
          LEFT JOIN brands brand ON brand.id=COALESCE(cv.brand_id,family.brand_id)
          LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
          LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
          LEFT JOIN category_translations ctel ON ctel.category_id=category.id AND ctel.locale='el'
          LEFT JOIN category_translations cten ON cten.category_id=category.id AND cten.locale='en'
          LEFT JOIN inventory_balances inventory ON inventory.offer_id=vo.id
          LEFT JOIN LATERAL (
            SELECT item.public_id,item.alt_text
            FROM product_media item
            WHERE item.canonical_variant_id=cv.id
              AND item.kind='image'
              AND item.scan_status='clean'
              AND item.moderation_status='approved'
            ORDER BY CASE WHEN item.vendor_id=vo.vendor_id THEN 0 ELSE 1 END,item.sort_order,item.created_at
            LIMIT 1
          ) media ON true
          WHERE vo.status::text <> 'archived'
          ORDER BY vo.updated_at DESC,vo.public_id
          LIMIT $2
        ),
        submission_items AS (
          SELECT
            submission.public_id AS id,
            cv.public_id AS canonical_public_id,
            COALESCE(
              NULLIF(btrim(submission.source_identity->>'title'),''),
              submission.vendor_sku,
              'Προϊόν υπό προετοιμασία'
            ) AS title,
            NULLIF(btrim(submission.source_identity->>'brand'),'') AS brand,
            COALESCE(ctel.name,cten.name,category.code) AS category,
            NULL::bigint AS price_minor,
            GREATEST(0,submission.stock_on_hand-submission.safety_stock)::integer AS available_to_sell,
            submission.status AS status,
            false AS visible,
            media.public_id AS media_id,
            media.alt_text AS media_alt,
            'submission'::text AS source_kind,
            submission.updated_at
          FROM vendor_product_submissions submission
          JOIN vendor ON vendor.id=submission.vendor_id
          JOIN categories category ON category.id=submission.category_id
          LEFT JOIN canonical_variants cv ON cv.id=submission.canonical_variant_id
          LEFT JOIN category_translations ctel ON ctel.category_id=category.id AND ctel.locale='el'
          LEFT JOIN category_translations cten ON cten.category_id=category.id AND cten.locale='en'
          LEFT JOIN LATERAL (
            SELECT item.public_id,item.alt_text
            FROM product_media item
            WHERE item.canonical_variant_id=submission.canonical_variant_id
              AND item.kind='image'
              AND item.scan_status='clean'
              AND item.moderation_status='approved'
            ORDER BY CASE WHEN item.vendor_id=submission.vendor_id THEN 0 ELSE 1 END,item.sort_order,item.created_at
            LIMIT 1
          ) media ON true
          WHERE submission.status IN ('draft','submitted','needs_review','linked','matched')
          ORDER BY submission.updated_at DESC,submission.public_id
          LIMIT $2
        )
        SELECT id,canonical_public_id,title,brand,category,price_minor,available_to_sell,status,visible,media_id,media_alt,source_kind,updated_at
        FROM (
          SELECT * FROM offer_items
          UNION ALL
          SELECT * FROM submission_items
        ) preview_items
        ORDER BY updated_at DESC,id
        LIMIT $2
      `, [vendorId, limit]);

      return result.rows.map((row) => {
        const priceMinor = optionalInteger(row.price_minor);
        return {
          id: requiredText(row.id),
          canonicalVariantId: optionalText(row.canonical_public_id),
          title: requiredText(row.title),
          brand: optionalText(row.brand),
          category: requiredText(row.category),
          priceMinor,
          price: priceMinor === undefined ? "Τιμή σε αναμονή" : formatEuroMinor(priceMinor),
          availableToSell: nonNegativeInteger(row.available_to_sell),
          status: requiredText(row.status),
          visible: row.visible === true,
          mediaId: optionalText(row.media_id),
          mediaAlt: optionalText(row.media_alt),
          source: requiredText(row.source_kind) === "submission" ? "submission" : "offer"
        } satisfies VendorStorefrontPreviewProduct;
      });
    },
    { readOnly: true }
  );
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

function optionalInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function formatEuroMinor(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
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
