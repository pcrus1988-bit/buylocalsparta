import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { confirmVendorAssignedCatalogueEvidence, vendorAssignedCatalogueWorkspace } from "../apps/web/src/lib/vendor-assigned-catalogue-service.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "vendor-assigned-catalogue-evidence-smoke" });
try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  assert(readiness.ok, `schema ${EXPECTED_SCHEMA_VERSION} is required: ${readiness.message}`);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const marketResult = await runtime.nativePool.query<{ id: string }>("SELECT id::text FROM public.markets WHERE code='sparta' LIMIT 1");
  const marketId = required(marketResult.rows[0]?.id, "Sparta market");

  const reviewer = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.users(email,password_hash,status,email_verified_at)
    VALUES($1,'ci-only-not-a-runtime-password','active',now())
    RETURNING id::text
  `, [`ci-assigned-catalogue-${suffix}@example.test`]);
  const userId = required(reviewer.rows[0]?.id, "vendor user");

  const activeVendor = await createVendor("active", false);
  const activeLocation = await createLocation(activeVendor.id, "active");
  await connectVendorUser(activeVendor.id, activeLocation, userId);
  const activeAssortment = await createAssignedAssortment(activeVendor.id, activeLocation, "active");
  const activePrincipal = principal(userId, activeVendor.id);

  const before = await vendorAssignedCatalogueWorkspace(activePrincipal, { limit: 10 });
  assert(before.totalAssigned === 1, "active production vendor must see its assigned source row");
  assert(before.pendingPrice === 1 && before.pendingStock === 1, "new assignment must require price and stock evidence");
  assert(before.products[0]?.id === activeAssortment, "assigned workspace must expose browser-safe assortment id");

  await confirmVendorAssignedCatalogueEvidence(activePrincipal, {
    assortmentId: activeAssortment,
    supplierPriceMinor: 1234,
    stockOnHand: 7
  });

  const evidence = await runtime.nativePool.query<{
    assortment_status: string; availability_mode: string; price_check_status: string; stock_check_status: string;
    verified_supplier_price_minor: string; verified_stock_on_hand: number; evidence_only: boolean;
  }>(`
    SELECT assortment_status,availability_mode,price_check_status,stock_check_status,
           verified_supplier_price_minor::text,verified_stock_on_hand,
           COALESCE((metadata->>'evidenceOnly')::boolean,false) AS evidence_only
    FROM public.vendor_catalog_assortments WHERE public_id=$1
  `, [activeAssortment]);
  const row = evidence.rows[0];
  assert(row?.price_check_status === "confirmed" && row.stock_check_status === "confirmed", "vendor confirmation must persist evidence statuses");
  assert(Number(row?.verified_supplier_price_minor) === 1234 && row?.verified_stock_on_hand === 7, "vendor confirmation must preserve exact price/stock evidence");
  assert(row?.assortment_status === "candidate" && row.availability_mode === "ask_vendor", "evidence confirmation must not promote the assortment into sellable state");
  assert(row?.evidence_only === true, "evidence confirmation must mark its non-commerce boundary");

  const commerce = await runtime.nativePool.query<{ offers: string; inventory: string }>(`
    SELECT
      (SELECT count(*)::text FROM public.vendor_offers WHERE vendor_id=$1::uuid) AS offers,
      (SELECT count(*)::text FROM public.inventory_balances ib JOIN public.vendor_offers vo ON vo.id=ib.offer_id WHERE vo.vendor_id=$1::uuid) AS inventory
  `, [activeVendor.internalId]);
  assert(Number(commerce.rows[0]?.offers ?? 0) === 0, "assigned catalogue evidence must not create vendor offers");
  assert(Number(commerce.rows[0]?.inventory ?? 0) === 0, "assigned catalogue evidence must not create inventory balances");

  const inactiveVendor = await createVendor("catalog_onboarding", false);
  const inactiveLocation = await createLocation(inactiveVendor.id, "inactive");
  await createAssignedAssortment(inactiveVendor.id, inactiveLocation, "inactive");
  const inactiveWorkspace = await vendorAssignedCatalogueWorkspace(principal(userId, inactiveVendor.id), { limit: 10 });
  assert(inactiveWorkspace.totalAssigned === 0, "non-active production vendor must not see assigned catalogue rows");

  const demoVendor = await createVendor("invited", true);
  const demoLocation = await createLocation(demoVendor.id, "demo");
  await createAssignedAssortment(demoVendor.id, demoLocation, "demo");
  const demoWorkspace = await vendorAssignedCatalogueWorkspace(principal(userId, demoVendor.id), { limit: 10 });
  assert(demoWorkspace.totalAssigned === 1, "demo vendor must see assigned catalogue rows before production activation");

  console.log(JSON.stringify({
    ok: true,
    schema: readiness.appliedSchemaVersion,
    activeAssigned: before.totalAssigned,
    activeEvidence: { supplierPriceMinor: 1234, stockOnHand: 7 },
    inactiveVisible: inactiveWorkspace.totalAssigned,
    demoVisible: demoWorkspace.totalAssigned,
    commerceSideEffects: commerce.rows[0]
  }));

  async function createVendor(status: string, demoMode: boolean): Promise<{ id: string; internalId: string }> {
    const result = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name,status,demo_mode)
      VALUES($1::uuid,$2,$2,$3::vendor_status,$4)
      RETURNING id::text
    `, [marketId, `CI Assigned Catalogue ${status} ${suffix} ${randomUUID().slice(0, 6)}`, status, demoMode]);
    const id = required(result.rows[0]?.id, `vendor ${status}`);
    return { id, internalId: id };
  }

  async function createLocation(vendorId: string, label: string): Promise<string> {
    const result = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.vendor_locations(vendor_id,market_id,name,address_line1,locality,postcode,active)
      VALUES($1::uuid,$2::uuid,$3,'CI street','Sparta','23100',true)
      RETURNING id::text
    `, [vendorId, marketId, `CI ${label}`]);
    return required(result.rows[0]?.id, `location ${label}`);
  }

  async function connectVendorUser(vendorId: string, locationId: string, actorUserId: string): Promise<void> {
    await runtime.nativePool.query(`
      INSERT INTO public.vendor_users(vendor_id,user_id,location_id,active)
      VALUES($1::uuid,$2::uuid,$3::uuid,true)
    `, [vendorId, actorUserId, locationId]);
  }

  async function createAssignedAssortment(vendorId: string, locationId: string, label: string): Promise<string> {
    const source = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.catalog_sources(market_id,code,name,source_kind,active,metadata)
      VALUES($1::uuid,$2,$3,'supplier',true,'{}'::jsonb)
      RETURNING id::text
    `, [marketId, `ci_assigned_${label}_${suffix}_${randomUUID().slice(0, 4)}`, `CI Source ${label} ${suffix}`]);
    const sourceId = required(source.rows[0]?.id, `source ${label}`);
    const snapshot = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,metadata)
      VALUES($1::uuid,$2,'ci-v1',now(),'{}'::jsonb)
      RETURNING id::text
    `, [sourceId, `ci-assigned-${label}-${suffix}-${randomUUID()}`]);
    const snapshotId = required(snapshot.rows[0]?.id, `snapshot ${label}`);
    const product = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.catalog_source_products(
        snapshot_id,source_id,source_product_key,supplier_code,title,source_identity,raw_payload,normalized_payload,quality_payload
      ) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb)
      RETURNING id::text
    `, [snapshotId, sourceId, `ci-${label}-${suffix}`, `SKU-${label}-${suffix}`, `CI Assigned ${label}`, JSON.stringify({ brand: "CI Brand", model: "CI Model" })]);
    const sourceProductId = required(product.rows[0]?.id, `source product ${label}`);
    const assortment = await runtime.nativePool.query<{ public_id: string }>(`
      INSERT INTO public.vendor_catalog_assortments(
        market_id,vendor_id,location_id,source_product_id,assortment_status,availability_mode,confirmation_source,metadata
      ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'candidate','ask_vendor','import',jsonb_build_object('assignment','ci'))
      RETURNING public_id
    `, [marketId, vendorId, locationId, sourceProductId]);
    return required(assortment.rows[0]?.public_id, `assortment ${label}`);
  }
} finally {
  await runtime.close();
}

function principal(userId: string, vendorId: string): SessionPrincipal {
  return {
    sessionId: `ci-session-${userId}`,
    userId,
    email: `ci-${userId}@example.test`,
    roles: ["vendor_owner"],
    vendorId,
    csrfToken: "ci-csrf-token"
  };
}
function required(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
