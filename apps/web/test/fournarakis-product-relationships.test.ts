import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const suitabilityUrl = new URL("../src/lib/public-product-suitability.ts", import.meta.url);
const guardUrl = new URL("../src/lib/product-presentation-guards.ts", import.meta.url);
const detailUrl = new URL("../src/lib/public-product-detail.ts", import.meta.url);
const variantsUrl = new URL("../src/lib/public-product-variants.ts", import.meta.url);
const extractionUrl = new URL("../../../packages/core/src/ingestion/fournarakis-extraction.ts", import.meta.url);
const relationshipMigrationUrl = new URL("../../../supabase/migrations/20260923133938_fournarakis_relationship_claims.sql", import.meta.url);
const qualityMigrationUrl = new URL("../../../supabase/migrations/20260923143010_fournarakis_prepublication_content_quality.sql", import.meta.url);

test("Fournarakis explicit relationships stay semantically separated", async () => {
  const [suitability, guards, relationshipMigration, qualityMigration] = await Promise.all([
    readFile(suitabilityUrl, "utf8"),
    readFile(guardUrl, "utf8"),
    readFile(relationshipMigrationUrl, "utf8"),
    readFile(qualityMigrationUrl, "utf8")
  ]);

  assert.match(relationshipMigration, /'fits'/);
  assert.match(relationshipMigration, /'works_with'/);
  assert.match(relationshipMigration, /ΚΑΤΑΛΛΗΛΟ ΓΙΑ/);
  assert.match(relationshipMigration, /ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ/);
  assert.match(relationshipMigration, /exact_supplier_code/);
  assert.match(relationshipMigration, /unresolved_reference/);

  assert.match(qualityMigration, /ΤΑΙΡΙΑΖΕΙ ΣΕ/);
  assert.match(qualityMigration, /target_canonical_variant_id/);
  assert.match(qualityMigration, /review_status='superseded'/);

  assert.match(suitability, /relationship_type IN \('compatible_with','fits','uses_platform','works_with'\)/);
  assert.match(suitability, /claim\.relationship_type === "works_with"/);
  assert.match(suitability, /title: "Συνδυάζεται με"/);
  assert.match(guards, /"συνδυαζεται_με"/);
  assert.match(guards, /"ταιριαζει_σε"/);
});

test("Fournarakis is prepared as clean families before first vendor assignment", async () => {
  const [qualityMigration, detail, variants, extraction] = await Promise.all([
    readFile(qualityMigrationUrl, "utf8"),
    readFile(detailUrl, "utf8"),
    readFile(variantsUrl, "utf8"),
    readFile(extractionUrl, "utf8")
  ]);

  assert.match(qualityMigration, /fournarakis_normalize_title/);
  assert.match(qualityMigration, /SET family_id=t\.target_family_id/);
  assert.match(qualityMigration, /Fournarakis family code/);
  assert.match(qualityMigration, /clean_specifications/);
  assert.match(qualityMigration, /Σημείωση συσκευασίας/);
  assert.match(qualityMigration, /lower\(source_brand\) NOT IN \('miscellaneous','unbranded'\)/);

  assert.match(detail, /"Fournarakis family code"/);
  assert.match(detail, /"Fournarakis tags"/);
  assert.match(detail, /"ΤΜΧ \/KOYTI": "Τεμάχια \/ κιβώτιο"/);
  assert.match(detail, /const spacedUnit = raw\.replace/);

  assert.match(variants, /safeGenericVariantDimension/);
  assert.match(variants, /fallbackTitleAttributes/);
  assert.match(variants, /"βαρος", label: "Βάρος"/);

  assert.match(extraction, /τμχ\|tmx/);
  assert.match(extraction, /καταλληλο\|ταιριαζει/);
});
