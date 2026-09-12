import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBazaarPresentationOverlay,
  buildDeterministicGreekPresentation,
  catalogueAiEnrichmentEnabled,
  catalogueEnrichmentSourceHash,
  extractNovaVerifiedFacts,
  validateCatalogueEnrichmentDraft
} from "./catalogue-enrichment.ts";

const basePayload = {
  name: "Versace La Medusa Beige Cotton Tote Bag",
  description: "A cotton tote with structured supplier facts.",
  brand: { id: 10,name: "Versace" },
  condition: { id: 1,name: "New" },
  gender: { id: 2,name: "Women" },
  categories: [{ id: 1,name: "Bags" },{ id: 2,name: "Tote Bag" }],
  categoryDetails: [{ id: 2,name: "Tote Bag" }],
  attributes: [
    { name: "Model",option: "La Medusa" },
    { name: "Color",option: "Beige" },
    { name: "Material",option: "Cotton" },
    { name: "Season",option: "SS26" }
  ],
  defaultAttributes: [],
  shipping: { dimensions: { width: 50,height: 45,depth: 14,unit: "cm" } },
  stock: { available: true,stockQuantity: 12 },
  prices: { msrpMinor: 118490,buyingCostMinor: 78000 },
  variants: [{ externalVariantId: "1",stockQuantity: 2 }]
} as const;

test("extracts only explicit product facts and preserves official model text", () => {
  const extraction = extractNovaVerifiedFacts(basePayload);
  assert.equal(extraction.facts.brand,"Versace");
  assert.equal(extraction.facts.model,"La Medusa");
  assert.equal(extraction.facts.color,"Beige");
  assert.deepEqual(extraction.facts.materials,["Cotton"]);
  assert.equal(extraction.provenance.model?.[0],"attributes.model");
});

test("source hash ignores price, stock and variant availability changes", () => {
  const facts = extractNovaVerifiedFacts(basePayload).facts;
  const first = catalogueEnrichmentSourceHash(basePayload,facts);
  const changedCommerceOnly = {
    ...basePayload,
    stock: { available: false,stockQuantity: 0 },
    prices: { msrpMinor: 120000,buyingCostMinor: 79000 },
    variants: [{ externalVariantId: "1",stockQuantity: 0 }]
  };
  assert.equal(catalogueEnrichmentSourceHash(changedCommerceOnly,facts),first);
});

test("source hash changes when merchandising evidence changes", () => {
  const firstFacts = extractNovaVerifiedFacts(basePayload).facts;
  const changed = { ...basePayload,description: "Updated factual supplier description." };
  const changedFacts = extractNovaVerifiedFacts(changed).facts;
  assert.notEqual(catalogueEnrichmentSourceHash(changed,changedFacts),catalogueEnrichmentSourceHash(basePayload,firstFacts));
});

test("deterministic Greek fallback uses verified facts without luxury claims", () => {
  const presentation = buildDeterministicGreekPresentation(extractNovaVerifiedFacts(basePayload).facts);
  assert.equal(presentation.titleEl,"Versace La Medusa – Τσάντα Tote σε Μπεζ");
  assert.equal(presentation.specificationsEl["Συλλογή"],"SS26");
  assert.equal(presentation.specificationsEl["Μάρκα"],"Versace");
  assert.doesNotMatch(JSON.stringify(presentation),/αυθεντικ|γνήσι|χειροποίητ/i);
});

test("BAZAAR overlay is derived from explicit supplier condition", () => {
  const overlay = buildBazaarPresentationOverlay({ ...basePayload,condition: { id: 7,name: "Preloved" } });
  assert.equal(overlay.commerceChannel,"bazaar");
  assert.equal(overlay.condition,"preloved");
  assert.equal(overlay.bazaarSource,"supplier_preloved");
});

test("validator rejects unsupported numbers and authenticity claims", () => {
  const facts = extractNovaVerifiedFacts(basePayload).facts;
  const errors = validateCatalogueEnrichmentDraft(facts,{
    titleEl: "Versace La Medusa",
    shortDescriptionEl: null,
    descriptionEl: "Πιστοποιημένο αυθεντικό προϊόν, περιορισμένη έκδοση 999 τεμαχίων."
  });
  assert.ok(errors.some((error) => error === "unsupported_number:999"));
  assert.ok(errors.some((error) => error.startsWith("unsupported_claim:")));
});

test("AI enrichment is disabled unless explicitly enabled", () => {
  assert.equal(catalogueAiEnrichmentEnabled({} as NodeJS.ProcessEnv),false);
  assert.equal(catalogueAiEnrichmentEnabled({ BLS_CATALOGUE_AI_ENRICHMENT_ENABLED: "true" } as NodeJS.ProcessEnv),true);
});
