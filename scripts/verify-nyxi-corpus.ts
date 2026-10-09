import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../data/nyxi/source-registry.json", import.meta.url), "utf8")
) as {
  version?: number;
  updatedAt?: string;
  sources?: Array<{
    sourceKey?: string;
    sourceFamily?: string;
    canonicalUrl?: string;
    retrievalMethod?: string;
    official?: boolean;
    manufacturerPrimary?: boolean;
    targets?: Array<{ type?: string; displayName?: string; relation?: string }>;
  }>;
};
const locations = JSON.parse(
  await readFile(new URL("../data/nyxi/workbench-locations.json", import.meta.url), "utf8")
) as Record<string, unknown>;
const migration435 = await readFile(new URL("../db/migrations/0435_nyxi_corpus_foundation.sql", import.meta.url), "utf8");
const migration436 = await readFile(new URL("../db/migrations/0436_nyxi_corpus_manifest_workbench.sql", import.meta.url), "utf8");
const runtime = await readFile(new URL("../packages/postgres-runtime/src/index.ts", import.meta.url), "utf8");
const collector = await readFile(new URL("../workers/nyxi-source-collector-worker.ts", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/nyxi-source-collector.yml", import.meta.url), "utf8");
const sync = await readFile(new URL("./nyxi-source-registry-sync.ts", import.meta.url), "utf8");

const errors: string[] = [];
const sources = Array.isArray(registry.sources) ? registry.sources : [];
if (registry.version !== 25) errors.push(`registry version is ${registry.version}, expected 25`);
if (registry.updatedAt !== "2026-10-07") errors.push(`registry updatedAt is ${registry.updatedAt}, expected 2026-10-07`);
if (sources.length !== 282) errors.push(`registry contains ${sources.length} sources, expected 282`);

const keys = new Set<string>();
const urls = new Set<string>();
for (const source of sources) {
  if (!source.sourceKey || keys.has(source.sourceKey)) errors.push(`missing/duplicate sourceKey ${source.sourceKey ?? "<missing>"}`);
  else keys.add(source.sourceKey);
  if (!source.canonicalUrl || urls.has(source.canonicalUrl)) errors.push(`missing/duplicate canonicalUrl ${source.canonicalUrl ?? "<missing>"}`);
  else urls.add(source.canonicalUrl);
  if (typeof source.official !== "boolean") errors.push(`${source.sourceKey} has no explicit official flag`);
  if (typeof source.manufacturerPrimary !== "boolean") errors.push(`${source.sourceKey} has no explicit manufacturerPrimary flag`);
}
if (!migration435.includes("CREATE TABLE public.nyxi_sources")) errors.push("0435 does not create nyxi_sources");
if (!migration435.includes("CREATE TABLE public.nyxi_source_snapshots")) errors.push("0435 does not create immutable source snapshots");
if (!migration435.includes("CREATE TABLE public.nyxi_source_checks")) errors.push("0435 does not create source check ledger");
if (/INSERT\s+INTO\s+public\.nyxi_sources/i.test(migration435)) errors.push("0435 must not seed source definitions; registry JSON is authoritative");
if (!migration436.includes("WITH (security_invoker = true)")) errors.push("0436 workbench views must be security-invoker");
for (const view of ["nyxi_corpus_manifest","nyxi_workbench_sources","nyxi_workbench_snapshots","nyxi_workbench_review_queue"]) {
  if (!migration436.includes(`public.${view}`)) errors.push(`0436 missing ${view}`);
}
if (!runtime.includes("export const EXPECTED_SCHEMA_VERSION = 436;")) errors.push("runtime schema gate is not 436");
if (!collector.includes("private/nyxi/source-archive/")) errors.push("collector missing verified source archive prefix");
if (!collector.includes("private/nyxi/candidate-archive/")) errors.push("collector missing candidate archive prefix");
if (!collector.includes("interpretationPerformed: false")) errors.push("collector must explicitly record no semantic interpretation");
if (!collector.includes("ifNoneMatch: lease.etag")) errors.push("collector is not using ETag conditional retrieval");
if (!collector.includes("ifModifiedSince: lease.lastModified")) errors.push("collector is not using Last-Modified conditional retrieval");
if (!workflow.includes("BLS_OBJECT_STORAGE_BUCKET: nyxi-evidence")) errors.push("collector workflow is not pinned to nyxi-evidence");
if (!workflow.includes("vars.NYXI_COLLECTION_ENABLED == 'true'")) errors.push("scheduled collection lacks explicit enable gate");
if (!sync.includes("requiredSourceFamiliesForTarget")) errors.push("registry sync is not self-sufficient for research target creation");

const storage = (locations as { storage?: { bucket?: string; public?: boolean } }).storage;
if (storage?.bucket !== "nyxi-evidence" || storage.public !== false) errors.push("workbench locations do not declare the private nyxi-evidence bucket");
const folders = (locations as { googleDrive?: { folders?: Record<string, { id?: string }> } }).googleDrive?.folders ?? {};
for (const key of ["sourceAtlas","regulations","brands","sdsTds","catalogues","shadeCharts","recalls","extractionReports","reviewQueue"]) {
  if (!folders[key]?.id) errors.push(`Google Drive workbench folder ${key} is missing`);
}

if (errors.length) {
  console.error(["NYXI corpus verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}

const targetLinks = sources.reduce((sum, source) => sum + (source.targets?.length ?? 0), 0);
console.log(JSON.stringify({
  ok: true,
  registryVersion: registry.version,
  sources: sources.length,
  uniqueSourceKeys: keys.size,
  uniqueCanonicalUrls: urls.size,
  targetLinks,
  schema: 436,
  evidenceBucket: storage?.bucket,
  driveFolders: Object.keys(folders).length
}));
