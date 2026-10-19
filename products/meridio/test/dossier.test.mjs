import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ASSET_WORLDS, EVIDENCE_CATEGORIES, DOSSIER_VERSION, validateDossierFields,
  createAssetDossier, parseDossier, dossierReadiness
} from "../public/intake/dossier.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "..");
const UUID = "62720dd0-8ba2-40ed-b75c-a0e32987b432";
const fields = {
  assetName: "Registered asset",
  world: "equipment",
  country: "gr",
  location: "Region, Greece",
  legalEntity: "Registered legal controller",
  intendedUse: "Workshop equipment used for a lawful business purpose.",
  custodyNotes: "Internal information\nin two lines",
  evidence: ["control_document", "insurance"]
};

test("the real intake contract recognises ten asset classes and required evidence categories", () => {
  assert.equal(ASSET_WORLDS.length, 10);
  assert.equal(EVIDENCE_CATEGORIES.length, 6);
  assert.equal(DOSSIER_VERSION, "meridio-asset-dossier/v1");
});

test("accepts real user-entered information and normalizes country", () => {
  const data = validateDossierFields(fields);
  assert.equal(data.country, "GR");
  assert.equal(data.custodyNotes, "Internal information\nin two lines");
  assert.equal(data.assetName, "Registered asset");
});

test("required fields and category validation reject invalid intake", () => {
  for (const key of ["assetName", "location", "legalEntity", "intendedUse", "world", "country"]) {
    assert.throws(() => validateDossierFields({ ...fields, [key]: "" }));
  }
  assert.throws(() => validateDossierFields({ ...fields, world: "unknown" }), /recognized asset category/);
  assert.throws(() => validateDossierFields({ ...fields, country: "Greece" }), /Country/);
  assert.throws(() => validateDossierFields({ ...fields, assetName: "X".repeat(150) }), /Asset name/);
});

test("allows normal multiline text but rejects dangerous control characters", () => {
  assert.equal(validateDossierFields({ ...fields, intendedUse: "line 1\nline 2" }).intendedUse, "line 1\nline 2");
  assert.throws(() => validateDossierFields({ ...fields, intendedUse: "x\u0000y" }), /control characters/);
});

test("document checklist is strictly whitelisted and duplicate-free", () => {
  assert.throws(() => validateDossierFields({ ...fields, evidence: ["title_deed"] }), /document checklist/);
  assert.throws(() => validateDossierFields({ ...fields, evidence: ["insurance", "insurance"] }), /document checklist/);
  assert.throws(() => validateDossierFields({ ...fields, evidence: "insurance" }), /document checklist/);
});

test("creates a genuine portable draft record and imports it without loss", () => {
  const doc = createAssetDossier(fields, { id: UUID, generatedAt: "2026-10-19T17:00:00.000Z" });
  assert.equal(doc.state, "draft");
  assert.equal(doc.schema, DOSSIER_VERSION);
  assert.equal(doc.id, UUID);
  assert.equal(doc.country, "GR");
  assert.deepEqual(parseDossier(JSON.stringify(doc)), doc);
});

test("rejects fabricated record IDs, broken timestamps and unsupported revisions", () => {
  assert.throws(() => createAssetDossier(fields, { id: "asset-1", generatedAt: new Date() }), /UUID/);
  assert.throws(() => createAssetDossier(fields, { id: UUID, generatedAt: "yesterday" }), /timestamp/);
  const valid = createAssetDossier(fields, { id: UUID, generatedAt: new Date() });
  assert.throws(() => parseDossier(JSON.stringify({ ...valid, schema: "unknown" })), /Unsupported/);
  assert.throws(() => parseDossier(JSON.stringify({ ...valid, state: "approved" })), /Unsupported/);
  assert.throws(() => parseDossier("not json"), /JSON/);
  assert.throws(() => parseDossier("x".repeat(100001)), /small JSON/);
});

test("no self-declared evidence category is treated as verified", () => {
  const readiness = dossierReadiness(fields);
  assert.equal(readiness.evidenceVerified, false);
  assert.equal(readiness.eligibleForPublication, false);
  assert.equal(readiness.missingCategories.length, 4);
});

test("withdrawn simulations and fixture modules are absent from deployable public tree", () => {
  for (const path of [
    "public/app.js",
    "public/workspace/index.html",
    "public/workspace/workspace.mjs",
    "public/review-lab/index.html",
    "public/review-lab/review-lab.mjs",
    "public/platform/examples.mjs",
    "public/platform/model.mjs",
    "public/platform/review.mjs"
  ]) {
    assert.equal(existsSync(join(project, path)), false, path + " must be removed");
  }
});

test("home and intake expose real data workflows without mock listings", () => {
  const home = readFileSync(join(project, "public/index.html"), "utf8");
  const intake = readFileSync(join(project, "public/intake/index.html"), "utf8");
  const logic = readFileSync(join(project, "public/intake/intake.mjs"), "utf8");
  assert.match(home, /href="\/intake\/"/);
  assert.match(intake, /name="assetName"/);
  assert.match(intake, /No fictitious assets/);
  assert.match(logic, /URL\.createObjectURL/);
  assert.match(logic, /parseDossier/);
  assert.doesNotMatch(logic, /\bfetch\s*\(/);
  assert.doesNotMatch(logic, /localStorage|sessionStorage|indexedDB/);
});

test("withdrawn paths redirect and financial/back-end capabilities remain disabled", () => {
  const config = JSON.parse(readFileSync(join(project, "vercel.json"), "utf8"));
  for (const path of ["/workspace", "/review-lab"]) {
    assert.ok(config.redirects.some((redirect) => redirect.source === path && redirect.destination === "/intake"));
  }
  const health = JSON.parse(readFileSync(join(project, "public/health.json"), "utf8"));
  assert.equal(health.capabilities.server_asset_storage, "not_provisioned");
  assert.equal(health.capabilities.authenticated_accounts, "not_provisioned");
  assert.equal(health.capabilities.transactions, "disabled");
  assert.equal(health.capabilities.token_issuance, "disabled");
});
