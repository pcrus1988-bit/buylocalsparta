import { readFile } from "node:fs/promises";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

type TargetLink = Readonly<{
  type: string;
  displayName: string;
  relation: "covers" | "primary_for" | "mentions" | "supersedes" | "historical_for";
}>;

type RegistrySource = Readonly<{
  sourceKey: string;
  publisher: string;
  title: string;
  sourceFamily: string;
  authorityLevel: number;
  jurisdiction: string;
  language: string;
  canonicalUrl: string;
  retrievalMethod: string;
  official?: boolean;
  legallyBinding?: boolean;
  regulatory?: boolean;
  manufacturerPrimary?: boolean;
  sourceStatus?: string;
  updateFrequency: string;
  coverage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  targets?: readonly TargetLink[];
}>;

type Registry = Readonly<{
  version: number;
  updatedAt: string;
  sources: readonly RegistrySource[];
}>;

const runtime = createPostgresRuntimeFromEnv({ applicationName: "nyxi-source-registry-sync" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`NYXI source registry sync refused to start: ${readiness.message}`);
}

const registry = JSON.parse(
  await readFile(new URL("../data/nyxi/source-registry.json", import.meta.url), "utf8")
) as Registry;
if (!Number.isSafeInteger(registry.version) || registry.version < 1 || !Array.isArray(registry.sources)) {
  await runtime.close();
  throw new Error("Invalid NYXI source registry");
}

let synced = 0;
let linked = 0;
const client = await runtime.nativePool.connect();
try {
  await client.query("BEGIN");
  for (const source of registry.sources) {
    validateSource(source);
    const result = await client.query<{ id: string }>(`
      INSERT INTO public.nyxi_sources(
        source_key,publisher,title,source_family,authority_level,jurisdiction,language,
        canonical_url,retrieval_method,official,legally_binding,regulatory,
        manufacturer_primary,source_status,update_frequency,coverage,metadata,last_verified_at
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,now()
      )
      ON CONFLICT (source_key) DO UPDATE SET
        publisher=EXCLUDED.publisher,
        title=EXCLUDED.title,
        source_family=EXCLUDED.source_family,
        authority_level=EXCLUDED.authority_level,
        jurisdiction=EXCLUDED.jurisdiction,
        language=EXCLUDED.language,
        canonical_url=EXCLUDED.canonical_url,
        retrieval_method=EXCLUDED.retrieval_method,
        official=EXCLUDED.official,
        legally_binding=EXCLUDED.legally_binding,
        regulatory=EXCLUDED.regulatory,
        manufacturer_primary=EXCLUDED.manufacturer_primary,
        source_status=EXCLUDED.source_status,
        update_frequency=EXCLUDED.update_frequency,
        coverage=EXCLUDED.coverage,
        metadata=public.nyxi_sources.metadata || EXCLUDED.metadata || jsonb_build_object(
          'registryVersion',$18::integer,
          'registryUpdatedAt',$19::text
        ),
        last_verified_at=now(),
        updated_at=now()
      RETURNING id::text
    `, [
      source.sourceKey,
      source.publisher,
      source.title,
      source.sourceFamily,
      source.authorityLevel,
      source.jurisdiction,
      source.language,
      source.canonicalUrl,
      source.retrievalMethod,
      source.official ?? true,
      source.legallyBinding ?? false,
      source.regulatory ?? false,
      source.manufacturerPrimary ?? true,
      source.sourceStatus ?? "verified",
      source.updateFrequency,
      JSON.stringify(source.coverage ?? {}),
      JSON.stringify({
        ...(source.metadata ?? {}),
        registryVersion: registry.version,
        registryUpdatedAt: registry.updatedAt
      }),
      registry.version,
      registry.updatedAt
    ]);
    const sourceId = result.rows[0]?.id;
    if (!sourceId) throw new Error(`Source upsert returned no id for ${source.sourceKey}`);

    await client.query(`
      INSERT INTO public.nyxi_source_crawl_state(source_id,next_check_at)
      VALUES($1,now())
      ON CONFLICT (source_id) DO NOTHING
    `, [sourceId]);

    for (const target of source.targets ?? []) {
      const targetKey = researchTargetKey(target.type, target.displayName);
      let targetResult = await client.query<{ id: string }>(`
        SELECT id::text
        FROM public.nyxi_research_targets
        WHERE target_type=$1 AND target_key=$2
        LIMIT 1
      `, [target.type, targetKey]);

      if (!targetResult.rows[0]?.id && target.type === "brand") {
        targetResult = await client.query<{ id: string }>(`
          INSERT INTO public.nyxi_research_targets(
            target_type,target_key,display_name,priority,research_status,
            required_source_families,metadata
          )
          VALUES(
            'brand',$1,$2,50,'queued',
            ARRAY[
              'manufacturer_root',
              'manufacturer_product',
              'manufacturer_sds',
              'manufacturer_catalogue',
              'historical_archive'
            ],
            jsonb_build_object(
              'phase',0,
              'autoCreatedBy','nyxi-source-registry',
              'registryVersion',$3::integer,
              'objective','Discover primary product, ingredient, SDS, catalogue, colour-chart, reformulation and archive sources before classification.'
            )
          )
          ON CONFLICT (target_type,target_key) DO UPDATE SET
            display_name=EXCLUDED.display_name,
            metadata=public.nyxi_research_targets.metadata || EXCLUDED.metadata,
            updated_at=now()
          RETURNING id::text
        `, [targetKey, target.displayName, registry.version]);
      }

      const targetId = targetResult.rows[0]?.id;
      if (!targetId) throw new Error(`Missing NYXI research target ${target.type} / ${target.displayName} (${targetKey})`);
      await client.query(`
        INSERT INTO public.nyxi_source_target_links(source_id,target_id,relation,metadata)
        VALUES($1,$2,$3,jsonb_build_object('registryVersion',$4::integer))
        ON CONFLICT (source_id,target_id,relation) DO UPDATE
        SET metadata=public.nyxi_source_target_links.metadata || EXCLUDED.metadata
      `, [sourceId, targetId, target.relation, registry.version]);
      linked += 1;
    }
    synced += 1;
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await runtime.close();
}

console.log(JSON.stringify({
  level: "info",
  event: "nyxi_source.registry_synced",
  registryVersion: registry.version,
  registryUpdatedAt: registry.updatedAt,
  synced,
  linked
}));

function researchTargetKey(type: string, displayName: string): string {
  if (type !== "brand") {
    const direct = displayName.trim();
    const jurisdictionKeys: Readonly<Record<string,string>> = {
      "European Union": "EU",
      "Great Britain": "GB",
      "United States": "US",
      "Canada": "CA",
      "Australia": "AU",
      "Japan": "JP",
      "China": "CN"
    };
    return jurisdictionKeys[direct] ?? direct.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  }
  const key = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!key) throw new Error(`Cannot derive NYXI brand research key from ${displayName}`);
  return key;
}

function validateSource(source: RegistrySource): void {
  if (!/^[a-z0-9][a-z0-9_-]{2,127}$/.test(source.sourceKey)) throw new Error(`Invalid source key ${source.sourceKey}`);
  if (!source.publisher.trim() || !source.title.trim()) throw new Error(`Source ${source.sourceKey} requires publisher/title`);
  if (!Number.isSafeInteger(source.authorityLevel) || source.authorityLevel < 1 || source.authorityLevel > 5) throw new Error(`Invalid authority for ${source.sourceKey}`);
  const url = new URL(source.canonicalUrl);
  if (url.protocol !== "https:") throw new Error(`Source ${source.sourceKey} must use HTTPS`);
}
