import { randomUUID } from "node:crypto";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "catalog-source-attribute-mapping-smoke" });
try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  assert(readiness.ok, `schema ${EXPECTED_SCHEMA_VERSION} is required: ${readiness.message}`);

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const marketResult = await runtime.nativePool.query<{ id: string }>("SELECT id::text FROM public.markets WHERE code='sparta' LIMIT 1");
  const marketId = required(marketResult.rows[0]?.id, "Sparta market");

  const reviewer = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.users(email,password_hash,status,email_verified_at)
    VALUES($1,'ci-only-not-a-runtime-password','active',now())
    RETURNING id::text
  `, [`ci-attribute-reviewer-${suffix}@example.test`]);
  const reviewerId = required(reviewer.rows[0]?.id, "reviewer");

  const source = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_sources(market_id,code,name,source_kind,active,metadata)
    VALUES($1::uuid,$2,$3,'data_provider',true,'{}'::jsonb)
    RETURNING id::text
  `, [marketId, `ci_attr_${suffix}`, `CI Attribute Source ${suffix}`]);
  const sourceId = required(source.rows[0]?.id, "catalog source");

  const snapshot = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,metadata)
    VALUES($1::uuid,$2,'ci-v1',now(),'{}'::jsonb)
    RETURNING id::text
  `, [sourceId, `ci-attribute-${suffix}`]);
  const snapshotId = required(snapshot.rows[0]?.id, "catalog snapshot");

  const productType = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.product_types(code,status,product_mode,variant_strategy)
    VALUES($1,'active','standard','matrix')
    RETURNING id::text
  `, [`ci_attr_type_${suffix}`]);
  const productTypeId = required(productType.rows[0]?.id, "product type");

  const attribute = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.attribute_definitions(code,data_type,unit,value_mode,active,filterable,variant_identity,values)
    VALUES($1,'number','mm','free',true,true,false,'[]'::jsonb)
    RETURNING id::text
  `, [`ci_length_${suffix}`]);
  const attributeId = required(attribute.rows[0]?.id, "attribute");

  await runtime.nativePool.query(`
    INSERT INTO public.product_type_attributes(
      product_type_id,attribute_id,requirement_level,value_level,
      filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order
    ) VALUES($1::uuid,$2::uuid,'optional','family',true,true,true,true,false,false,10)
  `, [productTypeId, attributeId]);

  const existingA = await insertSourceProduct("existing-a", "provider-cat-A");
  const existingB = await insertSourceProduct("existing-b", "provider-cat-B");
  await insertObservation(existingA, "length", "mm", "12.5");
  await insertObservation(existingB, "length", "mm", "77");

  const rule = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_source_attribute_mapping_rules(
      source_id,source_attribute_key,scope_kind,scope_key,
      product_type_id,attribute_id,status,mapping_method,reason,reviewed_by,reviewed_at,metadata
    ) VALUES(
      $1::uuid,'length','source_category','provider-cat-A',
      $2::uuid,$3::uuid,'approved','admin_exact_context','CI reviewed mapping',$4::uuid,now(),'{}'::jsonb
    )
    RETURNING id::text
  `, [sourceId, productTypeId, attributeId, reviewerId]);
  const ruleId = required(rule.rows[0]?.id, "mapping rule");

  const backfill = await runtime.nativePool.query<{ mapping_status: string; row_count: string }>(`
    SELECT mapping_status,row_count::text
    FROM bls_private.backfill_catalog_source_attribute_mapping_rule($1::uuid,$2::uuid)
  `, [ruleId, reviewerId]);
  assert(backfill.rows.some((row) => row.mapping_status === "mapped" && Number(row.row_count) === 1), "backfill must map exactly one existing observation in provider-cat-A");

  const existingStates = await runtime.nativePool.query<{ product_key: string; mapping_status: string; attribute_id: string | null; raw_value: unknown }>(`
    SELECT sp.source_product_key AS product_key,a.mapping_status,a.attribute_id::text,a.raw_value
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    WHERE sp.id IN ($1::uuid,$2::uuid)
    ORDER BY sp.source_product_key
  `, [existingA, existingB]);
  const stateA = existingStates.rows.find((row) => row.product_key.endsWith("existing-a"));
  const stateB = existingStates.rows.find((row) => row.product_key.endsWith("existing-b"));
  assert(stateA?.mapping_status === "mapped" && stateA.attribute_id === attributeId, "approved context must backfill the target attribute");
  assert(stateB?.mapping_status === "unmapped" && stateB.attribute_id === null, "same source key in a different provider category must remain unmapped");
  assert(JSON.stringify(stateA?.raw_value) === JSON.stringify({ value: { value: "12.5" } }), "backfill must preserve raw source evidence byte-for-structure");

  const futureGood = await insertSourceProduct("future-good", "provider-cat-A");
  const futureWrongUnit = await insertSourceProduct("future-wrong-unit", "provider-cat-A");
  const futureBadValue = await insertSourceProduct("future-bad-value", "provider-cat-A");
  const futureOtherContext = await insertSourceProduct("future-other-context", "provider-cat-B");
  await insertObservation(futureGood, "length", "mm", "15");
  await insertObservation(futureWrongUnit, "length", "cm", "15");
  await insertObservation(futureBadValue, "length", "mm", "fifteen");
  await insertObservation(futureOtherContext, "length", "mm", "15");

  const futureStates = await runtime.nativePool.query<{ product_key: string; mapping_status: string; attribute_id: string | null }>(`
    SELECT sp.source_product_key AS product_key,a.mapping_status,a.attribute_id::text
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    WHERE sp.id IN ($1::uuid,$2::uuid,$3::uuid,$4::uuid)
    ORDER BY sp.source_product_key
  `, [futureGood, futureWrongUnit, futureBadValue, futureOtherContext]);
  const bySuffix = (name: string) => futureStates.rows.find((row) => row.product_key.endsWith(name));
  assert(bySuffix("future-good")?.mapping_status === "mapped", "compatible future observation must auto-map");
  assert(bySuffix("future-good")?.attribute_id === attributeId, "compatible future observation must receive canonical attribute id");
  assert(bySuffix("future-wrong-unit")?.mapping_status === "review_required", "unit mismatch must require review rather than conversion guessing");
  assert(bySuffix("future-wrong-unit")?.attribute_id === attributeId, "unit-review observation must retain the approved semantic attribute link");
  assert(bySuffix("future-bad-value")?.mapping_status === "review_required", "non-numeric value for number attribute must require review");
  assert(bySuffix("future-other-context")?.mapping_status === "unmapped", "approved rule must not leak into another provider category");
  assert(bySuffix("future-other-context")?.attribute_id === null, "cross-context observation must not receive an attribute id");

  const publicLinks = await runtime.nativePool.query<{ count: string }>(`
    SELECT count(*)::text
    FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products sp ON sp.id=l.source_product_id
    WHERE sp.source_id=$1::uuid
  `, [sourceId]);
  assert(Number(publicLinks.rows[0]?.count ?? 0) === 0, "attribute mapping must not create canonical product links");

  const privileges = await runtime.nativePool.query<{ anon_denied: boolean; authenticated_denied: boolean; service_denied: boolean; rls: boolean }>(`
    SELECT
      NOT has_table_privilege('anon','public.catalog_source_attribute_mapping_rules','SELECT') AS anon_denied,
      NOT has_table_privilege('authenticated','public.catalog_source_attribute_mapping_rules','SELECT') AS authenticated_denied,
      NOT has_table_privilege('service_role','public.catalog_source_attribute_mapping_rules','SELECT') AS service_denied,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_source_attribute_mapping_rules'::regclass) AS rls
  `);
  const privilege = privileges.rows[0];
  assert(privilege?.anon_denied && privilege.authenticated_denied && privilege.service_denied && privilege.rls, "mapping rules must remain platform-runtime-only with RLS");

  console.log(JSON.stringify({
    ok: true,
    schema: readiness.appliedSchemaVersion,
    sourceId,
    productTypeId,
    attributeId,
    ruleId,
    backfill: backfill.rows,
    futureStates: futureStates.rows
  }));

  async function insertSourceProduct(name: string, categoryId: string): Promise<string> {
    const result = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.catalog_source_products(
        snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
      ) VALUES(
        $1::uuid,$2::uuid,$3,$4,$5::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb
      )
      RETURNING id::text
    `, [snapshotId, sourceId, `ci-${suffix}-${name}`, `CI ${name}`, JSON.stringify({ categoryId })]);
    return required(result.rows[0]?.id, `source product ${name}`);
  }

  async function insertObservation(sourceProductId: string, key: string, unit: string, scalar: string): Promise<void> {
    await runtime.nativePool.query(`
      INSERT INTO public.catalog_source_attribute_observations(
        source_product_id,source_attribute_key,position,raw_value,normalized_value,source_unit,mapping_status,metadata
      ) VALUES($1::uuid,$2,0,$3::jsonb,$3::jsonb,$4,'unmapped','{}'::jsonb)
    `, [sourceProductId, key, JSON.stringify({ value: { value: scalar } }), unit]);
  }
} finally {
  await runtime.close();
}

function required(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
