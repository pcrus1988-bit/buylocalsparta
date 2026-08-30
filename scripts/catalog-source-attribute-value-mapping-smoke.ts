import { randomUUID } from "node:crypto";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "catalog-source-attribute-value-mapping-smoke" });
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
  `, [`ci-value-reviewer-${suffix}@example.test`]);
  const reviewerId = required(reviewer.rows[0]?.id, "reviewer");

  const source = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_sources(market_id,code,name,source_kind,active,metadata)
    VALUES($1::uuid,$2,$3,'supplier',true,'{}'::jsonb)
    RETURNING id::text
  `, [marketId, `ci_value_${suffix}`, `CI Value Source ${suffix}`]);
  const sourceId = required(source.rows[0]?.id, "catalog source");

  const snapshot = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,metadata)
    VALUES($1::uuid,$2,'ci-v1',now(),'{}'::jsonb)
    RETURNING id::text
  `, [sourceId, `ci-value-${suffix}`]);
  const snapshotId = required(snapshot.rows[0]?.id, "catalog snapshot");

  const productType = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.product_types(code,status,product_mode,variant_strategy)
    VALUES($1,'active','standard','matrix')
    RETURNING id::text
  `, [`ci_enum_type_${suffix}`]);
  const productTypeId = required(productType.rows[0]?.id, "product type");

  const attribute = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.attribute_definitions(code,data_type,unit,value_mode,active,filterable,variant_identity,values)
    VALUES($1,'enum',NULL,'controlled',true,true,false,'[]'::jsonb)
    RETURNING id::text
  `, [`ci_colour_${suffix}`]);
  const attributeId = required(attribute.rows[0]?.id, "enum attribute");

  const black = await insertAttributeValue("black", "Μαύρο", 10);
  const white = await insertAttributeValue("white", "Λευκό", 20);

  await runtime.nativePool.query(`
    INSERT INTO public.product_type_attributes(
      product_type_id,attribute_id,requirement_level,value_level,
      filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order
    ) VALUES($1::uuid,$2::uuid,'optional','family',true,true,true,true,false,false,10)
  `, [productTypeId, attributeId]);

  const existingA = await insertSourceProduct("existing-a", "provider-cat-A");
  const existingB = await insertSourceProduct("existing-b", "provider-cat-B");
  await insertObservation(existingA, "colour", "Μαύρο");
  await insertObservation(existingB, "colour", "Μαύρο");

  const attributeRule = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.catalog_source_attribute_mapping_rules(
      source_id,source_attribute_key,scope_kind,scope_key,
      product_type_id,attribute_id,status,mapping_method,reason,reviewed_by,reviewed_at,metadata
    ) VALUES(
      $1::uuid,'colour','source_category','provider-cat-A',
      $2::uuid,$3::uuid,'approved','admin_exact_context','CI reviewed enum mapping',$4::uuid,now(),'{}'::jsonb
    )
    RETURNING id::text
  `, [sourceId, productTypeId, attributeId, reviewerId]);
  const attributeRuleId = required(attributeRule.rows[0]?.id, "attribute mapping rule");

  const attributeBackfill = await runtime.nativePool.query<{ mapping_status: string; row_count: string }>(`
    SELECT mapping_status,row_count::text
    FROM bls_private.backfill_catalog_source_attribute_mapping_rule($1::uuid,$2::uuid)
  `, [attributeRuleId, reviewerId]);
  assert(attributeBackfill.rows.some((row) => row.mapping_status === "review_required" && Number(row.row_count) === 1), "enum source attribute must remain review_required before a value alias is approved");

  const beforeValueRule = await readObservation(existingA);
  assert(beforeValueRule.mapping_status === "review_required", "provider-cat-A enum must be held for value review");
  assert(beforeValueRule.attribute_id === attributeId, "review-held enum must retain its approved canonical attribute link");
  assert(beforeValueRule.attribute_value_id === null, "review-held enum must not guess a controlled value");
  const outsideBeforeRule = await readObservation(existingB);
  assert(outsideBeforeRule.mapping_status === "unmapped" && outsideBeforeRule.attribute_id === null, "attribute mapping must not leak into provider-cat-B");

  const valueRule = await runtime.nativePool.query<{ id: string; source_value_key: string }>(`
    INSERT INTO public.catalog_source_attribute_value_mapping_rules(
      attribute_mapping_rule_id,attribute_id,source_value,source_value_key,
      attribute_value_id,status,mapping_method,reason,reviewed_by,reviewed_at,metadata
    ) VALUES(
      $1::uuid,$2::uuid,'  Μαύρο  ','ignored-on-purpose',$3::uuid,
      'approved','admin_exact_controlled_value','CI exact controlled alias',$4::uuid,now(),'{}'::jsonb
    )
    RETURNING id::text,source_value_key
  `, [attributeRuleId, attributeId, black, reviewerId]);
  const valueRuleId = required(valueRule.rows[0]?.id, "controlled value rule");
  assert(valueRule.rows[0]?.source_value_key === "μαύρο", "controlled value rule trigger must normalize surrounding whitespace and case");

  const valueBackfill = await runtime.nativePool.query<{ mapped: string }>(`
    SELECT bls_private.backfill_catalog_source_attribute_value_mapping_rule($1::uuid,$2::uuid)::text AS mapped
  `, [valueRuleId, reviewerId]);
  assert(Number(valueBackfill.rows[0]?.mapped ?? 0) === 1, "controlled value rule must backfill exactly one matching provider-cat-A observation");

  const resolvedExisting = await readObservation(existingA);
  assert(resolvedExisting.mapping_status === "mapped", "approved controlled alias must resolve the held enum observation");
  assert(resolvedExisting.attribute_id === attributeId, "resolved enum must retain canonical attribute id");
  assert(resolvedExisting.attribute_value_id === black, "resolved enum must store the approved canonical controlled value id");
  assert(JSON.stringify(resolvedExisting.raw_value) === JSON.stringify({ value: { value: "Μαύρο" } }), "controlled-value mapping must preserve raw source evidence");

  const futureExact = await insertSourceProduct("future-exact", "provider-cat-A");
  const futureUnknown = await insertSourceProduct("future-unknown", "provider-cat-A");
  const futureOtherContext = await insertSourceProduct("future-other-context", "provider-cat-B");
  await insertObservation(futureExact, "colour", "  ΜΑΎΡΟ  ");
  await insertObservation(futureUnknown, "colour", "Λευκό");
  await insertObservation(futureOtherContext, "colour", "Μαύρο");

  const exactState = await readObservation(futureExact);
  const unknownState = await readObservation(futureUnknown);
  const otherState = await readObservation(futureOtherContext);
  assert(exactState.mapping_status === "mapped" && exactState.attribute_value_id === black, "future exact controlled alias must auto-map to the approved value");
  assert(unknownState.mapping_status === "review_required" && unknownState.attribute_id === attributeId && unknownState.attribute_value_id === null, "unknown enum value must remain review_required without a value rule");
  assert(otherState.mapping_status === "unmapped" && otherState.attribute_id === null && otherState.attribute_value_id === null, "controlled alias must not leak into another provider category");

  let wrongTargetRejected = false;
  const secondAttribute = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.attribute_definitions(code,data_type,unit,value_mode,active,filterable,variant_identity,values)
    VALUES($1,'enum',NULL,'controlled',true,true,false,'[]'::jsonb)
    RETURNING id::text
  `, [`ci_other_enum_${suffix}`]);
  const secondAttributeId = required(secondAttribute.rows[0]?.id, "second enum attribute");
  const secondValue = await runtime.nativePool.query<{ id: string }>(`
    INSERT INTO public.attribute_values(attribute_id,code,sort_order,active,metadata)
    VALUES($1::uuid,'other',10,true,'{}'::jsonb)
    RETURNING id::text
  `, [secondAttributeId]);
  try {
    await runtime.nativePool.query(`
      INSERT INTO public.catalog_source_attribute_value_mapping_rules(
        attribute_mapping_rule_id,attribute_id,source_value,source_value_key,
        attribute_value_id,status,mapping_method,reason,reviewed_by,reviewed_at,metadata
      ) VALUES(
        $1::uuid,$2::uuid,'bad-target','bad-target',$3::uuid,
        'approved','admin_exact_controlled_value','must fail',$4::uuid,now(),'{}'::jsonb
      )
    `, [attributeRuleId, attributeId, required(secondValue.rows[0]?.id, "second value"), reviewerId]);
  } catch {
    wrongTargetRejected = true;
  }
  assert(wrongTargetRejected, "controlled value from another canonical attribute must be rejected");

  const canonicalLinks = await runtime.nativePool.query<{ count: string }>(`
    SELECT count(*)::text
    FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products sp ON sp.id=l.source_product_id
    WHERE sp.source_id=$1::uuid
  `, [sourceId]);
  assert(Number(canonicalLinks.rows[0]?.count ?? 0) === 0, "controlled-value normalization must not create canonical product links");

  const privileges = await runtime.nativePool.query<{ anon_denied: boolean; authenticated_denied: boolean; service_denied: boolean; rls: boolean }>(`
    SELECT
      NOT has_table_privilege('anon','public.catalog_source_attribute_value_mapping_rules','SELECT') AS anon_denied,
      NOT has_table_privilege('authenticated','public.catalog_source_attribute_value_mapping_rules','SELECT') AS authenticated_denied,
      NOT has_table_privilege('service_role','public.catalog_source_attribute_value_mapping_rules','SELECT') AS service_denied,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.catalog_source_attribute_value_mapping_rules'::regclass) AS rls
  `);
  const privilege = privileges.rows[0];
  assert(privilege?.anon_denied && privilege.authenticated_denied && privilege.service_denied && privilege.rls, "controlled-value rules must remain platform-runtime-only with RLS");

  console.log(JSON.stringify({
    ok: true,
    schema: readiness.appliedSchemaVersion,
    sourceId,
    productTypeId,
    attributeId,
    attributeRuleId,
    valueRuleId,
    controlledValues: { black, white },
    states: {
      existing: resolvedExisting,
      futureExact: exactState,
      futureUnknown: unknownState,
      otherContext: otherState
    }
  }));

  async function insertAttributeValue(code: string, label: string, sortOrder: number): Promise<string> {
    const value = await runtime.nativePool.query<{ id: string }>(`
      INSERT INTO public.attribute_values(attribute_id,code,sort_order,active,metadata)
      VALUES($1::uuid,$2,$3,true,'{}'::jsonb)
      RETURNING id::text
    `, [attributeId, code, sortOrder]);
    const id = required(value.rows[0]?.id, `attribute value ${code}`);
    await runtime.nativePool.query(`
      INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
      VALUES($1::uuid,'el',$2)
    `, [id, label]);
    return id;
  }

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

  async function insertObservation(sourceProductId: string, key: string, scalar: string): Promise<void> {
    await runtime.nativePool.query(`
      INSERT INTO public.catalog_source_attribute_observations(
        source_product_id,source_attribute_key,position,raw_value,normalized_value,source_unit,mapping_status,metadata
      ) VALUES($1::uuid,$2,0,$3::jsonb,$3::jsonb,NULL,'unmapped','{}'::jsonb)
    `, [sourceProductId, key, JSON.stringify({ value: { value: scalar } })]);
  }

  async function readObservation(sourceProductId: string): Promise<{
    mapping_status: string;
    attribute_id: string | null;
    attribute_value_id: string | null;
    raw_value: unknown;
  }> {
    const result = await runtime.nativePool.query<{
      mapping_status: string;
      attribute_id: string | null;
      attribute_value_id: string | null;
      raw_value: unknown;
    }>(`
      SELECT mapping_status,attribute_id::text,attribute_value_id::text,raw_value
      FROM public.catalog_source_attribute_observations
      WHERE source_product_id=$1::uuid AND source_attribute_key='colour'
      LIMIT 1
    `, [sourceProductId]);
    const row = result.rows[0];
    if (!row) throw new Error("controlled-value smoke observation missing");
    return row;
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
