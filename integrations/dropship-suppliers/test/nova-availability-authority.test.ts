import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL(
  "../../../apps/web/src/lib/nova-availability-refresh-runtime.ts",
  import.meta.url
);

async function runtimeSource(): Promise<string> {
  return readFile(runtimeUrl, "utf8");
}

test("Nova full availability refresh is API-authoritative and independent from approved_at", async () => {
  const source = await runtimeSource();

  assert.match(source, /client\.listProducts\(storeId,/);
  assert.match(source, /nova_api_authoritative_full_catalogue/);
  assert.doesNotMatch(source, /vo\.approved_at\s+IS\s+NOT\s+NULL/i);
});

test("Nova availability refresh only updates offers owned by the supplier vendor", async () => {
  const source = await runtimeSource();

  assert.match(source, /vo\.vendor_id=ds\.owner_vendor_id/);
  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /dso\.active=true/);
});

test("Nova availability refresh does not mutate publication or supplier-order controls", async () => {
  const source = await runtimeSource();
  const fullSweep = source.slice(
    source.indexOf("export async function runNovaAvailabilityRefreshSweep"),
    source.indexOf("export async function runNovaAvailabilityRefreshForProduct")
  );

  assert.ok(fullSweep.length > 0);
  assert.doesNotMatch(fullSweep, /merchant_visible\s*=/i);
  assert.doesNotMatch(fullSweep, /customer_price_minor\s*=/i);
  assert.doesNotMatch(fullSweep, /order_forwarding_enabled\s*=/i);
  assert.doesNotMatch(fullSweep, /approved_at\s*=/i);
});
