import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCatalogWebCrawlPromotionReadiness,
  catalogWebCrawlPromotionBlockedMessage,
} from "../apps/web/src/lib/catalogue-crawler-promotion-readiness.ts";

const jobId = "11111111-1111-4111-8111-111111111111";

function row(overrides: Record<string, unknown> = {}) {
  return {
    job_id: jobId,
    job_exists: true,
    job_status: "succeeded",
    source_active: true,
    accepted_product_count: 3,
    collision_product_key_count: 0,
    ...overrides,
  };
}

test("completed active crawl with accepted unique products is ready", () => {
  const readiness = buildCatalogWebCrawlPromotionReadiness(row());
  assert.equal(readiness.ready, true);
  assert.equal(readiness.acceptedProductCount, 3);
  assert.deepEqual(readiness.blockers, []);
});

test("missing jobs fail closed without synthetic secondary blockers", () => {
  const readiness = buildCatalogWebCrawlPromotionReadiness(row({
    job_exists: false,
    job_status: null,
    source_active: false,
    accepted_product_count: 0,
  }));
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.blockers.map((blocker) => blocker.code), ["job_not_found"]);
});

test("readiness mirrors the promotion preconditions", () => {
  const readiness = buildCatalogWebCrawlPromotionReadiness(row({
    job_status: "running",
    source_active: false,
    accepted_product_count: 0,
    collision_product_key_count: 2,
  }));
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.blockers.map((blocker) => blocker.code), [
    "job_not_completed",
    "source_inactive",
    "source_key_collision",
    "no_accepted_products",
  ]);
  assert.match(catalogWebCrawlPromotionBlockedMessage(readiness), /not ready for Supplier PIM import/i);
});

test("partial crawls remain eligible when their accepted evidence is unambiguous", () => {
  const readiness = buildCatalogWebCrawlPromotionReadiness(row({ job_status: "partial", accepted_product_count: 1 }));
  assert.equal(readiness.ready, true);
});

test("Admin read preview and write action use the same evaluator before promotion", () => {
  const service = readFileSync("apps/web/src/lib/admin-catalogue-crawler.ts", "utf8");
  const page = readFileSync("apps/web/src/app/admin/catalogue-crawler/page.tsx", "utf8");
  const evaluator = readFileSync("apps/web/src/lib/catalogue-crawler-promotion-readiness.ts", "utf8");

  const promotionFunction = service.slice(service.indexOf("export async function promoteAdminCrawlerJob"));
  const gatePosition = promotionFunction.indexOf("evaluateCatalogWebCrawlPromotionReadiness(tx, [jobId])");
  const writePosition = promotionFunction.indexOf("bls_private.promote_catalog_web_crawl_job($1)");
  assert.ok(gatePosition >= 0, "write path must evaluate readiness");
  assert.ok(writePosition > gatePosition, "write path must gate before database promotion");
  assert.match(promotionFunction, /assertAdminPermission\(principal, "catalog\.write"\)/);

  assert.match(service, /evaluateCatalogWebCrawlPromotionReadiness\(tx, jobIds\)/);
  assert.match(page, /job\.promotionReadiness\.ready/);
  assert.match(page, /job\.promotionReadiness\.blockers/);
  assert.match(page, /Import blocked/);

  assert.match(evaluator, /job\.status AS job_status/);
  assert.match(evaluator, /source\.active/);
  assert.match(evaluator, /extraction\.status IN \('accepted','promoted'\)/);
  assert.match(evaluator, /HAVING count\(DISTINCT extraction\.extracted_payload\)>1/);
  assert.doesNotMatch(evaluator, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i, "readiness evaluator must remain read-only");
});
