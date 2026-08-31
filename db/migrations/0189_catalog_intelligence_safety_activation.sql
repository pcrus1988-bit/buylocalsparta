-- Buy Local Sparta — catalogue intelligence safety activation.
-- Installs post-review safety fixes before autonomous queue execution is enabled:
-- 1) pgcrypto is schema-qualified;
-- 2) proposal upserts consolidate raw keys that normalize identically;
-- 3) mapping provenance records the actual rule mapping method.
--
-- Schema 0188 intentionally leaves the queue dormant. This migration activates
-- pg_cron only after all corrected functions are in place.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  source_uuid uuid;
  taxonomy_uuid uuid;
  provider_category text;
  resolved_scope_kind text;
  resolved_scope_key text;
  matched_rule_id uuid;
  matched_product_type_id uuid;
  matched_attribute_id uuid;
  matched_mapping_method text;
  matched_data_type text;
  matched_unit text;
BEGIN
  IF NEW.attribute_id IS NOT NULL OR NEW.mapping_status <> 'unmapped' THEN
    RETURN NEW;
  END IF;

  SELECT sp.source_id,
         sp.source_taxonomy_node_id,
         COALESCE(
           NULLIF(btrim(sp.source_identity->>'categoryId'),''),
           NULLIF(btrim(sp.source_identity->>'category_id'),''),
           NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
         )
    INTO source_uuid,taxonomy_uuid,provider_category
  FROM public.catalog_source_products sp
  WHERE sp.id=NEW.source_product_id;

  IF source_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  IF taxonomy_uuid IS NOT NULL THEN
    resolved_scope_kind:='taxonomy_node';
    resolved_scope_key:=taxonomy_uuid::text;
  ELSIF provider_category IS NOT NULL THEN
    resolved_scope_kind:='source_category';
    resolved_scope_key:=provider_category;
  ELSE
    RETURN NEW;
  END IF;

  SELECT r.id,
         r.product_type_id,
         r.attribute_id,
         r.mapping_method,
         ad.data_type,
         COALESCE(pta.unit_override,ad.unit)
    INTO matched_rule_id,
         matched_product_type_id,
         matched_attribute_id,
         matched_mapping_method,
         matched_data_type,
         matched_unit
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt
    ON pt.id=r.product_type_id
   AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id
   AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id
   AND ad.active=true
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='approved'
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.attribute_id:=matched_attribute_id;
  NEW.mapping_status:=bls_private.catalog_source_attribute_mapping_status(
    matched_data_type,
    matched_unit,
    NEW.source_unit,
    NEW.raw_value,
    NEW.normalized_value
  );
  NEW.confidence:=1;
  NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'mappingRuleId',matched_rule_id,
      'mappingMethod',matched_mapping_method,
      'mappingScopeKind',resolved_scope_kind,
      'mappingScopeKey',resolved_scope_key,
      'productTypeId',matched_product_type_id,
      'autoMapped',(matched_mapping_method='system_exact_context'),
      'mappedAt',now()
    );

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(
  rule_uuid uuid,
  actor_user_id uuid
)
RETURNS TABLE(mapping_status text,row_count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_mapping_method text;
BEGIN
  SELECT r.mapping_method
    INTO v_mapping_method
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt
    ON pt.id=r.product_type_id
   AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id
   AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id
   AND ad.active=true
  WHERE r.id=rule_uuid
    AND r.status='approved';

  IF v_mapping_method IS NULL THEN
    RAISE EXCEPTION 'approved source attribute mapping rule is missing or inactive';
  END IF;

  IF v_mapping_method='admin_exact_context' AND actor_user_id IS NULL THEN
    RAISE EXCEPTION 'admin exact-context backfill requires an actor';
  END IF;

  RETURN QUERY
  WITH rule_data AS (
    SELECT
      r.source_id,
      r.source_attribute_key,
      r.scope_kind,
      r.scope_key,
      r.product_type_id,
      r.attribute_id,
      r.mapping_method,
      ad.data_type,
      COALESCE(pta.unit_override,ad.unit) AS effective_unit
    FROM public.catalog_source_attribute_mapping_rules r
    JOIN public.product_types pt
      ON pt.id=r.product_type_id
     AND pt.status='active'
    JOIN public.product_type_attributes pta
      ON pta.product_type_id=r.product_type_id
     AND pta.attribute_id=r.attribute_id
    JOIN public.attribute_definitions ad
      ON ad.id=r.attribute_id
     AND ad.active=true
    WHERE r.id=rule_uuid
      AND r.status='approved'
  ),
  updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=rd.attribute_id,
        mapping_status=bls_private.catalog_source_attribute_mapping_status(
          rd.data_type,
          rd.effective_unit,
          a.source_unit,
          a.raw_value,
          a.normalized_value
        ),
        confidence=1,
        metadata=COALESCE(a.metadata,'{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'mappingRuleId',rule_uuid,
            'mappingMethod',rd.mapping_method,
            'mappingScopeKind',rd.scope_kind,
            'mappingScopeKey',rd.scope_key,
            'productTypeId',rd.product_type_id,
            'mappedBy',CASE WHEN actor_user_id IS NULL THEN NULL ELSE actor_user_id::text END,
            'mappedAt',now(),
            'backfilled',true,
            'autoMapped',(rd.mapping_method='system_exact_context')
          ))
    FROM public.catalog_source_products sp,rule_data rd
    WHERE sp.id=a.source_product_id
      AND sp.source_id=rd.source_id
      AND a.source_attribute_key=rd.source_attribute_key
      AND (
        (rd.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=rd.scope_key)
        OR
        (
          rd.scope_kind='source_category'
          AND sp.source_taxonomy_node_id IS NULL
          AND COALESCE(
            NULLIF(btrim(sp.source_identity->>'categoryId'),''),
            NULLIF(btrim(sp.source_identity->>'category_id'),''),
            NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
          )=rd.scope_key
        )
      )
      AND a.mapping_status='unmapped'
      AND a.attribute_id IS NULL
    RETURNING a.mapping_status
  )
  SELECT u.mapping_status,count(*)::bigint
  FROM updated u
  GROUP BY u.mapping_status
  ORDER BY u.mapping_status;
END
$$;

REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() IS
  'Applies one approved exact-context rule to newly inserted observations while preserving the rule actual mapping-method provenance.';
COMMENT ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) IS
  'Backfills one approved exact-context rule while preserving admin/system mapping provenance and requiring an actor for Admin decisions.';

CREATE OR REPLACE FUNCTION bls_private.refresh_catalog_attribute_intelligence(
  p_source_id uuid,
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private,extensions
AS $$
DECLARE
  v_market_id uuid;
  v_source_code text;
  v_snapshot_id uuid;
  v_rules_created integer:=0;
  v_observations_mapped integer:=0;
  v_proposed integer:=0;
BEGIN
  SELECT cs.market_id,cs.code
    INTO v_market_id,v_source_code
  FROM public.catalog_sources cs
  WHERE cs.id=p_source_id
    AND cs.active=true;

  IF v_market_id IS NULL THEN
    RAISE EXCEPTION 'Active catalogue source % was not found',p_source_id;
  END IF;

  SELECT COALESCE(
    p_snapshot_id,
    (
      SELECT css.id
      FROM public.catalog_source_snapshots css
      WHERE css.source_id=p_source_id
      ORDER BY COALESCE(css.observed_at,css.created_at) DESC,
               css.created_at DESC,
               css.id DESC
      LIMIT 1
    )
  )
  INTO v_snapshot_id;

  IF v_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_snapshots css
    WHERE css.id=v_snapshot_id
      AND css.source_id=p_source_id
  ) THEN
    RAISE EXCEPTION 'Catalogue snapshot was not found for source %',p_source_id;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('catalog-attribute-intelligence:'||p_source_id::text)
  );

  WITH base AS (
    SELECT
      a.id AS observation_id,
      a.source_attribute_key,
      a.source_unit,
      a.raw_value,
      a.normalized_value,
      sp.id AS source_product_id,
      sp.source_taxonomy_node_id,
      COALESCE(
        NULLIF(btrim(sp.source_identity->>'categoryId'),''),
        NULLIF(btrim(sp.source_identity->>'category_id'),''),
        NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
      ) AS provider_category,
      cm.category_id
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp
      ON sp.id=a.source_product_id
    LEFT JOIN public.catalog_source_category_mappings cm
      ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id
     AND cm.mapping_status='approved'
    WHERE sp.source_id=p_source_id
      AND sp.snapshot_id=v_snapshot_id
      AND a.mapping_status='unmapped'
      AND a.attribute_id IS NULL
  ),
  scoped AS (
    SELECT
      b.*,
      CASE WHEN b.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node' ELSE 'source_category' END AS scope_kind,
      CASE WHEN b.source_taxonomy_node_id IS NOT NULL THEN b.source_taxonomy_node_id::text ELSE b.provider_category END AS scope_key
    FROM base b
    WHERE b.source_taxonomy_node_id IS NOT NULL OR b.provider_category IS NOT NULL
  ),
  scope_context AS (
    SELECT
      s.source_attribute_key,s.scope_kind,s.scope_key,s.category_id,
      count(DISTINCT pt.id)::integer AS product_type_count,
      (array_agg(DISTINCT pt.id ORDER BY pt.id) FILTER (WHERE pt.id IS NOT NULL))[1] AS only_product_type_id
    FROM scoped s
    LEFT JOIN public.category_product_types cpt ON cpt.category_id=s.category_id
    LEFT JOIN public.product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
    GROUP BY s.source_attribute_key,s.scope_kind,s.scope_key,s.category_id
  ),
  candidate_rows AS (
    SELECT
      sc.source_attribute_key,sc.scope_kind,sc.scope_key,sc.product_type_count,sc.only_product_type_id,
      ad.id AS attribute_id,ad.data_type,COALESCE(pta.unit_override,ad.unit) AS effective_unit
    FROM scope_context sc
    JOIN public.product_type_attributes pta ON pta.product_type_id=sc.only_product_type_id
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    WHERE sc.product_type_count=1
      AND (
        bls_private.catalog_normalize_text(ad.code)=bls_private.catalog_normalize_text(sc.source_attribute_key)
        OR EXISTS (
          SELECT 1 FROM public.attribute_translations at
          WHERE at.attribute_id=ad.id
            AND bls_private.catalog_normalize_text(at.label)=bls_private.catalog_normalize_text(sc.source_attribute_key)
        )
      )
  ),
  candidate_rollup AS (
    SELECT
      sc.source_attribute_key,sc.scope_kind,sc.scope_key,sc.category_id,
      sc.product_type_count,sc.only_product_type_id,
      count(DISTINCT cr.attribute_id)::integer AS candidate_count,
      (array_agg(DISTINCT cr.attribute_id ORDER BY cr.attribute_id) FILTER (WHERE cr.attribute_id IS NOT NULL))[1] AS only_attribute_id,
      max(cr.data_type) FILTER (WHERE cr.attribute_id IS NOT NULL) AS data_type,
      max(cr.effective_unit) FILTER (WHERE cr.attribute_id IS NOT NULL) AS effective_unit
    FROM scope_context sc
    LEFT JOIN candidate_rows cr
      ON cr.source_attribute_key=sc.source_attribute_key AND cr.scope_kind=sc.scope_kind AND cr.scope_key=sc.scope_key
    GROUP BY sc.source_attribute_key,sc.scope_kind,sc.scope_key,sc.category_id,
             sc.product_type_count,sc.only_product_type_id
  ),
  compatible AS (
    SELECT cr.*,
      bool_and(bls_private.catalog_source_attribute_mapping_status(
        cr.data_type,cr.effective_unit,s.source_unit,s.raw_value,s.normalized_value
      )='mapped') AS all_values_compatible
    FROM candidate_rollup cr
    JOIN scoped s
      ON s.source_attribute_key=cr.source_attribute_key AND s.scope_kind=cr.scope_kind AND s.scope_key=cr.scope_key
    WHERE cr.candidate_count=1 AND cr.product_type_count=1
    GROUP BY cr.source_attribute_key,cr.scope_kind,cr.scope_key,cr.category_id,
             cr.product_type_count,cr.only_product_type_id,cr.candidate_count,
             cr.only_attribute_id,cr.data_type,cr.effective_unit
  ),
  inserted AS (
    INSERT INTO public.catalog_source_attribute_mapping_rules(
      source_id,source_attribute_key,scope_kind,scope_key,product_type_id,attribute_id,
      status,mapping_method,reason,reviewed_by,reviewed_at,metadata,created_at,updated_at
    )
    SELECT p_source_id,c.source_attribute_key,c.scope_kind,c.scope_key,c.only_product_type_id,c.only_attribute_id,
      'approved','system_exact_context',
      'Unique normalized exact attribute match inside one active Product Type contract with fully compatible observed values',
      NULL,now(),jsonb_build_object(
        'autoApprovedBy','catalog_intelligence_v1','policy','unique_normalized_exact_contract_match',
        'sourceId',p_source_id,'sourceCode',v_source_code,'snapshotId',v_snapshot_id
      ),now(),now()
    FROM compatible c
    WHERE c.all_values_compatible=true
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_source_attribute_mapping_rules existing
        WHERE existing.source_id=p_source_id AND existing.source_attribute_key=c.source_attribute_key
          AND existing.scope_kind=c.scope_kind AND existing.scope_key=c.scope_key AND existing.status='approved'
      )
    ON CONFLICT (source_id,source_attribute_key,scope_kind,scope_key) WHERE status='approved' DO NOTHING
    RETURNING id,source_attribute_key,scope_kind,scope_key,product_type_id,attribute_id
  ),
  audited AS (
    INSERT INTO public.audit_events(
      market_id,actor_user_id,actor_role,actor_public_id,action,entity_type,entity_id,
      reason,before_state,after_state,created_at,public_id
    )
    SELECT v_market_id,NULL,'system','system:catalog-intelligence',
      'catalogue.source_attribute_mapping.approved','catalog_source_attribute_mapping_rule',i.id::text,
      'Deterministic exact Product Type attribute contract match',NULL,
      jsonb_build_object('sourceAttributeKey',i.source_attribute_key,'scopeKind',i.scope_kind,
        'scopeKey',i.scope_key,'productTypeId',i.product_type_id,'attributeId',i.attribute_id,
        'mappingMethod','system_exact_context'),now(),gen_random_uuid()::text
    FROM inserted i RETURNING 1
  )
  SELECT count(*)::integer INTO v_rules_created FROM audited;

  WITH updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=r.attribute_id,
        mapping_status=bls_private.catalog_source_attribute_mapping_status(
          ad.data_type,COALESCE(pta.unit_override,ad.unit),a.source_unit,a.raw_value,a.normalized_value
        ),
        confidence=1,
        metadata=COALESCE(a.metadata,'{}'::jsonb)||jsonb_build_object(
          'mappingRuleId',r.id,'mappingMethod',r.mapping_method,'mappingScopeKind',r.scope_kind,
          'mappingScopeKey',r.scope_key,'productTypeId',r.product_type_id,'autoMapped',true,'mappedAt',now()
        )
    FROM public.catalog_source_products sp
    JOIN public.catalog_source_attribute_mapping_rules r
      ON r.source_id=sp.source_id AND r.status='approved' AND r.mapping_method='system_exact_context'
     AND ((r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
       OR (r.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
          NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),
          NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
       )=r.scope_key))
    JOIN public.product_type_attributes pta ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
    JOIN public.attribute_definitions ad ON ad.id=r.attribute_id AND ad.active=true
    WHERE sp.id=a.source_product_id AND sp.source_id=p_source_id AND sp.snapshot_id=v_snapshot_id
      AND a.source_attribute_key=r.source_attribute_key AND a.mapping_status='unmapped' AND a.attribute_id IS NULL
    RETURNING a.id
  )
  SELECT count(*)::integer INTO v_observations_mapped FROM updated;

  WITH unresolved_raw AS (
    SELECT a.source_attribute_key,
      bls_private.catalog_normalize_text(a.source_attribute_key) AS normalized_attribute_key,
      a.source_unit,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node' ELSE 'source_category' END AS scope_kind,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN sp.source_taxonomy_node_id::text ELSE COALESCE(
        NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),
        NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
      ) END AS scope_key,
      sp.source_taxonomy_node_id,cm.category_id
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    LEFT JOIN public.catalog_source_category_mappings cm
      ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id AND cm.mapping_status='approved'
    WHERE sp.source_id=p_source_id AND sp.snapshot_id=v_snapshot_id
      AND a.mapping_status='unmapped' AND a.attribute_id IS NULL
      AND (sp.source_taxonomy_node_id IS NOT NULL OR COALESCE(
        NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),
        NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
      ) IS NOT NULL)
  ),
  unresolved AS (
    SELECT ur.normalized_attribute_key,
      (array_agg(DISTINCT ur.source_attribute_key ORDER BY ur.source_attribute_key))[1] AS source_attribute_key,
      array_agg(DISTINCT ur.source_attribute_key ORDER BY ur.source_attribute_key) AS source_attribute_keys,
      ur.scope_kind,ur.scope_key,ur.source_taxonomy_node_id,ur.category_id,
      count(*)::integer AS observation_count,
      array_agg(DISTINCT ur.source_unit ORDER BY ur.source_unit) FILTER (WHERE ur.source_unit IS NOT NULL) AS source_units
    FROM unresolved_raw ur
    WHERE ur.normalized_attribute_key IS NOT NULL AND ur.normalized_attribute_key<>''
    GROUP BY ur.normalized_attribute_key,ur.scope_kind,ur.scope_key,ur.source_taxonomy_node_id,ur.category_id
  ),
  type_counts AS (
    SELECT u.*,
      count(DISTINCT pt.id)::integer AS product_type_count,
      (array_agg(DISTINCT pt.id ORDER BY pt.id) FILTER (WHERE pt.id IS NOT NULL))[1] AS only_product_type_id
    FROM unresolved u
    LEFT JOIN public.category_product_types cpt ON cpt.category_id=u.category_id
    LEFT JOIN public.product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
    GROUP BY u.normalized_attribute_key,u.source_attribute_key,u.source_attribute_keys,u.scope_kind,u.scope_key,
      u.source_taxonomy_node_id,u.category_id,u.observation_count,u.source_units
  ),
  candidates AS (
    SELECT tc.normalized_attribute_key,tc.scope_kind,tc.scope_key,ad.id AS attribute_id
    FROM type_counts tc
    JOIN public.product_type_attributes pta ON pta.product_type_id=tc.only_product_type_id
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    WHERE tc.product_type_count=1 AND (
      bls_private.catalog_normalize_text(ad.code)=tc.normalized_attribute_key OR EXISTS (
        SELECT 1 FROM public.attribute_translations at
        WHERE at.attribute_id=ad.id AND bls_private.catalog_normalize_text(at.label)=tc.normalized_attribute_key
      )
    )
  ),
  proposal_rows AS (
    SELECT tc.*,
      count(DISTINCT c.attribute_id)::integer AS candidate_count,
      (array_agg(DISTINCT c.attribute_id ORDER BY c.attribute_id) FILTER (WHERE c.attribute_id IS NOT NULL))[1] AS candidate_attribute_id,
      COALESCE(jsonb_agg(DISTINCT c.attribute_id) FILTER (WHERE c.attribute_id IS NOT NULL),'[]'::jsonb) AS candidates
    FROM type_counts tc
    LEFT JOIN candidates c
      ON c.normalized_attribute_key=tc.normalized_attribute_key AND c.scope_kind=tc.scope_kind AND c.scope_key=tc.scope_key
    GROUP BY tc.normalized_attribute_key,tc.source_attribute_key,tc.source_attribute_keys,tc.scope_kind,tc.scope_key,
      tc.source_taxonomy_node_id,tc.category_id,tc.observation_count,tc.source_units,tc.product_type_count,tc.only_product_type_id
  ),
  upserted AS (
    INSERT INTO public.catalog_intelligence_proposals(
      market_id,source_id,snapshot_id,proposal_kind,fingerprint,source_taxonomy_node_id,
      source_attribute_key,scope_kind,scope_key,candidate_category_id,candidate_attribute_id,
      candidate_product_type_id,confidence,proposed_payload,evidence,last_seen_at,updated_at
    )
    SELECT v_market_id,p_source_id,v_snapshot_id,
      CASE WHEN pr.category_id IS NULL OR pr.product_type_count<>1 THEN 'attribute_contract_missing'
           WHEN pr.candidate_count>1 THEN 'attribute_ambiguous' ELSE 'attribute_new' END,
      'attribute:'||p_source_id::text||':'||encode(extensions.digest(
        coalesce(pr.scope_kind,'')||':'||coalesce(pr.scope_key,'')||':'||pr.normalized_attribute_key,'sha256'
      ),'hex'),
      pr.source_taxonomy_node_id,pr.source_attribute_key,pr.scope_kind,pr.scope_key,pr.category_id,
      CASE WHEN pr.candidate_count=1 THEN pr.candidate_attribute_id ELSE NULL END,
      CASE WHEN pr.product_type_count=1 THEN pr.only_product_type_id ELSE NULL END,
      CASE WHEN pr.candidate_count>1 THEN 0.50000 ELSE 0.00000 END,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceAttributeKey',pr.source_attribute_key,'sourceAttributeKeys',to_jsonb(pr.source_attribute_keys),
        'normalizedAttributeKey',pr.normalized_attribute_key,'sourceUnits',to_jsonb(pr.source_units),
        'suggestedProductTypeId',CASE WHEN pr.product_type_count=1 THEN pr.only_product_type_id ELSE NULL END
      )),
      jsonb_build_object('observationCount',pr.observation_count,'productTypeCount',pr.product_type_count,
        'candidateCount',pr.candidate_count,'candidates',pr.candidates,'policy','catalog_intelligence_v1'),
      now(),now()
    FROM proposal_rows pr
    ON CONFLICT (fingerprint) DO UPDATE
    SET snapshot_id=EXCLUDED.snapshot_id,proposal_kind=EXCLUDED.proposal_kind,
        source_attribute_key=EXCLUDED.source_attribute_key,candidate_category_id=EXCLUDED.candidate_category_id,
        candidate_attribute_id=EXCLUDED.candidate_attribute_id,candidate_product_type_id=EXCLUDED.candidate_product_type_id,
        confidence=EXCLUDED.confidence,proposed_payload=EXCLUDED.proposed_payload,evidence=EXCLUDED.evidence,
        occurrence_count=public.catalog_intelligence_proposals.occurrence_count+1,last_seen_at=now(),updated_at=now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_proposed FROM upserted;

  UPDATE public.catalog_intelligence_proposals p
  SET status='auto_resolved',reviewed_at=COALESCE(p.reviewed_at,now()),
      resolution=p.resolution||jsonb_build_object('resolvedBy','catalog_intelligence_v1','reason','approved_attribute_mapping_rule_exists'),
      updated_at=now()
  WHERE p.source_id=p_source_id AND p.status='open'
    AND p.proposal_kind IN ('attribute_new','attribute_ambiguous','attribute_contract_missing')
    AND EXISTS (
      SELECT 1 FROM public.catalog_source_attribute_mapping_rules r
      WHERE r.source_id=p.source_id AND r.scope_kind=p.scope_kind AND r.scope_key=p.scope_key AND r.status='approved'
        AND bls_private.catalog_normalize_text(r.source_attribute_key)=COALESCE(
          NULLIF(p.proposed_payload->>'normalizedAttributeKey',''),bls_private.catalog_normalize_text(p.source_attribute_key)
        )
    );

  RETURN jsonb_build_object('sourceId',p_source_id,'snapshotId',v_snapshot_id,
    'autoCreatedAttributeRules',v_rules_created,'autoMappedAttributeObservations',v_observations_mapped,
    'attributeProposalsTouched',v_proposed);
END
$$;

REVOKE ALL ON FUNCTION bls_private.refresh_catalog_attribute_intelligence(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.refresh_catalog_attribute_intelligence(uuid,uuid) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.refresh_catalog_attribute_intelligence(uuid,uuid) IS
  'Deterministic attribute intelligence with normalized-key proposal consolidation, schema-qualified hashing, and governed exact-contract auto reuse.';

DO $cron$
BEGIN
  IF to_regclass('public.catalog_intelligence_refresh_queue') IS NULL THEN
    RAISE EXCEPTION 'Schema 0188 catalogue intelligence queue is required before activation';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='bls_catalog_intelligence_1m') THEN
      PERFORM cron.unschedule('bls_catalog_intelligence_1m');
    END IF;

    PERFORM cron.schedule(
      'bls_catalog_intelligence_1m','* * * * *',
      $job$SELECT bls_private.process_catalog_intelligence_refresh_queue('pg_cron:catalog-intelligence',10,180);$job$
    );
  END IF;
END
$cron$;

COMMIT;
