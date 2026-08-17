import assert from "node:assert/strict";
import test from "node:test";
import { CatalogManagementService, money, previewVendorProductCsv, type CanonicalCatalogProduct } from "../src/index.ts";

function canonical(input: Partial<CanonicalCatalogProduct> & { id: string; title: string; categoryCode?: string; gtin?: string; attributes?: Record<string,string> }): CanonicalCatalogProduct {
  const now = 1_700_000_000_000;
  return {
    id: input.id,
    marketId: input.marketId ?? "sparta",
    categoryCode: input.categoryCode ?? "mobile-telecom-electronics",
    identity: {
      id: input.id,
      title: input.title,
      brand: input.identity?.brand ?? "Apple",
      model: input.identity?.model ?? "AirPods Pro 2",
      mpn: input.identity?.mpn ?? "MTJV3",
      gtin: input.gtin,
      condition: input.identity?.condition ?? "new",
      warrantyBasis: input.identity?.warrantyBasis ?? "EU consumer warranty",
      attributes: input.attributes ?? { colour: "white" }
    },
    titleEl: input.titleEl ?? input.title,
    titleEn: input.titleEn,
    descriptionEl: input.descriptionEl,
    platformPrice: input.platformPrice ?? money(12_900),
    taxRateBps: input.taxRateBps ?? 2400,
    synonyms: input.synonyms,
    adviceAvailable: input.adviceAvailable ?? true,
    active: input.active ?? true,
    suppressed: input.suppressed ?? false,
    recalled: input.recalled ?? false,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

function draft(service: CatalogManagementService, overrides: Record<string, unknown> = {}) {
  return service.createDraft({
    marketId: "sparta",
    vendorId: "vendor-a",
    locationId: "loc-a",
    vendorSku: "SKU-A",
    categoryCode: "mobile-telecom-electronics",
    title: "Apple AirPods Pro 2 USB-C",
    brand: "Apple",
    model: "AirPods Pro 2",
    mpn: "MTJV3",
    gtin: "0195949052637",
    attributes: { colour: "white" },
    supplierUnitPriceMinor: 9_500,
    stockOnHand: 10,
    safetyStock: 1,
    fulfilmentModes: ["pickup", "shipping"],
    adviceAvailable: true,
    now: 1_700_000_000_100,
    ...overrides
  } as any);
}

test("exact GTIN submission auto-links but still requires offer approval", () => {
  const service = new CatalogManagementService();
  service.registerCanonical(canonical({ id: "cv-airpods", title: "Apple AirPods Pro 2", gtin: "0195949052637" }));
  const created = draft(service);
  const submitted = service.submit({ submissionId: created.id, vendorId: "vendor-a", now: 1_700_000_000_200 });
  assert.equal(submitted.status, "linked");
  assert.equal(submitted.canonicalVariantId, "cv-airpods");
  const candidate = service.candidates({ submissionId: created.id })[0];
  assert.equal(candidate.status, "auto_linked");
  assert.equal(candidate.result.level, "exact");
  const approved = service.approveOffer({ submissionId: created.id, actorId: "admin", reason: "Catalog QA passed", now: 1_700_000_000_300 });
  assert.equal(approved.status, "approved");
});

test("variant conflict never auto-merges", () => {
  const service = new CatalogManagementService();
  service.registerCanonical(canonical({ id: "cv-airpods", title: "Apple AirPods Pro 2", categoryCode: "audio", gtin: undefined, attributes: { colour: "white", capacity: "64" } }));
  const created = draft(service, { categoryCode: "audio", gtin: undefined, attributes: { colour: "black", capacity: "64" } });
  const submitted = service.submit({ submissionId: created.id, vendorId: "vendor-a", now: 1_700_000_000_200 });
  assert.equal(submitted.status, "needs_review");
  assert.equal(submitted.canonicalVariantId, undefined);
  assert.equal(service.candidates({ submissionId: created.id }).length, 0);
});

test("manual match approval is auditable and vendor ownership is enforced", () => {
  const service = new CatalogManagementService();
  service.registerCanonical(canonical({
    id: "cv-lamp",
    title: "Brass Reading Lamp",
    categoryCode: "lighting-decor",
    gtin: undefined,
    identity: { id: "cv-lamp", title: "Brass Reading Lamp", brand: "Demo Home", model: "BR-01", condition: "new", attributes: { colour: "brass" } },
    attributes: { colour: "brass" }
  }));
  const created = draft(service, {
    categoryCode: "lighting-decor",
    title: "Brass Reading Lamp",
    brand: "Demo Home",
    model: "BR-01A",
    mpn: undefined,
    gtin: undefined,
    attributes: { colour: "brass" }
  });
  assert.throws(() => service.updateDraft({ submissionId: created.id, vendorId: "vendor-b", patch: { stockOnHand: 5 }, now: 1_700_000_000_150 }), /ownership/i);
  const submitted = service.submit({ submissionId: created.id, vendorId: "vendor-a", now: 1_700_000_000_200 });
  assert.equal(submitted.status, "needs_review");
  const candidate = service.candidates({ submissionId: created.id })[0];
  assert.ok(candidate);
  const linked = service.approveMatch({ candidateId: candidate.id, actorId: "admin", reason: "Same manufacturer model after manual review", now: 1_700_000_000_300 });
  assert.equal(linked.status, "linked");
  assert.equal(linked.canonicalVariantId, "cv-lamp");
  const event = service.events({ submissionId: created.id }).at(-1)!;
  assert.equal(event.action, "catalog.match_approved");
  assert.equal(event.actorId, "admin");
});

test("admin can create a new canonical product from unmatched source", () => {
  const service = new CatalogManagementService();
  const created = draft(service, { categoryCode: "books-stationery-office", title: "Sparta Demo A5 Notebook", brand: "Demo Paper", model: "A5", gtin: undefined, mpn: undefined, attributes: { size: "A5" } });
  const submitted = service.submit({ submissionId: created.id, vendorId: "vendor-a", now: 1_700_000_000_200 });
  assert.equal(submitted.status, "needs_review");
  const product = service.createCanonicalFromSubmission({ submissionId: created.id, actorId: "admin", platformPriceMinor: 1_490, reason: "Distinct product; no canonical match", now: 1_700_000_000_300 });
  assert.equal(product.platformPrice.minor, 1_490);
  assert.equal(product.categoryCode, "books-stationery-office");
  const linked = service.submission(created.id)!;
  assert.equal(linked.canonicalVariantId, product.id);
  assert.equal(linked.status, "linked");
});

test("CSV import preview validates rows without mutating catalog", () => {
  const csv = `vendor_sku,category_code,title,brand,model,gtin,supplier_price_minor,stock_on_hand,safety_stock,fulfilment_modes,advice_available,attributes\nA1,lighting-decor,"Brass, Reading Lamp",Demo Home,BR-01,,3700,8,1,pickup|shipping,true,colour=brass|material=metal\nA2,lighting-decor,Bad Stock,Demo Home,XX,,2000,-1,0,pickup,false,colour=black\n`;
  const preview = previewVendorProductCsv(csv);
  assert.equal(preview.totalRows, 2);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].title, "Brass, Reading Lamp");
  assert.deepEqual(preview.rows[0].attributes, { colour: "brass", material: "metal" });
  assert.equal(preview.errors.length, 1);
  assert.equal(preview.errors[0].rowNumber, 3);
});

test("catalog workflow rejects negative prices and unsupported fulfilment modes", () => {
  const service = new CatalogManagementService();
  assert.throws(() => draft(service, { supplierUnitPriceMinor: -1 }), /supplier unit price/i);
  assert.throws(() => service.createDraft({
    marketId: "sparta",
    vendorId: "vendor-a",
    locationId: "loc-a",
    categoryCode: "audio",
    title: "Invalid fulfilment",
    supplierUnitPriceMinor: 1000,
    stockOnHand: 1,
    fulfilmentModes: ["teleport" as any],
    now: 1_700_000_000_100
  }), /fulfilment mode/i);
});

test("editing identity invalidates stale auto-linked match candidates", () => {
  const service = new CatalogManagementService();
  service.registerCanonical(canonical({ id: "cv-airpods", title: "Apple AirPods Pro 2", categoryCode: "audio", gtin: "0195949123456" }));
  const created = draft(service, { categoryCode: "audio", gtin: "0195949123456" });
  const linked = service.submit({ submissionId: created.id, vendorId: "vendor-a", now: 1_700_000_000_200 });
  assert.equal(linked.status, "linked");
  const stale = service.candidates({ submissionId: created.id })[0];
  const edited = service.updateDraft({
    submissionId: created.id,
    vendorId: "vendor-a",
    patch: { identity: { gtin: "0000000000000", title: "Different Product" } },
    now: 1_700_000_000_250
  });
  assert.equal(edited.status, "draft");
  assert.equal(service.candidates({ submissionId: created.id })[0].status, "separated");
  assert.throws(() => service.approveMatch({
    candidateId: stale.id,
    actorId: "admin",
    reason: "stale approval",
    now: 1_700_000_000_300
  }), /cannot approve/i);
});
