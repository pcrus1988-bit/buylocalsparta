import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  type SessionPrincipal
} from "../packages/core/src/index.ts";
import { createPostgresRuntimeFromEnv } from "../packages/postgres-runtime/src/index.ts";
import { resolveVendorOperatingAssignment } from "../apps/web/src/lib/vendor-operating-assignment.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run HUB runtime acceptance outside an explicitly synthetic disposable database");
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "hub-non-sparta-runtime-acceptance" });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const nonSpartaMarketCode = `ci-hub-${suffix}`;
const nonSpartaVendorId = `vendor_hub_ci_${suffix}`;
const nonSpartaLocationId = `location_hub_ci_${suffix}`;
const nonSpartaUserId = `usr_hub_ci_${suffix}`;
const spartaVendorId = `vendor_sparta_ci_${suffix}`;
const spartaLocationId = `location_sparta_ci_${suffix}`;
const spartaUserId = `usr_sparta_ci_${suffix}`;
const now = new Date();

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function principal(input: { userId: string; vendorId: string; email: string }): SessionPrincipal {
  return {
    userId: input.userId,
    email: input.email,
    roles: ["vendor_owner"],
    vendorId: input.vendorId,
    csrfToken: `csrf-${suffix}`,
    sessionId: `session-${suffix}`
  };
}

try {
  const readiness = await runtime.readiness();
  expect(readiness.ok, `Database is not ready: ${readiness.message}`);

  const hubRegistry = await runtime.sqlPool.query<{ hub_id: string } & Record<string, unknown>>(
    "SELECT hub_id FROM expansion_hubs WHERE hub_id='KM-HUB-019'"
  );
  expect(hubRegistry.rowCount === 1, "KM-HUB-019 is missing from the canonical expansion HUB registry");

  await runtime.sqlPool.query(
    `INSERT INTO markets(code,name)
     VALUES($1,$2)`,
    [nonSpartaMarketCode, `CI Non-Sparta HUB ${suffix}`]
  );

  await runtime.sqlPool.query(
    `UPDATE expansion_hubs
     SET lifecycle_state='active',research_status='ACTIVE_REFERENCE',updated_at=now()
     WHERE hub_id='KM-HUB-019'`
  );

  await runtime.sqlPool.query(
    `INSERT INTO market_hub_config(
       market_id,hub_code,gateway_slug,is_operational,prospecting_enabled,
       gateway_visible,shopping_enabled,search_indexable,is_default_fallback,metadata
     )
     SELECT id,'KM-HUB-019',$2,true,false,false,false,false,false,
            jsonb_build_object('fixture','hub-non-sparta-runtime-acceptance')
     FROM markets WHERE code=$1`,
    [nonSpartaMarketCode, `ci-${suffix}`]
  );

  await runtime.sqlPool.query(
    `WITH market AS (SELECT id FROM markets WHERE code=$1)
     INSERT INTO vendor_businesses(
       public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at,
       public_directory_visible,demo_mode
     )
     SELECT $2,market.id,$3,$3,'active',$4,$4,false,false
     FROM market`,
    [nonSpartaMarketCode, nonSpartaVendorId, `CI Non-Sparta Vendor ${suffix}`, now]
  );

  await runtime.sqlPool.query(
    `WITH market AS (SELECT id FROM markets WHERE code=$1),
          vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$2)
     INSERT INTO vendor_locations(
       public_id,vendor_id,market_id,name,address_line1,locality,postcode,
       active,verified_at,is_primary
     )
     SELECT $3,vendor.id,market.id,'CI Hub Location','1 CI Hub Street','Kalamata','24100',
            true,$4,true
     FROM market,vendor`,
    [nonSpartaMarketCode, nonSpartaVendorId, nonSpartaLocationId, now]
  );

  await runtime.sqlPool.query(
    `INSERT INTO users(public_id,email,status,email_verified_at)
     VALUES($1,$2,'active',$3)`,
    [nonSpartaUserId, `hub-ci-${suffix}@example.test`, now]
  );

  const nonSpartaPrincipal = principal({
    userId: nonSpartaUserId,
    vendorId: nonSpartaVendorId,
    email: `hub-ci-${suffix}@example.test`
  });

  const nonSpartaAssignment = await resolveVendorOperatingAssignment(nonSpartaPrincipal);
  expect(nonSpartaAssignment.marketId === nonSpartaMarketCode, "Non-Sparta vendor did not resolve its persisted market");
  expect(nonSpartaAssignment.hubId === "KM-HUB-019", "Non-Sparta vendor did not resolve KM-HUB-019");
  expect(nonSpartaAssignment.locationId === nonSpartaLocationId, "Non-Sparta vendor did not resolve its primary location");
  expect(nonSpartaAssignment.operatingModel === "SELF_GOVERNED", "Live non-Sparta HUB vendor did not resolve SELF_GOVERNED");

  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const nonSpartaScope = await uow.withTransaction(
    { actorUserId: nonSpartaUserId, vendorId: nonSpartaVendorId },
    async (tx) => tx.query<{ scoped_market_id: string; persisted_market_id: string } & Record<string, unknown>>(
      `SELECT current_setting('app.market_id', true) AS scoped_market_id,
              vb.market_id::text AS persisted_market_id
       FROM vendor_businesses vb
       WHERE vb.public_id=$1`,
      [nonSpartaVendorId]
    ),
    { readOnly: true }
  );
  expect(nonSpartaScope.rowCount === 1, "Non-Sparta vendor row was not visible in its derived scope");
  expect(
    nonSpartaScope.rows[0]?.scoped_market_id === nonSpartaScope.rows[0]?.persisted_market_id,
    "Implicit vendor database scope did not derive the persisted non-Sparta market"
  );

  await runtime.sqlPool.query(
    `WITH market AS (SELECT id FROM markets WHERE code='sparta')
     INSERT INTO vendor_businesses(
       public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at,
       public_directory_visible,demo_mode
     )
     SELECT $1,market.id,$2,$2,'active',$3,$3,false,false
     FROM market`,
    [spartaVendorId, `CI Sparta Vendor ${suffix}`, now]
  );

  await runtime.sqlPool.query(
    `WITH market AS (SELECT id FROM markets WHERE code='sparta'),
          vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
     INSERT INTO vendor_locations(
       public_id,vendor_id,market_id,name,address_line1,locality,postcode,
       active,verified_at,is_primary
     )
     SELECT $2,vendor.id,market.id,'CI Sparta Location','1 CI Sparta Street','Sparta','23100',
            true,$3,true
     FROM market,vendor`,
    [spartaVendorId, spartaLocationId, now]
  );

  await runtime.sqlPool.query(
    `INSERT INTO users(public_id,email,status,email_verified_at)
     VALUES($1,$2,'active',$3)`,
    [spartaUserId, `sparta-ci-${suffix}@example.test`, now]
  );

  const spartaPrincipal = principal({
    userId: spartaUserId,
    vendorId: spartaVendorId,
    email: `sparta-ci-${suffix}@example.test`
  });
  const spartaAssignment = await resolveVendorOperatingAssignment(spartaPrincipal);
  expect(spartaAssignment.marketId === "sparta", "Sparta vendor did not retain the Sparta market");
  expect(spartaAssignment.operatingModel === "MANAGED", "Sparta legacy vendor must remain MANAGED");

  const spartaScope = await uow.withTransaction(
    { actorUserId: spartaUserId, vendorId: spartaVendorId },
    async (tx) => tx.query<{ scoped_market_id: string; persisted_market_id: string } & Record<string, unknown>>(
      `SELECT current_setting('app.market_id', true) AS scoped_market_id,
              vb.market_id::text AS persisted_market_id
       FROM vendor_businesses vb
       WHERE vb.public_id=$1`,
      [spartaVendorId]
    ),
    { readOnly: true }
  );
  expect(spartaScope.rowCount === 1, "Sparta vendor row was not visible in its derived scope");
  expect(
    spartaScope.rows[0]?.scoped_market_id === spartaScope.rows[0]?.persisted_market_id,
    "Implicit vendor database scope did not retain Sparta"
  );

  console.log(
    `HUB runtime acceptance passed: ${nonSpartaMarketCode}/KM-HUB-019 is SELF_GOVERNED with derived DB scope; Sparta remains MANAGED.`
  );
} finally {
  await runtime.close();
}
