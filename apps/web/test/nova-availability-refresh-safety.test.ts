import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/lib/nova-availability-refresh-runtime.ts", import.meta.url);

test("Nova availability refresh saturates but never exceeds the provider request ceiling", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE = 60/);
  assert.match(source, /BLS_NOVA_AVAILABILITY_REQUESTS_PER_MINUTE/);
  assert.match(source, /requestsPerMinute: novaAvailabilityRequestsPerMinute\(\)/);
  assert.match(source, /parsed >= 1 && parsed <= 60/);
});

test("Nova full sweep pipelines multiple pages while sharing the rate-limited client", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /DEFAULT_FULL_SWEEP_PAGE_CONCURRENCY = 8/);
  assert.match(source, /BLS_NOVA_AVAILABILITY_PAGE_CONCURRENCY/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /pageNumbers\.map/);
  assert.match(source, /listProductsWithRateLimitBackoff\(client, storeId, currentPage, perPage\)/);
  assert.match(source, /refreshNovaAvailabilityPage\(products, storeId, checkedAt, db\)/);
});

test("Nova availability refresh retries only provider throttling with bounded backoff", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /error instanceof NovaV1ApiError/);
  assert.match(source, /error\.status !== 429/);
  assert.match(source, /RATE_LIMIT_BACKOFF_MS/);
  assert.match(source, /5_000, 10_000, 20_000, 30_000/);
});

test("Nova full availability refresh is supplier-authoritative rather than approval-authoritative", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /client\.listProducts\(storeId,/);
  assert.match(source, /nova_api_authoritative_full_catalogue/);
  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /dso\.active=true/);
  assert.doesNotMatch(source, /vo\.approved_at IS NOT NULL/);
  assert.doesNotMatch(source, /vo\.status='approved'/);
  assert.doesNotMatch(source, /vo\.merchant_visible=true/);
  assert.doesNotMatch(source, /vo\.customer_price_minor IS NOT NULL/);
});

test("full availability refresh updates only offers belonging to the supplier owner vendor", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /vo\.id=dso\.vendor_offer_id/);
  assert.match(source, /vo\.vendor_id=ds\.owner_vendor_id/);
});

test("failed full-catalogue fetch cannot extend supplier evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const sweepPosition = source.indexOf("async function runNovaAvailabilityRefreshSweepUnlocked");
  const fetchPosition = source.indexOf("listProductsWithRateLimitBackoff(client, storeId, currentPage, perPage)", sweepPosition);
  const checkedAtPosition = source.indexOf("const checkedAt = new Date()", fetchPosition);
  const updatePosition = source.indexOf("refreshNovaAvailabilityPage(products, storeId, checkedAt, db)", checkedAtPosition);

  assert.ok(sweepPosition >= 0);
  assert.ok(fetchPosition > sweepPosition);
  assert.ok(checkedAtPosition > fetchPosition, "availability timestamps must be created only after successful supplier page fetches");
  assert.ok(updatePosition > checkedAtPosition, "offer TTLs must only be extended after authoritative page data exists");
  assert.match(source.slice(fetchPosition, checkedAtPosition), /throw error/);
});

test("availability refresh matches the deployed dropship offer schema", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /last_seen_at\s*=/);
  assert.match(source, /availability_checked_at=\$6/);
  assert.match(source, /availability_expires_at=\$6::timestamptz/);
  assert.match(source, /availability_checked_at=\$3::timestamptz/);
  assert.match(source, /availability_expires_at=\$3::timestamptz/);
});

test("completed availability sweeps refresh storefront read models and facets once", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /refreshNovaStorefrontAvailabilityReadModels/);
  assert.match(source, /storefront_catalog_read_model/);
  assert.match(source, /storefront_dropship_family_read_model/);
  assert.match(source, /storefront_dropship_vendor_facets/);
  assert.match(source, /storefront_facet_read_model/);
  assert.match(source, /storefront_filter_read_model/);
  assert.match(source, /storefront_vendor_assortment_read_model/);
  assert.match(source, /REFRESH MATERIALIZED VIEW CONCURRENTLY/);
});
