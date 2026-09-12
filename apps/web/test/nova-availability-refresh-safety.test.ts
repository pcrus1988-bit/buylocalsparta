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

test("failed availability refresh cannot extend supplier evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const fetchPosition = source.indexOf("await getProductWithRateLimitBackoff");
  const checkedAtPosition = source.indexOf("const checkedAt = new Date()");
  const failurePosition = source.indexOf("nova.availability_product_refresh_failed");

  assert.ok(fetchPosition >= 0);
  assert.ok(checkedAtPosition > fetchPosition, "availability timestamps must be created only after a successful supplier fetch");
  assert.ok(failurePosition > checkedAtPosition);
  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.doesNotMatch(source.slice(failurePosition), /availability_expires_at=/);
});
