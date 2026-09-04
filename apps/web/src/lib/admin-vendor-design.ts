import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminVendorDesignLocation = Readonly<{
  id?: string;
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  postcode?: string;
  phone?: string;
  publicEmail?: string;
}>;

export type AdminVendorDesignShop = Readonly<{
  id: string;
  applicationId?: string;
  applicationState?: string;
  tradingName: string;
  legalName: string;
  status: string;
  demoMode: boolean;
  publicDirectoryVisible: boolean;
  shortDescription?: string;
  story?: string;
  location?: AdminVendorDesignLocation;
}>;

export type AdminVendorDesignUnlinkedApplication = Readonly<{
  id: string;
  state: string;
  tradingName: string;
  legalName: string;
  contactEmail: string;
  phone?: string;
  addressLine1: string;
  postcode: string;
}>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function bool(value: unknown): boolean { return value === true; }
function normalized(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

export async function adminVendorDesignWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return { csrfToken: principal.csrfToken, databaseConfigured: false, shops: [] as AdminVendorDesignShop[], unlinkedApplications: [] as AdminVendorDesignUnlinkedApplication[] };
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [shopsResult, applicationsResult] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT v.public_id,v.trading_name,v.legal_name,v.status::text AS status,v.demo_mode,v.public_directory_visible,
               app.public_id AS application_public_id,app.status::text AS application_status,
               pt.short_description,pt.story,
               loc.public_id AS location_public_id,loc.name AS location_name,loc.address_line1,loc.address_line2,
               loc.locality,loc.postcode,loc.phone,loc.public_email
        FROM vendor_businesses v
        JOIN markets m ON m.id=v.market_id
        LEFT JOIN LATERAL (
          SELECT a.public_id,a.status FROM vendor_applications a WHERE a.vendor_id=v.id
          ORDER BY a.updated_at DESC,a.created_at DESC LIMIT 1
        ) app ON true
        LEFT JOIN vendor_profile_translations pt ON pt.vendor_id=v.id AND pt.locale='el'
        LEFT JOIN LATERAL (
          SELECT l.public_id,l.name,l.address_line1,l.address_line2,l.locality,l.postcode,l.phone,l.public_email
          FROM vendor_locations l WHERE l.vendor_id=v.id
          ORDER BY l.is_primary DESC NULLS LAST,l.active DESC,l.created_at,l.public_id LIMIT 1
        ) loc ON true
        WHERE m.code='sparta'
        ORDER BY CASE v.status::text
          WHEN 'active' THEN 0 WHEN 'test_ready' THEN 1 WHEN 'catalog_onboarding' THEN 2
          WHEN 'verification_pending' THEN 3 WHEN 'application_started' THEN 4 WHEN 'invited' THEN 5 WHEN 'restricted' THEN 6
          WHEN 'suspended' THEN 7 WHEN 'closed' THEN 8 ELSE 9 END,
          lower(v.trading_name),v.public_id
      `),
      tx.query<SqlRow>(`
        SELECT a.public_id,a.status::text AS state,a.trading_name,a.legal_name,a.contact_email,a.phone,a.address_line1,a.postcode
        FROM vendor_applications a JOIN markets m ON m.id=a.market_id
        WHERE m.code='sparta' AND a.vendor_id IS NULL AND a.status::text NOT IN ('closed')
        ORDER BY a.updated_at DESC,a.created_at DESC
      `)
    ]);

    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      shops: shopsResult.rows.map((row): AdminVendorDesignShop => {
        const locationId = optionalText(row.location_public_id);
        return {
          id: text(row.public_id),
          applicationId: optionalText(row.application_public_id),
          applicationState: optionalText(row.application_status),
          tradingName: text(row.trading_name),
          legalName: text(row.legal_name),
          status: text(row.status),
          demoMode: bool(row.demo_mode),
          publicDirectoryVisible: bool(row.public_directory_visible),
          shortDescription: optionalText(row.short_description),
          story: optionalText(row.story),
          location: locationId ? {
            id: locationId,
            name: optionalText(row.location_name),
            addressLine1: optionalText(row.address_line1),
            addressLine2: optionalText(row.address_line2),
            locality: optionalText(row.locality),
            postcode: optionalText(row.postcode),
            phone: optionalText(row.phone),
            publicEmail: optionalText(row.public_email)
          } : undefined
        };
      }),
      unlinkedApplications: applicationsResult.rows.map((row): AdminVendorDesignUnlinkedApplication => ({
        id: text(row.public_id),
        state: text(row.state),
        tradingName: text(row.trading_name),
        legalName: text(row.legal_name),
        contactEmail: text(row.contact_email),
        phone: optionalText(row.phone),
        addressLine1: text(row.address_line1),
        postcode: text(row.postcode)
      }))
    };
  }, { readOnly: true });
}

export async function createAdminVendorShop(principal: SessionPrincipal, input: { applicationId: string; reason: string }) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("Vendor shop creation requires the production database");
  const applicationId = input.applicationId.trim();
  const reason = input.reason.trim();
  if (!applicationId) throw new Error("Vendor application is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character audit reason is required");
  const now = new Date();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const current = await tx.query<SqlRow>(`SELECT a.id::text AS application_uuid,a.public_id,a.status::text AS application_status,
        a.owner_user_id::text AS owner_uuid,a.market_id::text AS market_uuid,a.legal_name,a.trading_name,a.tax_number,a.gemi_number,
        a.contact_email,a.phone,a.address_line1,a.postcode,a.shop_story,a.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id
      FROM vendor_applications a LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
      JOIN markets m ON m.id=a.market_id
      WHERE (a.public_id=$1 OR a.id::text=$1) AND m.code='sparta' FOR UPDATE OF a`, [applicationId]);
    const row = current.rows[0];
    if (!row) throw new Error("Vendor application not found");
    if (optionalText(row.vendor_uuid) && optionalText(row.vendor_public_id)) {
      return { applicationId: text(row.public_id), vendorId: text(row.vendor_public_id), created: false };
    }
    const applicationState = text(row.application_status);
    if (["restricted", "suspended", "closed"].includes(applicationState)) throw new Error(`Cannot create a shop while the application is ${applicationState}`);
    const vendorStatus = applicationState;
    const verificationCompletedAt = ["catalog_onboarding", "test_ready", "active"].includes(applicationState) ? now : null;
    const marketUuid = text(row.market_uuid);
    const taxNumber = optionalText(row.tax_number) ?? null;
    const gemiNumber = optionalText(row.gemi_number) ?? null;
    let vendorUuid: string;
    let actualVendorPublicId: string;

    const identityMatches = taxNumber || gemiNumber
      ? await tx.query<SqlRow>(`SELECT id::text AS id,public_id,status::text AS status,trading_name
          FROM vendor_businesses
          WHERE market_id=$1::uuid
            AND (($2::text IS NOT NULL AND tax_number=$2) OR ($3::text IS NOT NULL AND gemi_number=$3))
          ORDER BY created_at,public_id
          FOR UPDATE`, [marketUuid, taxNumber, gemiNumber])
      : undefined;

    if (identityMatches && identityMatches.rowCount > 1) {
      throw new Error("More than one vendor record matches this application ΑΦΜ/ΓΕΜΗ. Resolve the identity duplicates before creating the shop.");
    }

    if (identityMatches?.rowCount === 1) {
      const identity = identityMatches.rows[0];
      const identityStatus = text(identity.status);
      const identityPublicId = text(identity.public_id);
      if (!identityPublicId.startsWith("vendor_research_") || identityStatus !== "invited") {
        throw new Error("This application ΑΦΜ/ΓΕΜΗ already belongs to a non-research vendor. Link or resolve that vendor instead of creating a duplicate shop.");
      }
      const identityUuid = text(identity.id);
      const tradingNameConflict = await tx.query<SqlRow>(`SELECT public_id FROM vendor_businesses
        WHERE market_id=$1::uuid AND trading_name=$2 AND id<>$3::uuid LIMIT 1`, [marketUuid, text(row.trading_name), identityUuid]);
      if (tradingNameConflict.rowCount) {
        throw new Error("The application trading name is already used by another vendor. Resolve the duplicate before promoting this research prospect.");
      }
      await tx.query(`UPDATE vendor_businesses SET legal_name=$2,trading_name=$3,tax_number=COALESCE($4,tax_number),gemi_number=COALESCE($5,gemi_number),
        status=$6,verification_completed_at=$7,contract_started_at=NULL,public_directory_visible=false,demo_mode=false,
        public_directory_visibility_updated_at=$8,public_directory_visibility_reason='Research prospect matched by ΑΦΜ/ΓΕΜΗ and promoted to admin-created shop',updated_at=$8
        WHERE id=$1::uuid`, [identityUuid, text(row.legal_name), text(row.trading_name), taxNumber, gemiNumber, vendorStatus, verificationCompletedAt, now]);
      vendorUuid = identityUuid;
      actualVendorPublicId = identityPublicId;
    } else {
      const vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const inserted = await tx.query<SqlRow>(`INSERT INTO vendor_businesses(
          id,public_id,market_id,legal_name,trading_name,tax_number,gemi_number,status,verification_completed_at,
          contract_started_at,public_directory_visible,demo_mode,created_at,updated_at
        ) VALUES($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,NULL,false,false,$10,$10)
        ON CONFLICT (market_id,trading_name) DO UPDATE SET
          legal_name=EXCLUDED.legal_name,
          tax_number=COALESCE(EXCLUDED.tax_number,vendor_businesses.tax_number),
          gemi_number=COALESCE(EXCLUDED.gemi_number,vendor_businesses.gemi_number),status=EXCLUDED.status,
          verification_completed_at=EXCLUDED.verification_completed_at,contract_started_at=NULL,
          public_directory_visible=false,demo_mode=false,
          public_directory_visibility_updated_at=EXCLUDED.updated_at,
          public_directory_visibility_reason='Research prospect promoted to admin-created shop',updated_at=EXCLUDED.updated_at
        WHERE vendor_businesses.public_id LIKE 'vendor_research_%' AND vendor_businesses.status='invited'
        RETURNING id::text AS id,public_id`, [
        randomUUID(), vendorPublicId, marketUuid, text(row.legal_name), text(row.trading_name), taxNumber,
        gemiNumber, vendorStatus, verificationCompletedAt, now
      ]);
      if (!inserted.rowCount) throw new Error("A non-research vendor with the same trading name already exists. Resolve the duplicate before creating a shop.");
      vendorUuid = text(inserted.rows[0].id);
      actualVendorPublicId = text(inserted.rows[0].public_id);
    }

    const existingLocation = await tx.query<SqlRow>(`SELECT id::text AS id,address_line1,locality,postcode FROM vendor_locations
      WHERE vendor_id=$1::uuid ORDER BY is_primary DESC NULLS LAST,active DESC,created_at ASC LIMIT 1 FOR UPDATE`, [vendorUuid]);
    if (existingLocation.rowCount) {
      const locationRow = existingLocation.rows[0];
      const locationChanged = normalized(locationRow.address_line1) !== normalized(row.address_line1)
        || normalized(locationRow.locality) !== "Sparta"
        || normalized(locationRow.postcode) !== normalized(row.postcode);
      await tx.query(`UPDATE vendor_locations SET market_id=$2::uuid,name=$3,address_line1=$4,locality='Sparta',postcode=$5,
        country_code='GR',phone=$6,public_email=$7,active=true,
        coordinates=CASE WHEN $8::boolean THEN NULL ELSE coordinates END,
        verified_at=$9,updated_at=$10 WHERE id=$1::uuid`, [
        text(locationRow.id), marketUuid, text(row.trading_name), text(row.address_line1), text(row.postcode),
        optionalText(row.phone) ?? null, text(row.contact_email), locationChanged, verificationCompletedAt, now
      ]);
    } else {
      await tx.query(`INSERT INTO vendor_locations(id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,phone,public_email,active,verified_at,created_at,updated_at)
        VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,'Sparta',$7,'GR',$8,$9,true,$10,$11,$11)`, [
        randomUUID(), `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`, vendorUuid, marketUuid, text(row.trading_name),
        text(row.address_line1), text(row.postcode), optionalText(row.phone) ?? null, text(row.contact_email), verificationCompletedAt, now
      ]);
    }

    const membership = await tx.query<SqlRow>(`INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
      VALUES($1,$2,$3::uuid,$4::uuid,NULL,true,$5)
      ON CONFLICT (vendor_id,user_id) WHERE location_id IS NULL DO UPDATE SET active=true
      RETURNING id::text AS id`, [randomUUID(), `vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`, vendorUuid, text(row.owner_uuid), now]);
    await tx.query("INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1::uuid,'vendor_owner') ON CONFLICT DO NOTHING", [text(membership.rows[0].id)]);
    if (optionalText(row.shop_story)) {
      await tx.query("INSERT INTO vendor_profile_translations(vendor_id,locale,story) VALUES($1::uuid,'el',$2) ON CONFLICT(vendor_id,locale) DO UPDATE SET story=EXCLUDED.story", [vendorUuid, optionalText(row.shop_story)]);
    }
    await tx.query("UPDATE vendor_applications SET vendor_id=$2::uuid,updated_at=$3 WHERE id=$1::uuid", [text(row.application_uuid), vendorUuid, now]);
    return { applicationId: text(row.public_id), vendorId: actualVendorPublicId, created: true, applicationState, vendorStatus };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, result.created ? "vendor.shop_created" : "vendor.shop_create_idempotent", "vendor_business", result.vendorId, reason, result);
  return result;
}

export async function updateAdminVendorDesign(principal: SessionPrincipal, input: {
  vendorId: string;
  tradingName: string;
  shortDescription?: string;
  story?: string;
  locationName?: string;
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  postcode?: string;
  phone?: string;
  publicEmail?: string;
  reason: string;
}) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("Vendor design editing requires the production database");
  const vendorId = input.vendorId.trim();
  const tradingName = input.tradingName.trim();
  const reason = input.reason.trim();
  if (!vendorId || tradingName.length < 2 || tradingName.length > 180) throw new Error("Vendor and a valid trading name are required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character audit reason is required");
  const shortDescription = input.shortDescription?.trim().slice(0, 500) || null;
  const story = input.story?.trim().slice(0, 5000) || null;
  const now = new Date();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const vendor = await tx.query<SqlRow>(`SELECT v.id::text AS vendor_uuid,v.public_id,v.status::text AS status
      FROM vendor_businesses v JOIN markets m ON m.id=v.market_id
      WHERE (v.public_id=$1 OR v.id::text=$1) AND m.code='sparta' FOR UPDATE OF v`, [vendorId]);
    const row = vendor.rows[0];
    if (!row) throw new Error("Vendor shop not found");
    const vendorUuid = text(row.vendor_uuid);
    await tx.query("UPDATE vendor_businesses SET trading_name=$2,updated_at=$3 WHERE id=$1::uuid", [vendorUuid, tradingName, now]);
    await tx.query(`INSERT INTO vendor_profile_translations(vendor_id,locale,short_description,story)
      VALUES($1::uuid,'el',$2,$3)
      ON CONFLICT(vendor_id,locale) DO UPDATE SET short_description=EXCLUDED.short_description,story=EXCLUDED.story`, [vendorUuid, shortDescription, story]);

    const location = await tx.query<SqlRow>(`SELECT id::text AS id,address_line1,address_line2,locality,postcode,verified_at,coordinates IS NOT NULL AS has_coordinates
      FROM vendor_locations WHERE vendor_id=$1::uuid
      ORDER BY is_primary DESC NULLS LAST,active DESC,created_at ASC LIMIT 1 FOR UPDATE`, [vendorUuid]);
    const addressLine1 = input.addressLine1?.trim() || undefined;
    const addressLine2 = input.addressLine2?.trim() || undefined;
    const locality = input.locality?.trim() || undefined;
    const postcode = input.postcode?.trim() || undefined;
    let locationIdentityChanged = false;
    if (location.rowCount) {
      const locationRow = location.rows[0];
      const nextAddressLine1 = addressLine1 ?? "";
      const nextAddressLine2 = addressLine2 ?? "";
      const nextLocality = locality ?? "Sparta";
      const nextPostcode = postcode ?? "";
      locationIdentityChanged = normalized(locationRow.address_line1) !== nextAddressLine1
        || normalized(locationRow.address_line2) !== nextAddressLine2
        || normalized(locationRow.locality) !== nextLocality
        || normalized(locationRow.postcode) !== nextPostcode;
      await tx.query(`UPDATE vendor_locations SET name=$2,address_line1=$3,address_line2=$4,locality=$5,postcode=$6,phone=$7,public_email=$8,
        coordinates=CASE WHEN $9::boolean THEN NULL ELSE coordinates END,
        verified_at=CASE WHEN $9::boolean THEN NULL ELSE verified_at END,
        updated_at=$10 WHERE id=$1::uuid`, [
        text(locationRow.id), input.locationName?.trim() || tradingName, nextAddressLine1, addressLine2 ?? null,
        nextLocality, nextPostcode, input.phone?.trim() || null, input.publicEmail?.trim() || null, locationIdentityChanged, now
      ]);
    } else if (addressLine1 && locality && postcode) {
      const market = await tx.query<SqlRow>("SELECT market_id::text AS market_uuid FROM vendor_businesses WHERE id=$1::uuid", [vendorUuid]);
      await tx.query(`INSERT INTO vendor_locations(id,public_id,vendor_id,market_id,name,address_line1,address_line2,locality,postcode,country_code,phone,public_email,active,created_at,updated_at)
        VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'GR',$10,$11,true,$12,$12)`, [
        randomUUID(), `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`, vendorUuid, text(market.rows[0].market_uuid),
        input.locationName?.trim() || tradingName, addressLine1, addressLine2 ?? null, locality, postcode,
        input.phone?.trim() || null, input.publicEmail?.trim() || null, now
      ]);
      locationIdentityChanged = true;
    }
    return {
      vendorId: text(row.public_id),
      tradingName,
      status: text(row.status),
      locationIdentityChanged,
      updatedAt: now.toISOString()
    };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, "vendor.storefront_design_updated", "vendor_business", result.vendorId, reason, result);
  return result;
}

export async function setAdminVendorDesignDemoMode(principal: SessionPrincipal, input: { vendorId: string; enabled: boolean; reason: string }) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("DEMO mode requires the production database");
  const vendorId = input.vendorId.trim();
  const reason = input.reason.trim();
  if (!vendorId || reason.length < 3 || reason.length > 500) throw new Error("Vendor and a 3–500 character audit reason are required");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const current = await tx.query<SqlRow>(`SELECT v.id::text AS vendor_uuid,v.public_id,v.status::text AS status,v.demo_mode
      FROM vendor_businesses v JOIN markets m ON m.id=v.market_id
      WHERE (v.public_id=$1 OR v.id::text=$1) AND m.code='sparta' FOR UPDATE OF v`, [vendorId]);
    const row = current.rows[0];
    if (!row) throw new Error("Vendor shop not found");
    const status = text(row.status);
    if (input.enabled && status === "active") throw new Error("Active vendors use the live storefront; DEMO mode is for pre-live shops");
    if (input.enabled && ["restricted", "suspended", "closed"].includes(status)) throw new Error(`DEMO mode cannot be enabled while vendor status is ${status}`);
    await tx.query("UPDATE vendor_businesses SET demo_mode=$2,demo_mode_updated_at=now(),updated_at=now() WHERE id=$1::uuid", [text(row.vendor_uuid), input.enabled]);
    return { vendorId: text(row.public_id), enabled: input.enabled, status };
  }, { isolation: "serializable" });
  await recordAdminAudit(principal, input.enabled ? "vendor.demo.enabled" : "vendor.demo.disabled", "vendor_business", result.vendorId, reason, result);
  return result;
}
