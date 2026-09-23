import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../../lib/admin-session";
import { assertAdminCsrf, assertAdminPermission, recordAdminAudit } from "../../../../../lib/admin-runtime";
import { adminAssignAllVitexProducts, adminUnassignAllVitexProducts } from "../../../../../lib/admin-vitex-catalogue";
import { adminAssignAllFournarakisProducts, adminUnassignAllFournarakisProducts } from "../../../../../lib/admin-fournarakis-catalogue";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";

export const metadata: Metadata = {
  title: "Admin · Vendor catalogue & demo",
  robots: { index: false, follow: false }
};

type VendorRow = SqlRow & {
  vendor_uuid: string;
  public_id: string;
  trading_name: string;
  legal_name: string;
  status: string;
  demo_mode: boolean;
  demo_mode_updated_at: Date | string | null;
};

type LocationRow = SqlRow & {
  public_id: string;
  name: string;
  locality: string;
  active: boolean;
};

type AssignmentRow = SqlRow & {
  offer_id: string;
  canonical_id: string;
  title: string;
  location_name: string;
  status: string;
  customer_price_minor: number | string;
  vendor_sku: string | null;
};

type CandidateRow = SqlRow & {
  canonical_id: string;
  title: string;
  model: string | null;
  gtin: string | null;
  mpn: string | null;
  platform_price_minor: number | string | null;
};

const asText = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const asInt = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const euro = (minor: unknown) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(asInt(minor) / 100);

async function requireAdmin() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  assertAdminPermission(principal, "catalog.write");
  assertAdminPermission(principal, "vendor.manage");
  return principal;
}

async function setDemoMode(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  if (!productionDatabaseConfigured()) throw new Error("Database is required for DEMO mode");
  const vendorId = asText(formData.get("vendorId")).trim();
  const enabled = asText(formData.get("enabled")) === "true";
  const reason = asText(formData.get("reason")).trim();
  if (!vendorId || reason.length < 3 || reason.length > 500) throw new Error("A vendor and a 3–500 character reason are required");
  const db = getProductionPostgresRuntime().sqlPool;
  const current = await db.query<VendorRow>(`
    SELECT id::text AS vendor_uuid,public_id,trading_name,legal_name,status::text AS status,demo_mode,demo_mode_updated_at
    FROM vendor_businesses
    WHERE public_id=$1 OR id::text=$1
    LIMIT 1
  `, [vendorId]);
  const vendor = current.rows[0];
  if (!vendor) throw new Error("Vendor not found");
  if (enabled && ["restricted", "suspended", "closed"].includes(asText(vendor.status))) {
    throw new Error(`DEMO mode cannot be enabled while vendor status is ${asText(vendor.status)}`);
  }
  await db.query(`UPDATE vendor_businesses SET demo_mode=$2,demo_mode_updated_at=now(),updated_at=now() WHERE id=$1::uuid`, [asText(vendor.vendor_uuid), enabled]);
  await recordAdminAudit(principal, enabled ? "vendor.demo.enabled" : "vendor.demo.disabled", "vendor", asText(vendor.public_id), reason, {
    demoMode: enabled,
    operationalStatus: asText(vendor.status),
    commerceEligible: asText(vendor.status) === "active" && !enabled
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(asText(vendor.public_id))}/catalogue`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(asText(vendor.public_id))}`);
}

async function assignProduct(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  if (!productionDatabaseConfigured()) throw new Error("Database is required for catalogue assignment");
  const vendorId = asText(formData.get("vendorId")).trim();
  const locationId = asText(formData.get("locationId")).trim();
  const canonicalId = asText(formData.get("canonicalId")).trim();
  const vendorSku = asText(formData.get("vendorSku")).trim().slice(0, 160) || null;
  const rawPrice = asText(formData.get("priceMinor")).trim();
  const explicitPrice = rawPrice === "" ? undefined : Number(rawPrice);
  if (!vendorId || !locationId || !canonicalId) throw new Error("Vendor, location and product are required");
  if (explicitPrice !== undefined && (!Number.isSafeInteger(explicitPrice) || explicitPrice < 0)) throw new Error("Price must be a non-negative integer amount in cents");

  const db = getProductionPostgresRuntime().sqlPool;
  const context = await db.query<SqlRow>(`
    SELECT v.id::text AS vendor_uuid,v.public_id AS vendor_public_id,v.market_id::text AS market_uuid,
           l.id::text AS location_uuid,l.public_id AS location_public_id,
           cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,cv.platform_price_minor,cv.tax_rate_bps
    FROM vendor_businesses v
    JOIN vendor_locations l ON l.vendor_id=v.id
    JOIN canonical_variants cv ON cv.market_id=v.market_id
    WHERE (v.public_id=$1 OR v.id::text=$1)
      AND (l.public_id=$2 OR l.id::text=$2)
      AND (cv.public_id=$3 OR cv.id::text=$3)
    LIMIT 1
  `, [vendorId, locationId, canonicalId]);
  const row = context.rows[0];
  if (!row) throw new Error("Vendor/location/product combination is invalid");
  const fallbackPrice = row.platform_price_minor == null ? 0 : asInt(row.platform_price_minor);
  const priceMinor = explicitPrice ?? fallbackPrice;
  const existing = await db.query<SqlRow>(`
    SELECT id::text AS offer_uuid,public_id,status::text AS status
    FROM vendor_offers
    WHERE vendor_id=$1::uuid AND location_id=$2::uuid AND canonical_variant_id=$3::uuid
    ORDER BY updated_at DESC,created_at DESC
    LIMIT 1
  `, [asText(row.vendor_uuid), asText(row.location_uuid), asText(row.canonical_uuid)]);

  let offerPublicId: string;
  if (existing.rows[0]) {
    offerPublicId = asText(existing.rows[0].public_id);
    await db.query(`
      UPDATE vendor_offers
      SET vendor_sku=COALESCE($2,vendor_sku),
          supplier_unit_price_minor=$3,
          customer_price_minor=$3,
          supplier_tax_rate_bps=$4,
          status=CASE WHEN status IN ('rejected','archived','suppressed') THEN 'draft'::offer_status ELSE status END,
          source_payload=COALESCE(source_payload,'{}'::jsonb) || jsonb_build_object('adminAssigned',true,'adminAssignedAt',now()),
          updated_at=now()
      WHERE id=$1::uuid
    `, [asText(existing.rows[0].offer_uuid), vendorSku, priceMinor, asInt(row.tax_rate_bps)]);
  } else {
    offerPublicId = `offer_${randomUUID().replaceAll("-", "")}`;
    await db.query(`
      INSERT INTO vendor_offers(
        id,public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,
        supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,source_payload,created_at,updated_at
      ) VALUES(
        gen_random_uuid(),$1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'draft',
        $7,$7,'EUR',$8,jsonb_build_object('adminAssigned',true,'adminAssignedAt',now()),now(),now()
      )
    `, [offerPublicId, asText(row.market_uuid), asText(row.vendor_uuid), asText(row.location_uuid), asText(row.canonical_uuid), vendorSku, priceMinor, asInt(row.tax_rate_bps)]);
  }

  await recordAdminAudit(principal, "catalog.vendor_product.assigned", "vendor_offer", offerPublicId, "Admin catalogue preparation", {
    vendorId: asText(row.vendor_public_id),
    locationId: asText(row.location_public_id),
    canonicalVariantId: asText(row.canonical_public_id),
    priceMinor,
    activationChanged: false
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(asText(row.vendor_public_id))}/catalogue`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(asText(row.vendor_public_id))}`);
}

async function unassignProduct(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  if (!productionDatabaseConfigured()) throw new Error("Database is required for catalogue assignment");
  const vendorId = asText(formData.get("vendorId")).trim();
  const offerId = asText(formData.get("offerId")).trim();
  if (!vendorId || !offerId) throw new Error("Vendor and offer are required");
  const db = getProductionPostgresRuntime().sqlPool;
  const result = await db.query<SqlRow>(`
    UPDATE vendor_offers vo
    SET status='archived',updated_at=now()
    FROM vendor_businesses v
    WHERE vo.vendor_id=v.id
      AND (v.public_id=$1 OR v.id::text=$1)
      AND (vo.public_id=$2 OR vo.id::text=$2)
    RETURNING vo.public_id,v.public_id AS vendor_public_id
  `, [vendorId, offerId]);
  if (!result.rows[0]) throw new Error("Assigned offer not found");
  await recordAdminAudit(principal, "catalog.vendor_product.unassigned", "vendor_offer", asText(result.rows[0].public_id), "Admin catalogue maintenance", { vendorId: asText(result.rows[0].vendor_public_id) });
  revalidatePath(`/admin/partners/${encodeURIComponent(asText(result.rows[0].vendor_public_id))}/catalogue`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(asText(result.rows[0].vendor_public_id))}`);
}

async function assignAllVitexProducts(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  const result = await adminAssignAllVitexProducts(principal, {
    vendorId: asText(formData.get("vendorId")),
    locationId: asText(formData.get("locationId")),
    reason: asText(formData.get("reason"))
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(result.vendorId)}/catalogue`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(result.vendorId)}`);
  revalidatePath("/admin/catalogue/vitex");
  revalidatePath("/shop");
}

async function unassignAllVitexProducts(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  const result = await adminUnassignAllVitexProducts(principal, {
    vendorId: asText(formData.get("vendorId")),
    reason: asText(formData.get("reason"))
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(result.vendorId)}/catalogue`);
  revalidatePath(`/demo/vendor/${encodeURIComponent(result.vendorId)}`);
  revalidatePath("/admin/catalogue/vitex");
  revalidatePath("/shop");
}

async function assignAllFournarakisProducts(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  const result = await adminAssignAllFournarakisProducts(principal, {
    vendorId: asText(formData.get("vendorId")),
    locationId: asText(formData.get("locationId")),
    reason: asText(formData.get("reason"))
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(result.vendorId)}/catalogue`);
}

async function unassignAllFournarakisProducts(formData: FormData) {
  "use server";
  const principal = await requireAdmin();
  assertAdminCsrf(principal, asText(formData.get("csrfToken")));
  const result = await adminUnassignAllFournarakisProducts(principal, {
    vendorId: asText(formData.get("vendorId")),
    reason: asText(formData.get("reason"))
  });
  revalidatePath(`/admin/partners/${encodeURIComponent(result.vendorId)}/catalogue`);
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const principal = await requireAdmin();
  const { id } = await params;
  const { q } = await searchParams;
  if (!productionDatabaseConfigured()) {
    return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Partner catalogue" /><section className="shell vendor-section"><h1>Vendor catalogue & DEMO</h1><p>Production database is not configured.</p><Link href="/admin/vendors">Back to partners</Link></section></main>;
  }
  const db = getProductionPostgresRuntime().sqlPool;
  const vendorResult = await db.query<VendorRow>(`
    SELECT id::text AS vendor_uuid,public_id,trading_name,legal_name,status::text AS status,demo_mode,demo_mode_updated_at
    FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1
  `, [id]);
  const vendor = vendorResult.rows[0];
  if (!vendor) notFound();
  const vendorUuid = asText(vendor.vendor_uuid);
  const vendorPublicId = asText(vendor.public_id);
  const locations = await db.query<LocationRow>(`
    SELECT public_id,name,locality,active FROM vendor_locations WHERE vendor_id=$1::uuid ORDER BY active DESC,name,public_id
  `, [vendorUuid]);
  const assignments = await db.query<AssignmentRow>(`
    SELECT vo.public_id AS offer_id,cv.public_id AS canonical_id,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           l.name AS location_name,vo.status::text AS status,vo.customer_price_minor,vo.vendor_sku
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE vo.vendor_id=$1::uuid AND vo.status <> 'archived'
    ORDER BY vo.updated_at DESC,vo.public_id
    LIMIT 500
  `, [vendorUuid]);
  const vitexStats = await db.query<SqlRow>(`
    SELECT
      (SELECT count(*)::int
       FROM vitex_commerce_products
       WHERE active=true AND canonical_variant_id IS NOT NULL) AS total_products,
      (
        SELECT count(DISTINCT assigned.canonical_variant_id)::int
        FROM (
          SELECT vo.canonical_variant_id
          FROM vendor_offers vo
          JOIN vitex_commerce_products vcp ON vcp.canonical_variant_id=vo.canonical_variant_id
          WHERE vo.vendor_id=$1::uuid
            AND vcp.active=true
            AND vo.status <> 'archived'

          UNION

          SELECT vcp.canonical_variant_id
          FROM vendor_catalog_assortments vca
          JOIN catalog_source_products csp ON csp.id=vca.source_product_id
          JOIN catalog_sources cs ON cs.id=csp.source_id
          JOIN vitex_commerce_products vcp
            ON vcp.import_fingerprint=csp.source_product_key
           AND vcp.active=true
          WHERE vca.vendor_id=$1::uuid
            AND cs.code='vitex-commerce-media'
            AND vca.assortment_status NOT IN ('rejected','discontinued')
        ) assigned
      ) AS assigned_products
  `, [vendorUuid]);
  const vitexTotal = asInt(vitexStats.rows[0]?.total_products);
  const vitexAssigned = asInt(vitexStats.rows[0]?.assigned_products);
  const fournarakisStats = await db.query<SqlRow>(`
    WITH source_context AS (
      SELECT cs.id AS source_id,j.snapshot_id
      FROM catalog_sources cs
      JOIN catalog_web_crawl_jobs j ON j.source_id=cs.id
      WHERE cs.code='fournarakis-gr'
        AND cs.active=true
        AND j.status='succeeded'
        AND j.snapshot_id IS NOT NULL
        AND COALESCE(j.promoted_product_count,0)>0
      ORDER BY j.completed_at DESC NULLS LAST,j.updated_at DESC,j.id DESC
      LIMIT 1
    ),
    target AS (
      SELECT csp.id AS source_product_id,lnk.canonical_variant_id
      FROM source_context ctx
      JOIN catalog_source_products csp
        ON csp.source_id=ctx.source_id
       AND csp.snapshot_id=ctx.snapshot_id
      JOIN catalog_source_product_links lnk
        ON lnk.source_product_id=csp.id
       AND lnk.link_status='approved'
       AND lnk.canonical_variant_id IS NOT NULL
    )
    SELECT
      (SELECT count(*) FROM target)::int AS total_products,
      (
        SELECT count(DISTINCT vca.source_product_id)
        FROM vendor_catalog_assortments vca
        JOIN target t ON t.source_product_id=vca.source_product_id
        WHERE vca.vendor_id=$1::uuid
          AND vca.assortment_status NOT IN ('rejected','discontinued')
      )::int AS assigned_products,
      (
        SELECT count(DISTINCT po.source_product_id)
        FROM catalog_price_observations po
        JOIN target t ON t.source_product_id=po.source_product_id
        WHERE po.observation_status='observed'
      )::int AS priced_products
  `, [vendorUuid]);
  const fournarakisTotal = asInt(fournarakisStats.rows[0]?.total_products);
  const fournarakisAssigned = asInt(fournarakisStats.rows[0]?.assigned_products);
  const fournarakisPriced = asInt(fournarakisStats.rows[0]?.priced_products);
  const activeLocations = locations.rows.filter((location) => Boolean(location.active));
  const search = q?.trim() ?? "";
  let candidateRows: CandidateRow[] = [];
  if (search) {
    const candidates = await db.query<CandidateRow>(`
      WITH vendor_market AS (
        SELECT market_id
        FROM vendor_businesses
        WHERE id=$1::uuid
      ),
      matched AS (
        SELECT cv.id
        FROM canonical_variants cv, vendor_market vm
        WHERE cv.market_id=vm.market_id
          AND cv.recalled=false
          AND (
            cv.public_id=$2
            OR cv.gtin=$2
            OR cv.mpn=$2
            OR to_tsvector(
              'simple',
              (((((COALESCE(cv.model,'') || ' ') || COALESCE(cv.slug,'')) || ' ') || COALESCE(cv.gtin,'')) || ' ') || COALESCE(cv.mpn,'')
            ) @@ websearch_to_tsquery('simple',$2)
          )

        UNION

        SELECT pt.canonical_variant_id
        FROM product_translations pt
        JOIN canonical_variants cv ON cv.id=pt.canonical_variant_id
        CROSS JOIN vendor_market vm
        WHERE cv.market_id=vm.market_id
          AND cv.recalled=false
          AND pt.locale IN ('el','en')
          AND to_tsvector('simple',COALESCE(pt.title,'')) @@ websearch_to_tsquery('simple',$2)
      )
      SELECT cv.public_id AS canonical_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
             cv.model,cv.gtin,cv.mpn,cv.platform_price_minor
      FROM matched
      JOIN canonical_variants cv ON cv.id=matched.id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      ORDER BY cv.updated_at DESC,cv.public_id
      LIMIT 60
    `, [vendorUuid, search]);
    candidateRows = candidates.rows;
  }
  const commerceEligible = asText(vendor.status) === "active" && !Boolean(vendor.demo_mode);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={asText(vendor.trading_name)} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Admin · Partner catalogue</div><h1>{asText(vendor.trading_name)}</h1><p className="lead">Prepare and assign products before activation, or switch the shop into a safe demonstration mode. Neither action activates the vendor.</p></div>
    </section>
    <section className="shell vendor-section">
      <div className="admin-local-tabs"><Link href={`/admin/partners/${encodeURIComponent(vendorPublicId)}`}>Partner record</Link><Link href="/admin/vendors">All partners</Link>{Boolean(vendor.demo_mode) && <Link href={`/demo/vendor/${encodeURIComponent(vendorPublicId)}`} target="_blank">Open DEMO shop ↗</Link>}</div>
      <div className="workspace-metric-strip">
        <div><span>Status</span><strong>{asText(vendor.status)}</strong></div>
        <div><span>DEMO mode</span><strong>{Boolean(vendor.demo_mode) ? "ON" : "OFF"}</strong></div>
        <div><span>Commerce eligible</span><strong>{commerceEligible ? "YES" : "NO"}</strong></div>
        <div><span>Assigned products</span><strong>{assignments.rowCount}</strong></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <h2>DEMO shop</h2>
      <p>{Boolean(vendor.demo_mode) ? "The shareable demo storefront is enabled. Checkout is hard-blocked at database level." : "Enable DEMO to show this vendor and its prepared catalogue without making the vendor commercially active."}</p>
      <form action={setDemoMode} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <input type="hidden" name="enabled" value={Boolean(vendor.demo_mode) ? "false" : "true"} />
        <label><span>Audit reason</span><input name="reason" defaultValue={Boolean(vendor.demo_mode) ? "End vendor demonstration" : "Prepare vendor demonstration"} minLength={3} maxLength={500} required /></label>
        <button className="button" type="submit">{Boolean(vendor.demo_mode) ? "Disable DEMO mode" : "Enable DEMO mode"}</button>
      </form>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div><div className="eyebrow">VITEX catalogue</div><h2>Assign the full VITEX range</h2></div>
        <Link className="button button-secondary" href="/admin/catalogue/vitex">Edit public VITEX content</Link>
      </div>
      <p>Assign or de-assign the entire canonical VITEX catalogue for this vendor. Assigned products appear in this vendor’s public storefront catalogue, while checkout remains protected until an approved offer and authoritative stock are available. Vendor activation is never changed.</p>
      <div className="workspace-metric-strip">
        <div><span>VITEX products</span><strong>{vitexTotal}</strong></div>
        <div><span>Assigned to vendor</span><strong>{vitexAssigned}</strong></div>
        <div><span>Remaining</span><strong>{Math.max(0, vitexTotal - vitexAssigned)}</strong></div>
      </div>
      {activeLocations.length === 0 ? <p>An active vendor location is required before bulk assignment.</p> : <form action={assignAllVitexProducts} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <label><span>Assign to location</span><select name="locationId" required>{activeLocations.map((location) => <option key={asText(location.public_id)} value={asText(location.public_id)}>{asText(location.name)} · {asText(location.locality)}</option>)}</select></label>
        <label><span>Audit reason</span><input name="reason" defaultValue="Assign full VITEX catalogue to vendor" minLength={3} maxLength={500} required /></label>
        <button className="button" type="submit">Assign all VITEX products</button>
      </form>}
      {vitexAssigned > 0 ? <form action={unassignAllVitexProducts} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <label><span>Audit reason</span><input name="reason" defaultValue="De-assign full VITEX catalogue from vendor" minLength={3} maxLength={500} required /></label>
        <button className="button button-secondary" type="submit">De-assign all VITEX products</button>
      </form> : null}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div><div className="eyebrow">Fournarakis catalogue</div><h2>Assign the Fournarakis Supplier PIM range</h2></div>
        <Link className="button button-secondary" href="/admin/catalogue-crawler">Open Website Import</Link>
      </div>
      <p>Assign the canonical Fournarakis range to this vendor as a commercial-review assortment. This does not create sellable offers, publish prices, activate products, or change vendor activation. Price and stock confirmation remain required before commerce activation.</p>
      <div className="workspace-metric-strip">
        <div><span>Canonical products</span><strong>{fournarakisTotal}</strong></div>
        <div><span>Assigned to vendor</span><strong>{fournarakisAssigned}</strong></div>
        <div><span>PDF price evidence</span><strong>{fournarakisPriced}</strong></div>
        <div><span>Remaining</span><strong>{Math.max(0, fournarakisTotal - fournarakisAssigned)}</strong></div>
      </div>
      {activeLocations.length === 0 ? <p>An active vendor location is required before bulk assignment.</p> : <form action={assignAllFournarakisProducts} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <label><span>Assign to location</span><select name="locationId" required>{activeLocations.map((location) => <option key={asText(location.public_id)} value={asText(location.public_id)}>{asText(location.name)} · {asText(location.locality)}</option>)}</select></label>
        <label><span>Audit reason</span><input name="reason" defaultValue="Assign full Fournarakis catalogue to vendor for commercial review" minLength={3} maxLength={500} required /></label>
        <button className="button" type="submit">Assign all Fournarakis products</button>
      </form>}
      {fournarakisAssigned > 0 ? <form action={unassignAllFournarakisProducts} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <label><span>Audit reason</span><input name="reason" defaultValue="De-assign full Fournarakis catalogue from vendor" minLength={3} maxLength={500} required /></label>
        <button className="button button-secondary" type="submit">De-assign Fournarakis catalogue</button>
      </form> : null}
    </section>

    <section className="shell vendor-section">
      <h2>Assign product</h2>
      <p>Canonical products can be assigned to this vendor in any onboarding state. New assignments start as <strong>draft offers</strong>; vendor activation is never changed.</p>
      <form method="get" className="admin-directory-filters"><label><span>Find canonical product</span><input name="q" defaultValue={search} placeholder="Title, GTIN, MPN or canonical ID" /></label><button className="button button-secondary" type="submit">Search</button></form>
      {locations.rowCount === 0 ? <p>No vendor location exists yet. Create a location before assigning an offer.</p> : <form action={assignProduct} className="admin-directory-filters">
        <input type="hidden" name="csrfToken" value={principal.csrfToken} />
        <input type="hidden" name="vendorId" value={vendorPublicId} />
        <label><span>Product</span><select name="canonicalId" required defaultValue=""><option value="" disabled>Select product…</option>{candidateRows.map((item) => <option key={asText(item.canonical_id)} value={asText(item.canonical_id)}>{asText(item.title)} · {asText(item.gtin || item.mpn || item.canonical_id)}</option>)}</select></label>
        <label><span>Location</span><select name="locationId" required>{locations.rows.map((location) => <option key={asText(location.public_id)} value={asText(location.public_id)}>{asText(location.name)} · {asText(location.locality)}{Boolean(location.active) ? "" : " · inactive"}</option>)}</select></label>
        <label><span>Customer price (cents, optional)</span><input name="priceMinor" inputMode="numeric" pattern="[0-9]*" placeholder="Uses canonical reference price when blank" /></label>
        <label><span>Vendor SKU (optional)</span><input name="vendorSku" maxLength={160} /></label>
        <button className="button" type="submit">Assign to vendor</button>
      </form>}
    </section>

    <section className="shell vendor-section">
      <h2>Current assignments</h2>
      {assignments.rowCount === 0 ? <p>No products are assigned yet.</p> : <div className="admin-directory-table" role="table" aria-label="Assigned products">
        <div className="admin-directory-head" role="row"><span>Product</span><span>Location</span><span>Status</span><span>Price</span><span>SKU</span><span>Action</span></div>
        {assignments.rows.map((item) => <div className="admin-directory-row" role="row" key={asText(item.offer_id)}>
          <span><strong>{asText(item.title)}</strong><small>{asText(item.canonical_id)}</small></span>
          <span>{asText(item.location_name)}</span><span>{asText(item.status)}</span><span>{euro(item.customer_price_minor)}</span><span>{asText(item.vendor_sku) || "—"}</span>
          <form action={unassignProduct}><input type="hidden" name="csrfToken" value={principal.csrfToken} /><input type="hidden" name="vendorId" value={vendorPublicId} /><input type="hidden" name="offerId" value={asText(item.offer_id)} /><button className="button button-secondary" type="submit">Unassign</button></form>
        </div>)}
      </div>}
    </section>
  </main>;
}
