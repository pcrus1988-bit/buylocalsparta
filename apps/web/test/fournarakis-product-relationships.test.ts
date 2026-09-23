import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const suitabilityUrl = new URL("../src/lib/public-product-suitability.ts", import.meta.url);
const guardUrl = new URL("../src/lib/product-presentation-guards.ts", import.meta.url);
const migrationUrl = new URL("../../../supabase/migrations/20260923133938_fournarakis_relationship_claims.sql", import.meta.url);

test("Fournarakis explicit relationships stay semantically separated", async () => {
  const [suitability, guards, migration] = await Promise.all([
    readFile(suitabilityUrl, "utf8"),
    readFile(guardUrl, "utf8"),
    readFile(migrationUrl, "utf8")
  ]);

  assert.match(migration, /'fits'/);
  assert.match(migration, /'works_with'/);
  assert.match(migration, /ΚΑΤΑΛΛΗΛΟ ΓΙΑ/);
  assert.match(migration, /ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ/);
  assert.match(migration, /exact_supplier_code/);
  assert.match(migration, /unresolved_reference/);

  assert.match(suitability, /relationship_type IN \('compatible_with','fits','uses_platform','works_with'\)/);
  assert.match(suitability, /claim\.relationship_type === "works_with"/);
  assert.match(suitability, /title: "Συνδυάζεται με"/);
  assert.match(guards, /"συνδυαζεται_με"/);
});
