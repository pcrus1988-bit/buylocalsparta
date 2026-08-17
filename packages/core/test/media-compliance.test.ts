import test from "node:test";
import assert from "node:assert/strict";
import { CatalogManagementService, InMemoryObjectStorage, ProductMediaService, ProductTrustService, money } from "../src/index.ts";

function setup() {
  const catalog = new CatalogManagementService();
  catalog.registerCanonical({
    id: "cv-1", marketId: "sparta", categoryCode: "technology", identity: { id: "cv-1", title: "Demo Device", condition: "new", attributes: {} },
    titleEl: "Demo Device", platformPrice: money(10_000), taxRateBps: 2400, active: true, suppressed: false, recalled: false, createdAt: 1, updatedAt: 1
  });
  const storage = new InMemoryObjectStorage();
  const media = new ProductMediaService(storage);
  const trust = new ProductTrustService({ catalog, media });
  return { catalog, storage, media, trust };
}

test("product media requires rights metadata, clean scan and moderation before public visibility", () => {
  const { media } = setup();
  assert.throws(() => media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "image", originalFilename: "photo.jpg", rightsOwner: "Vendor A", now: 100 }), /alt text/);
  const intent = media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "image", originalFilename: "photo.jpg", altText: "Demo device on a counter", rightsOwner: "Vendor A", now: 100 });
  const asset = media.uploadAndFinalize({ intentToken: intent.token, contentType: "image/jpeg", bytes: new TextEncoder().encode("fake-jpeg-development-bytes"), now: 110 });
  assert.equal(media.publicAssets("cv-1").length, 0);
  assert.throws(() => media.review({ assetId: asset.id, actorId: "admin", rightsStatus: "approved", moderationStatus: "approved", now: 120 }), /clean malware scan/);
  media.recordScan({ assetId: asset.id, result: "clean", now: 130 });
  media.review({ assetId: asset.id, actorId: "admin", rightsStatus: "approved", moderationStatus: "approved", now: 140 });
  assert.equal(media.publicAssets("cv-1").length, 1);
  assert.equal(media.objectBytes(asset.id)?.byteLength, "fake-jpeg-development-bytes".length);
});

test("infected uploads are rejected and never public", () => {
  const { media } = setup();
  const intent = media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "document", originalFilename: "manual.pdf", rightsOwner: "Manufacturer", now: 100 });
  const asset = media.uploadAndFinalize({ intentToken: intent.token, contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF fake"), now: 110 });
  const scanned = media.recordScan({ assetId: asset.id, result: "infected", reason: "test malware signature", now: 120 });
  assert.equal(scanned.moderationStatus, "rejected");
  assert.equal(media.publicAssets("cv-1").length, 0);
});

test("compliance documents are verified separately and expiry is explicit", () => {
  const { media, trust } = setup();
  const intent = media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "document", originalFilename: "declaration.pdf", rightsOwner: "Manufacturer", now: 100 });
  const asset = media.uploadAndFinalize({ intentToken: intent.token, contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF declaration"), now: 110 });
  media.recordScan({ assetId: asset.id, result: "clean", now: 120 });
  media.review({ assetId: asset.id, actorId: "catalog-qa", rightsStatus: "approved", moderationStatus: "approved", now: 130 });
  const document = trust.submitComplianceDocument({ canonicalVariantId: "cv-1", vendorId: "vendor-a", type: "EU declaration of conformity", issuer: "Demo Manufacturer", identifier: "DOC-123", mediaAssetId: asset.id, validFrom: 100, validTo: 500, now: 140 });
  const verified = trust.reviewComplianceDocument({ documentId: document.id, actorId: "compliance-admin", decision: "verified", now: 150 });
  assert.equal(verified.status, "verified");
  assert.equal(trust.refreshExpiry(501), 1);
  assert.equal(trust.documents({ canonicalVariantId: "cv-1" })[0].status, "expired");
});


test("vendor-bound upload intent cannot be consumed by another vendor", () => {
  const { media } = setup();
  const intent = media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "image", originalFilename: "photo.jpg", altText: "Demo device", rightsOwner: "Vendor A", now: 100 });
  assert.throws(() => media.uploadAndFinalize({ intentToken: intent.token, contentType: "image/jpeg", bytes: new TextEncoder().encode("attempt"), expectedVendorId: "vendor-b", now: 110 }), /another vendor/);
  const asset = media.uploadAndFinalize({ intentToken: intent.token, contentType: "image/jpeg", bytes: new TextEncoder().encode("owner upload"), expectedVendorId: "vendor-a", now: 120 });
  assert.equal(asset.vendorId, "vendor-a");
});

test("linked compliance evidence cannot be verified before its media passes trust gates", () => {
  const { media, trust } = setup();
  const intent = media.createUploadIntent({ canonicalVariantId: "cv-1", vendorId: "vendor-a", kind: "document", originalFilename: "safety.pdf", rightsOwner: "Manufacturer", now: 100 });
  const asset = media.uploadAndFinalize({ intentToken: intent.token, contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF safety"), now: 110 });
  const document = trust.submitComplianceDocument({ canonicalVariantId: "cv-1", vendorId: "vendor-a", type: "Safety declaration", mediaAssetId: asset.id, now: 120 });
  assert.throws(() => trust.reviewComplianceDocument({ documentId: document.id, actorId: "compliance-admin", decision: "verified", now: 130 }), /must pass scan/);
  media.recordScan({ assetId: asset.id, result: "clean", now: 140 });
  media.review({ assetId: asset.id, actorId: "catalog-qa", rightsStatus: "approved", moderationStatus: "approved", now: 150 });
  assert.equal(trust.reviewComplianceDocument({ documentId: document.id, actorId: "compliance-admin", decision: "verified", now: 160 }).status, "verified");
});

test("recall suppresses a canonical product and restoration requires resolved blocking notices", () => {
  const { catalog, trust } = setup();
  const notice = trust.openNotice({ canonicalVariantId: "cv-1", type: "recall", severity: "critical", details: "Battery safety recall", actorId: "compliance-admin", now: 200 });
  assert.equal(catalog.canonical("cv-1")?.suppressed, true);
  assert.equal(catalog.canonical("cv-1")?.recalled, true);
  assert.throws(() => trust.restoreProduct({ canonicalVariantId: "cv-1", actorId: "compliance-admin", reason: "trying too early", now: 210 }), /open blocking notice/);
  trust.resolveNotice({ noticeId: notice.id, actorId: "compliance-admin", resolution: "Affected batches removed and authority closure recorded", now: 220 });
  trust.restoreProduct({ canonicalVariantId: "cv-1", actorId: "compliance-admin", reason: "Recall remediation verified", now: 230 });
  assert.equal(catalog.canonical("cv-1")?.suppressed, false);
  assert.equal(catalog.canonical("cv-1")?.recalled, false);
});
