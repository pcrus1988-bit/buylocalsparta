import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/lib/nova-availability-refresh-runtime.ts", import.meta.url);

test("Nova availability refresh uses conservative provider rate limiting", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE = 20/);
  assert.match(source, /BLS_NOVA_AVAILABILITY_REQUESTS_PER_MINUTE/);
  assert.match(source, /requestsPerMinute: novaAvailabilityRequestsPerMinute\(\)/);
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
  const sweepPosition = source.indexOf("export async function runNovaAvailabilityRefreshSweep");
  const fetchPosition = source.indexOf("await listProductsWithRateLimitBackoff", sweepPosition);
  const checkedAtPosition = source.indexOf("const checkedAt = new Date()", fetchPosition);
  const updatePosition = source.indexOf("refreshNovaAvailabilityPage", checkedAtPosition);

  assert.ok(sweepPosition >= 0);
  assert.ok(fetchPosition > sweepPosition);
  assert.ok(checkedAtPosition > fetchPosition, "availability timestamps must be created only after a successful supplier page fetch");
  assert.ok(updatePosition > checkedAtPosition, "offer TTLs must only be extended after authoritative page data exists");
  assert.match(source.slice(fetchPosition, checkedAtPosition), /throw error/);
});

test("availability refresh matches the deployed dropship offer schema", async () => {
  const source = await readFile(sourceUrl, "utf8");

  // dropship_supplier_offers has availability_checked_at/availability_expires_at and
  // last_catalogue_sync_at, but no last_seen_at column in production. Keep the
  // authoritative refresh updates limited to fields that actually exist.
  assert.doesNotMatch(source, /last_seen_at\s*=/);
  assert.match(source, /availability_checked_at=\$6/);
  assert.match(source, /availability_expires_at=\$6::timestamptz/);
  assert.match(source, /availability_checked_at=\$3::timestamptz/);
  assert.match(source, /availability_expires_at=\$3::timestamptz/);
});
