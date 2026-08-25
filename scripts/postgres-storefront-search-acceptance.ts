import { randomUUID } from "node:crypto";
import { postgresStorefrontSearchReadiness, postgresStorefrontSearchSignal } from "../apps/web/src/lib/postgres-storefront-search.ts";
import { getProductionPostgresRuntime } from "../apps/web/src/lib/postgres-runtime.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing storefront-search acceptance without BLS_ACCEPTANCE_SYNTHETIC_DB=true");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing storefront-search acceptance with NODE_ENV=production");
}

const runtime = getProductionPostgresRuntime();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const hiddenSearchToken = `SearchHiddenOnly${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const categoryCode = `search-accept-${suffix}`;
const visibleId = `canonical_search_accept_${suffix}`;
const hiddenId = `canonical_search_hidden_${suffix}`;
const visibleTitle = `Σχολική Τσάντα Αθηνά ${suffix}`;
const hiddenTitle = `Μυστικό ${hiddenSearchToken}`;

try {
  await runtime.nativePool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
    category AS (
      INSERT INTO categories (market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
      SELECT id,$1,$1,'standard',true,'product_class',true,true FROM market
      RETURNING id,market_id
    )
    INSERT INTO canonical_variants (
      public_id,market_id,category_id,slug,model,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
    )
    SELECT $2,category.market_id,category.id,$2,$3,1599,'EUR',2400,true,false,false FROM category
  `, [categoryCode, visibleId, visibleTitle]);

  await runtime.nativePool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
         category AS (SELECT id,market_id FROM categories WHERE code=$1 AND market_id=(SELECT id FROM market))
    INSERT INTO canonical_variants (
      public_id,market_id,category_id,slug,model,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
    )
    SELECT $2,category.market_id,category.id,$2,$3,999,'EUR',2400,true,true,false FROM category
  `, [categoryCode, hiddenId, hiddenTitle]);

  const readiness = await postgresStorefrontSearchReadiness();
  if (!readiness.ready || readiness.provider !== "postgres" || readiness.visibleProducts < 1) {
    throw new Error(`PostgreSQL storefront search readiness failed: ${readiness.message}`);
  }

  const greek = await postgresStorefrontSearchSignal("σχολικη τσαντα", 8);
  if (!greek.hasResults || !greek.suggestions.includes(visibleTitle)) {
    throw new Error("Greek accent-insensitive storefront search did not return the visible canonical title");
  }

  const prefix = await postgresStorefrontSearchSignal(`αθηνα ${suffix}`, 8);
  if (!prefix.hasResults || !prefix.suggestions.includes(visibleTitle)) {
    throw new Error("Storefront search did not match normalized title terms");
  }

  const hidden = await postgresStorefrontSearchSignal(hiddenSearchToken, 8);
  if (hidden.hasResults || hidden.suggestions.some((value) => value === hiddenTitle || value.includes(hiddenId))) {
    throw new Error("Suppressed canonical leaked into PostgreSQL storefront search");
  }

  const empty = await postgresStorefrontSearchSignal("", 8);
  if (empty.hasResults || empty.suggestions.length) throw new Error("Empty search should not manufacture results");

  console.log(JSON.stringify({
    ok: true,
    provider: readiness.provider,
    mode: readiness.mode,
    visibleProducts: readiness.visibleProducts,
    matchedTitle: visibleTitle,
    hiddenCanonicalSuppressed: true
  }, null, 2));
} finally {
  await runtime.nativePool.query("DELETE FROM canonical_variants WHERE public_id = ANY($1::text[])", [[visibleId, hiddenId]]).catch(() => undefined);
  await runtime.nativePool.query(`
    DELETE FROM product_families
    WHERE category_id IN (SELECT id FROM categories WHERE code=$1)
  `, [categoryCode]).catch(() => undefined);
  await runtime.nativePool.query("DELETE FROM categories WHERE code=$1", [categoryCode]).catch(() => undefined);
  await runtime.close();
}
