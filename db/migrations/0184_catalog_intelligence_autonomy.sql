-- Buy Local Sparta — autonomous catalogue intelligence foundation.
-- Deterministic exact matches may auto-map into EXISTING canonical structure.
-- Novel or ambiguous source structure is persisted as a governed proposal.
-- No model/LLM is permitted to mutate canonical taxonomy or attribute contracts directly.

BEGIN;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  ALTER COLUMN reviewed_by DROP NOT NULL;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  DROP CONSTRAINT IF EXISTS catalog_source_attribute_mapping_rules_mapping_method_check;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  ADD CONSTRAINT catalog_source_attribute_mapping_rules_mapping_method_check
  CHECK (mapping_method IN ('admin_exact_context','system_exact_context'));

ALTER TABLE public.catalog_source_attribute_mapping_rules
  ADD CONSTRAINT catalog_source_attribute_mapping_rules_reviewer_check
  CHECK (
    (mapping_method='admin_exact_context' AND reviewed_by IS NOT NULL)
    OR
    (mapping_method='system_exact_context' AND reviewed_by IS NULL)
  );

COMMENT ON COLUMN public.catalog_source_attribute_mapping_rules.reviewed_by IS
  'Admin actor for admin_exact_context rules; NULL only for deterministic system_exact_context rules admitted by catalogue intelligence policy.';

CREATE TABLE public.catalog_intelligence_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.catalog_source_snapshots(id) ON DELETE SET NULL,
  proposal_kind text NOT NULL CHECK (proposal_kind IN (
    'category_new',
    'category_ambiguous',
    'attribute_new',
    'attribute_ambiguous',
    'attribute_contract_missing'
  )),
  fingerprint text NOT NULL,
  source_taxonomy_node_id uuid REFERENCES public.catalog_source_taxonomy_nodes(id) ON DELETE CASCADE,
  source_attribute_key text,
  scope_kind text CHECK (scope_kind IS NULL OR scope_kind IN ('taxonomy_node','source_category')),
  scope_key text,
  candidate_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  candidate_attribute_id uuid REFERENCES public.attribute_definitions(id) ON DELETE SET NULL,
  candidate_product_type_id uuid REFERENCES public.product_types(id) ON DELETE SET NULL,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','approved','rejected','auto_resolved','superseded'
  )),
  proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint),
  CHECK (
    (proposal_kind LIKE 'category_%' AND source_taxonomy_node_id IS NOT NULL)
    OR
    (proposal_kind LIKE 'attribute_%' AND source_attribute_key IS NOT NULL)
  ),
  CHECK (
    (scope_kind IS NULL AND scope_key IS NULL)
    OR
    (scope_kind IS NOT NULL AND scope_key IS NOT NULL)
  )
);

CREATE INDEX catalog_intelligence_proposals_queue_idx
  ON public.catalog_intelligence_proposals(source_id,status,proposal_kind,last_seen_at DESC);

CREATE INDEX catalog_intelligence_proposals_taxonomy_idx
  ON public.catalog_intelligence_proposals(source_taxonomy_node_id,status)
  WHERE source_taxonomy_node_id IS NOT NULL;

CREATE INDEX catalog_intelligence_proposals_attribute_idx
  ON public.catalog_intelligence_proposals(source_id,source_attribute_key,status)
  WHERE source_attribute_key IS NOT NULL;

COMMENT ON TABLE public.catalog_intelligence_proposals IS
  'Durable evidence-backed proposals emitted when deterministic catalogue intelligence cannot safely reuse existing canonical structure. New canonical categories/attributes remain governed until explicit approval.';

ALTER TABLE public.catalog_intelligence_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_intelligence_proposals
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_intelligence_proposals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.catalog_intelligence_proposals TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.refresh_catalog_category_intelligence(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_market_id uuid;
  v_snapshot_id uuid;
  v_auto_mapped integer := 0;
  v_proposed integer := 0;
BEGIN
  SELECT cs.id,cs.market_id
    INTO v_source_id,v_market_id
  FROM public.catalog_sources cs
  WHERE cs.code=p_source_code AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Active catalogue source % was not found',p_source_code;
  END IF;

  SELECT COALESCE(
    p_snapshot_id,
    (
      SELECT css.id
      FROM public.catalog_source_snapshots css
      WHERE css.source_id=v_source_id
      ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC
      LIMIT 1
    )
  ) INTO v_snapshot_id;

  IF v_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_snapshots css
    WHERE css.id=v_snapshot_id AND css.source_id=v_source_id
  ) THEN
    RAISE EXCEPTION 'Catalogue snapshot was not found for source %',p_source_code;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog-category-intelligence:'||v_source_id::text));

  WITH used_nodes AS (
    SELECT DISTINCT n.id,n.source_label,n.source_key,n.parent_id,n.path_labels
    FROM public.catalog_source_taxonomy_nodes n
    JOIN public.catalog_source_products sp
      ON sp.source_taxonomy_node_id=n.id
     AND sp.source_id=v_source_id
     AND sp.snapshot_id=v_snapshot_id
    WHERE n.source_id=v_source_id
      AND n.active=true
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_source_category_mappings m
        WHERE m.source_taxonomy_node_id=n.id
          AND m.mapping_status='approved'
      )
  ),
  raw_matches AS (
    SELECT un.id AS node_id,c.id AS category_id,'code'::text AS matched_by
    FROM used_nodes un
    JOIN public.categories c
      ON c.active=true
     AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
     AND bls_private.catalog_normalize_text(c.code)=bls_private.catalog_normalize_text(un.source_label)
    UNION ALL
    SELECT un.id,c.id,'slug'
    FROM used_nodes un
    JOIN public.categories c
      ON c.active=true
     AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
     AND bls_private.catalog_normalize_text(c.slug)=bls_private.catalog_normalize_text(un.source_label)
    UNION ALL
    SELECT un.id,c.id,'translation'
    FROM used_nodes un
    JOIN public.categories c
      ON c.active=true
     AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
    JOIN public.category_translations ct ON ct.category_id=c.id
    WHERE bls_private.catalog_normalize_text(ct.name)=bls_private.catalog_normalize_text(un.source_label)
    UNION ALL
    SELECT un.id,c.id,'alias'
    FROM used_nodes un
    JOIN public.category_aliases ca
      ON ca.market_id=v_market_id
     AND bls_private.catalog_normalize_text(ca.alias)=bls_private.catalog_normalize_text(un.source_label)
    JOIN public.categories c
      ON c.id=ca.category_id
     AND c.active=true
     AND c.assignable=true
  ),
  candidate_rollup AS (
    SELECT
      un.id AS node_id,
      count(DISTINCT rm.category_id) AS candidate_count,
      min(rm.category_id) FILTER (WHERE rm.category_id IS NOT NULL) AS only_category_id,
      jsonb_agg(DISTINCT jsonb_build_object(
        'categoryId',rm.category_id,
        'matchedBy',rm.matched_by
      )) FILTER (WHERE rm.category_id IS NOT NULL) AS candidates
    FROM used_nodes un
    LEFT JOIN raw_matches rm ON rm.node_id=un.id
    GROUP BY un.id
  ),
  inserted AS (
    INSERT INTO public.catalog_source_category_mappings(
      source_taxonomy_node_id,category_id,mapping_status,mapping_method,
      confidence,reason,reviewed_at,metadata,created_at,updated_at
    )
    SELECT
      cr.node_id,
      cr.only_category_id,
      'approved',
      'rule',
      1.00000,
      'Unique normalized exact match against active assignable canonical category',
      now(),
      jsonb_build_object(
        'autoApprovedBy','catalog_intelligence_v1',
        'policy','unique_normalized_exact_match',
        'sourceCode',p_source_code,
        'snapshotId',v_snapshot_id
      ),
      now(),
      now()
    FROM candidate_rollup cr
    WHERE cr.candidate_count=1
    ON CONFLICT (source_taxonomy_node_id) WHERE mapping_status='approved'
    DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_auto_mapped FROM inserted;

  WITH unresolved AS (
    SELECT DISTINCT n.id,n.source_label,n.source_key,n.parent_id,n.path_labels
    FROM public.catalog_source_taxonomy_nodes n
    JOIN public.catalog_source_products sp
      ON sp.source_taxonomy_node_id=n.id
     AND sp.source_id=v_source_id
     AND sp.snapshot_id=v_snapshot_id
    WHERE n.source_id=v_source_id
      AND n.active=true
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_source_category_mappings m
        WHERE m.source_taxonomy_node_id=n.id
          AND m.mapping_status='approved'
      )
  ),
  raw_matches AS (
    SELECT u.id AS node_id,c.id AS category_id,'code'::text AS matched_by
    FROM unresolved u
    JOIN public.categories c
      ON c.active=true AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
     AND bls_private.catalog_normalize_text(c.code)=bls_private.catalog_normalize_text(u.source_label)
    UNION ALL
    SELECT u.id,c.id,'slug'
    FROM unresolved u
    JOIN public.categories c
      ON c.active=true AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
     AND bls_private.catalog_normalize_text(c.slug)=bls_private.catalog_normalize_text(u.source_label)
    UNION ALL
    SELECT u.id,c.id,'translation'
    FROM unresolved u
    JOIN public.categories c
      ON c.active=true AND c.assignable=true
     AND (c.market_id IS NULL OR c.market_id=v_market_id)
    JOIN public.category_translations ct ON ct.category_id=c.id
    WHERE bls_private.catalog_normalize_text(ct.name)=bls_private.catalog_normalize_text(u.source_label)
    UNION ALL
    SELECT u.id,c.id,'alias'
    FROM unresolved u
    JOIN public.category_aliases ca
      ON ca.market_id=v_market_id
     AND bls_private.catalog_normalize_text(ca.alias)=bls_private.catalog_normalize_text(u.source_label)
    JOIN public.categories c
      ON c.id=ca.category_id AND c.active=true AND c.assignable=true
  ),
  proposal_rows AS (
    SELECT
      u.*,
      count(DISTINCT rm.category_id) AS candidate_count,
      min(rm.category_id) FILTER (WHERE rm.category_id IS NOT NULL) AS candidate_category_id,
      COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'categoryId',rm.category_id,
          'matchedBy',rm.matched_by
        )) FILTER (WHERE rm.category_id IS NOT NULL),
        '[]'::jsonb
      ) AS candidates
    FROM unresolved u
    LEFT JOIN raw_matches rm ON rm.node_id=u.id
    GROUP BY u.id,u.source_label,u.source_key,u.parent_id,u.path_labels
  ),
  upserted AS (
    INSERT INTO public.catalog_intelligence_proposals(
      market_id,source_id,snapshot_id,proposal_kind,fingerprint,
      source_taxonomy_node_id,candidate_category_id,confidence,
      proposed_payload,evidence,occurrence_count,first_seen_at,last_seen_at,updated_at
    )
    SELECT
      v_market_id,
      v_source_id,
      v_snapshot_id,
      CASE WHEN pr.candidate_count>1 THEN 'category_ambiguous' ELSE 'category_new' END,
      'category:'||v_source_id::text||':'||pr.id::text,
      pr.id,
      CASE WHEN pr.candidate_count=1 THEN pr.candidate_category_id ELSE NULL END,
      CASE WHEN pr.candidate_count>1 THEN 0.50000 ELSE 0.00000 END,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceLabel',pr.source_label,
        'sourceKey',pr.source_key,
        'pathLabels',to_jsonb(pr.path_labels),
        'suggestedParentSourceNodeId',pr.parent_id
      )),
      jsonb_build_object(
        'candidateCount',pr.candidate_count,
        'candidates',pr.candidates,
        'policy','catalog_intelligence_v1'
      ),
      1,now(),now(),now()
    FROM proposal_rows pr
    ON CONFLICT (fingerprint) DO UPDATE
    SET snapshot_id=EXCLUDED.snapshot_id,
        proposal_kind=EXCLUDED.proposal_kind,
        candidate_category_id=EXCLUDED.candidate_category_id,
        confidence=EXCLUDED.confidence,
        proposed_payload=EXCLUDED.proposed_payload,
        evidence=EXCLUDED.evidence,
        occurrence_count=public.catalog_intelligence_proposals.occurrence_count+1,
        last_seen_at=now(),
        updated_at=now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_proposed FROM upserted;

  UPDATE public.catalog_intelligence_proposals p
  SET status='auto_resolved',
      reviewed_at=COALESCE(reviewed_at,now()),
      resolution=resolution||jsonb_build_object(
        'resolvedBy','catalog_intelligence_v1',
        'reason','approved_category_mapping_exists'
      ),
      updated_at=now()
  WHERE p.source_id=v_source_id
    AND p.status='open'
    AND p.proposal_kind IN ('category_new','category_ambiguous')
    AND EXISTS (
      SELECT 1
      FROM public.catalog_source_category_mappings m
      WHERE m.source_taxonomy_node_id=p.source_taxonomy_node_id
        AND m.mapping_status='approved'
    );

  RETURN jsonb_build_object(
    'sourceId',v_source_id,
    'snapshotId',v_snapshot_id,
    'autoMappedCategories',v_auto_mapped,
    'categoryProposalsTouched',v_proposed
  );
END
$$;

CREATE OR REPLACE FUNCTION bls_private.refresh_catalog_attribute_intelligence(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_market_id uuid;
  v_snapshot_id uuid;
  v_rules_created integer := 0;
  v_observations_mapped integer := 0;
  v_proposed integer := 0;
BEGIN
  SELECT cs.id,cs.market_id
    INTO v_source_id,v_market_id
  FROM public.catalog_sources cs
  WHERE cs.code=p_source_code AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Active catalogue source % was not found',p_source_code;
  END IF;

  SELECT COALESCE(
    p_snapshot_id,
    (
      SELECT css.id
      FROM public.catalog_source_snapshots css
      WHERE css.source_id=v_source_id
      ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC
      LIMIT 1
    )
  ) INTO v_snapshot_id;

  IF v_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalog_source_snapshots
    WHERE id=v_snapshot_id AND source_id=v_source_id
  ) THEN
    RAISE EXCEPTION 'Catalogue snapshot was not found for source %',p_source_code;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog-attribute-intelligence:'||v_source_id::text));

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
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    LEFT JOIN public.catalog_source_category_mappings cm
      ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id
     AND cm.mapping_status='approved'
    WHERE sp.source_id=v_source_id
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
  type_context AS (
    SELECT
      s.*,
      count(DISTINCT cpt.product_type_id) OVER (
        PARTITION BY s.source_attribute_key,s.scope_kind,s.scope_key
      ) AS product_type_count,
      min(cpt.product_type_id) OVER (
        PARTITION BY s.source_attribute_key,s.scope_kind,s.scope_key
      ) AS only_product_type_id
    FROM scoped s
    LEFT JOIN public.category_product_types cpt ON cpt.category_id=s.category_id
    LEFT JOIN public.product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
    WHERE cpt.product_type_id IS NULL OR pt.id IS NOT NULL
  ),
  distinct_context AS (
    SELECT DISTINCT
      source_attribute_key,scope_kind,scope_key,category_id,
      product_type_count,only_product_type_id
    FROM type_context
  ),
  candidate_rows AS (
    SELECT
      dc.source_attribute_key,dc.scope_kind,dc.scope_key,dc.only_product_type_id,
      ad.id AS attribute_id,ad.data_type,
      COALESCE(pta.unit_override,ad.unit) AS effective_unit
    FROM distinct_context dc
    JOIN public.product_type_attributes pta
      ON pta.product_type_id=dc.only_product_type_id
    JOIN public.attribute_definitions ad
      ON ad.id=pta.attribute_id AND ad.active=true
    WHERE dc.product_type_count=1
      AND (
        bls_private.catalog_normalize_text(ad.code)=bls_private.catalog_normalize_text(dc.source_attribute_key)
        OR EXISTS (
          SELECT 1
          FROM public.attribute_translations at
          WHERE at.attribute_id=ad.id
            AND bls_private.catalog_normalize_text(at.label)=bls_private.catalog_normalize_text(dc.source_attribute_key)
        )
      )
  ),
  candidate_rollup AS (
    SELECT
      dc.source_attribute_key,dc.scope_kind,dc.scope_key,
      dc.product_type_count,dc.only_product_type_id,
      count(DISTINCT cr.attribute_id) AS candidate_count,
      min(cr.attribute_id) FILTER (WHERE cr.attribute_id IS NOT NULL) AS only_attribute_id,
      min(cr.data_type) FILTER (WHERE cr.attribute_id IS NOT NULL) AS data_type,
      min(cr.effective_unit) FILTER (WHERE cr.attribute_id IS NOT NULL) AS effective_unit
    FROM distinct_context dc
    LEFT JOIN candidate_rows cr
      ON cr.source_attribute_key=dc.source_attribute_key
     AND cr.scope_kind=dc.scope_kind
     AND cr.scope_key=dc.scope_key
    GROUP BY dc.source_attribute_key,dc.scope_kind,dc.scope_key,
             dc.product_type_count,dc.only_product_type_id
  ),
  compatible AS (
    SELECT
      cr.*,
      bool_and(
        bls_private.catalog_source_attribute_mapping_status(
          cr.data_type,cr.effective_unit,b.source_unit,b.raw_value,b.normalized_value
        )='mapped'
      ) AS all_values_compatible
    FROM candidate_rollup cr
    JOIN base b
      ON b.source_attribute_key=cr.source_attribute_key
     AND (
       (cr.scope_kind='taxonomy_node' AND b.source_taxonomy_node_id::text=cr.scope_key)
       OR
       (cr.scope_kind='source_category' AND b.source_taxonomy_node_id IS NULL AND b.provider_category=cr.scope_key)
     )
    WHERE cr.candidate_count=1
      AND cr.product_type_count=1
    GROUP BY cr.source_attribute_key,cr.scope_kind,cr.scope_key,
             cr.product_type_count,cr.only_product_type_id,
             cr.candidate_count,cr.only_attribute_id,cr.data_type,cr.effective_unit
  ),
  inserted AS (
    INSERT INTO public.catalog_source_attribute_mapping_rules(
      source_id,source_attribute_key,scope_kind,scope_key,
      product_type_id,attribute_id,status,mapping_method,reason,
      reviewed_by,reviewed_at,metadata,created_at,updated_at
    )
    SELECT
      v_source_id,c.source_attribute_key,c.scope_kind,c.scope_key,
      c.only_product_type_id,c.only_attribute_id,'approved','system_exact_context',
      'Unique normalized exact attribute match inside one active Product Type contract with compatible observed values',
      NULL,now(),
      jsonb_build_object(
        'autoApprovedBy','catalog_intelligence_v1',
        'policy','unique_normalized_exact_contract_match',
        'sourceCode',p_source_code,
        'snapshotId',v_snapshot_id
      ),
      now(),now()
    FROM compatible c
    WHERE c.all_values_compatible=true
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_source_attribute_mapping_rules existing
        WHERE existing.source_id=v_source_id
          AND existing.source_attribute_key=c.source_attribute_key
          AND existing.scope_kind=c.scope_kind
          AND existing.scope_key=c.scope_key
          AND existing.status='approved'
      )
    ON CONFLICT (source_id,source_attribute_key,scope_kind,scope_key)
      WHERE status='approved'
    DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rules_created FROM inserted;

  WITH updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=r.attribute_id,
        mapping_status=bls_private.catalog_source_attribute_mapping_status(
          ad.data_type,COALESCE(pta.unit_override,ad.unit),
          a.source_unit,a.raw_value,a.normalized_value
        ),
        confidence=CASE WHEN r.mapping_method='system_exact_context' THEN 1 ELSE a.confidence END,
        metadata=COALESCE(a.metadata,'{}'::jsonb)||jsonb_build_object(
          'mappingRuleId',r.id,
          'mappingMethod',r.mapping_method,
          'mappingScopeKind',r.scope_kind,
          'mappingScopeKey',r.scope_key,
          'productTypeId',r.product_type_id,
          'autoMapped',r.mapping_method='system_exact_context',
          'mappedAt',now()
        )
    FROM public.catalog_source_products sp
    JOIN public.catalog_source_attribute_mapping_rules r
      ON r.source_id=sp.source_id
     AND r.status='approved'
     AND (
       (r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
       OR
       (r.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
          NULLIF(btrim(sp.source_identity->>'categoryId'),''),
          NULLIF(btrim(sp.source_identity->>'category_id'),''),
          NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
       )=r.scope_key)
     )
    JOIN public.product_type_attributes pta
      ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
    JOIN public.attribute_definitions ad ON ad.id=r.attribute_id AND ad.active=true
    WHERE sp.id=a.source_product_id
      AND sp.source_id=v_source_id
      AND sp.snapshot_id=v_snapshot_id
      AND a.source_attribute_key=r.source_attribute_key
      AND a.mapping_status='unmapped'
      AND a.attribute_id IS NULL
    RETURNING a.id
  )
  SELECT count(*)::integer INTO v_observations_mapped FROM updated;

  WITH unresolved AS (
    SELECT
      a.source_attribute_key,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node' ELSE 'source_category' END AS scope_kind,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN sp.source_taxonomy_node_id::text ELSE COALESCE(
        NULLIF(btrim(sp.source_identity->>'categoryId'),''),
        NULLIF(btrim(sp.source_identity->>'category_id'),''),
        NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
      ) END AS scope_key,
      sp.source_taxonomy_node_id,
      cm.category_id,
      count(*) AS observation_count,
      array_agg(DISTINCT a.source_unit) FILTER (WHERE a.source_unit IS NOT NULL) AS source_units
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    LEFT JOIN public.catalog_source_category_mappings cm
      ON cm.source_taxonomy_node_id=sp.source_taxonomy_node_id
     AND cm.mapping_status='approved'
    WHERE sp.source_id=v_source_id
      AND sp.snapshot_id=v_snapshot_id
      AND a.mapping_status='unmapped'
      AND a.attribute_id IS NULL
    GROUP BY a.source_attribute_key,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node' ELSE 'source_category' END,
      CASE WHEN sp.source_taxonomy_node_id IS NOT NULL THEN sp.source_taxonomy_node_id::text ELSE COALESCE(
        NULLIF(btrim(sp.source_identity->>'categoryId'),''),
        NULLIF(btrim(sp.source_identity->>'category_id'),''),
        NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
      ) END,
      sp.source_taxonomy_node_id,cm.category_id
  ),
  type_counts AS (
    SELECT
      u.*,
      count(DISTINCT pt.id) AS product_type_count,
      min(pt.id) AS only_product_type_id
    FROM unresolved u
    LEFT JOIN public.category_product_types cpt ON cpt.category_id=u.category_id
    LEFT JOIN public.product_types pt ON pt.id=cpt.product_type_id AND pt.status='active'
    GROUP BY u.source_attribute_key,u.scope_kind,u.scope_key,u.source_taxonomy_node_id,
             u.category_id,u.observation_count,u.source_units
  ),
  candidates AS (
    SELECT
      tc.source_attribute_key,tc.scope_kind,tc.scope_key,
      ad.id AS attribute_id
    FROM type_counts tc
    JOIN public.product_type_attributes pta
      ON pta.product_type_id=tc.only_product_type_id
    JOIN public.attribute_definitions ad
      ON ad.id=pta.attribute_id AND ad.active=true
    WHERE tc.product_type_count=1
      AND (
        bls_private.catalog_normalize_text(ad.code)=bls_private.catalog_normalize_text(tc.source_attribute_key)
        OR EXISTS (
          SELECT 1 FROM public.attribute_translations at
          WHERE at.attribute_id=ad.id
            AND bls_private.catalog_normalize_text(at.label)=bls_private.catalog_normalize_text(tc.source_attribute_key)
        )
      )
  ),
  proposal_rows AS (
    SELECT
      tc.*,
      count(DISTINCT c.attribute_id) AS candidate_count,
      min(c.attribute_id) AS candidate_attribute_id,
      COALESCE(jsonb_agg(DISTINCT c.attribute_id) FILTER (WHERE c.attribute_id IS NOT NULL),'[]'::jsonb) AS candidates
    FROM type_counts tc
    LEFT JOIN candidates c
      ON c.source_attribute_key=tc.source_attribute_key
     AND c.scope_kind=tc.scope_kind
     AND c.scope_key IS NOT DISTINCT FROM tc.scope_key
    GROUP BY tc.source_attribute_key,tc.scope_kind,tc.scope_key,tc.source_taxonomy_node_id,
             tc.category_id,tc.observation_count,tc.source_units,
             tc.product_type_count,tc.only_product_type_id
  ),
  upserted AS (
    INSERT INTO public.catalog_intelligence_proposals(
      market_id,source_id,snapshot_id,proposal_kind,fingerprint,
      source_taxonomy_node_id,source_attribute_key,scope_kind,scope_key,
      candidate_category_id,candidate_attribute_id,candidate_product_type_id,
      confidence,proposed_payload,evidence,last_seen_at,updated_at
    )
    SELECT
      v_market_id,v_source_id,v_snapshot_id,
      CASE
        WHEN pr.category_id IS NULL OR pr.product_type_count<>1 THEN 'attribute_contract_missing'
        WHEN pr.candidate_count>1 THEN 'attribute_ambiguous'
        ELSE 'attribute_new'
      END,
      'attribute:'||v_source_id::text||':'||
        encode(digest(
          coalesce(pr.scope_kind,'')||':'||coalesce(pr.scope_key,'')||':'||
          bls_private.catalog_normalize_text(pr.source_attribute_key),'sha256'
        ),'hex'),
      pr.source_taxonomy_node_id,pr.source_attribute_key,pr.scope_kind,pr.scope_key,
      pr.category_id,
      CASE WHEN pr.candidate_count=1 THEN pr.candidate_attribute_id ELSE NULL END,
      CASE WHEN pr.product_type_count=1 THEN pr.only_product_type_id ELSE NULL END,
      CASE WHEN pr.candidate_count>1 THEN 0.50000 ELSE 0.00000 END,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceAttributeKey',pr.source_attribute_key,
        'sourceUnits',to_jsonb(pr.source_units),
        'suggestedProductTypeId',CASE WHEN pr.product_type_count=1 THEN pr.only_product_type_id ELSE NULL END
      )),
      jsonb_build_object(
        'observationCount',pr.observation_count,
        'productTypeCount',pr.product_type_count,
        'candidateCount',pr.candidate_count,
        'candidates',pr.candidates,
        'policy','catalog_intelligence_v1'
      ),
      now(),now()
    FROM proposal_rows pr
    ON CONFLICT (fingerprint) DO UPDATE
    SET snapshot_id=EXCLUDED.snapshot_id,
        proposal_kind=EXCLUDED.proposal_kind,
        candidate_category_id=EXCLUDED.candidate_category_id,
        candidate_attribute_id=EXCLUDED.candidate_attribute_id,
        candidate_product_type_id=EXCLUDED.candidate_product_type_id,
        confidence=EXCLUDED.confidence,
        proposed_payload=EXCLUDED.proposed_payload,
        evidence=EXCLUDED.evidence,
        occurrence_count=public.catalog_intelligence_proposals.occurrence_count+1,
        last_seen_at=now(),
        updated_at=now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_proposed FROM upserted;

  UPDATE public.catalog_intelligence_proposals p
  SET status='auto_resolved',
      reviewed_at=COALESCE(reviewed_at,now()),
      resolution=resolution||jsonb_build_object(
        'resolvedBy','catalog_intelligence_v1',
        'reason','approved_attribute_mapping_rule_exists'
      ),
      updated_at=now()
  WHERE p.source_id=v_source_id
    AND p.status='open'
    AND p.proposal_kind IN ('attribute_new','attribute_ambiguous','attribute_contract_missing')
    AND EXISTS (
      SELECT 1
      FROM public.catalog_source_attribute_mapping_rules r
      WHERE r.source_id=p.source_id
        AND r.source_attribute_key=p.source_attribute_key
        AND r.scope_kind=p.scope_kind
        AND r.scope_key=p.scope_key
        AND r.status='approved'
    );

  RETURN jsonb_build_object(
    'sourceId',v_source_id,
    'snapshotId',v_snapshot_id,
    'autoCreatedAttributeRules',v_rules_created,
    'autoMappedAttributeObservations',v_observations_mapped,
    'attributeProposalsTouched',v_proposed
  );
END
$$;

CREATE OR REPLACE FUNCTION bls_private.refresh_catalog_intelligence(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_categories jsonb;
  v_attributes jsonb;
BEGIN
  v_categories:=bls_private.refresh_catalog_category_intelligence(p_source_code,p_snapshot_id);
  v_attributes:=bls_private.refresh_catalog_attribute_intelligence(
    p_source_code,
    COALESCE(p_snapshot_id,(v_categories->>'snapshotId')::uuid)
  );
  RETURN jsonb_build_object(
    'sourceCode',p_source_code,
    'categoryIntelligence',v_categories,
    'attributeIntelligence',v_attributes
  );
END
$$;

CREATE OR REPLACE FUNCTION bls_private.approve_catalog_intelligence_proposal(
  p_proposal_id uuid,
  p_actor_user_id uuid,
  p_target_category_id uuid DEFAULT NULL,
  p_target_attribute_id uuid DEFAULT NULL,
  p_target_product_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  p public.catalog_intelligence_proposals%ROWTYPE;
  v_category_id uuid;
  v_attribute_id uuid;
  v_product_type_id uuid;
  v_rule_id uuid;
BEGIN
  SELECT * INTO p
  FROM public.catalog_intelligence_proposals
  WHERE id=p_proposal_id
  FOR UPDATE;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Catalogue intelligence proposal not found';
  END IF;
  IF p.status<>'open' THEN
    RAISE EXCEPTION 'Only open catalogue intelligence proposals can be approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_actor_user_id) THEN
    RAISE EXCEPTION 'Approval actor was not found';
  END IF;

  IF p.proposal_kind IN ('category_new','category_ambiguous') THEN
    v_category_id:=COALESCE(p_target_category_id,p.candidate_category_id);
    IF v_category_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id=v_category_id
        AND c.active=true
        AND c.assignable=true
        AND (c.market_id IS NULL OR c.market_id=p.market_id)
    ) THEN
      RAISE EXCEPTION 'An active assignable target category in the proposal market is required';
    END IF;

    UPDATE public.catalog_source_category_mappings
    SET mapping_status='superseded',
        updated_at=now(),
        metadata=metadata||jsonb_build_object(
          'supersededBy','catalog_intelligence_admin_approval',
          'proposalId',p.id
        )
    WHERE source_taxonomy_node_id=p.source_taxonomy_node_id
      AND mapping_status='candidate'
      AND category_id<>v_category_id;

    INSERT INTO public.catalog_source_category_mappings(
      source_taxonomy_node_id,category_id,mapping_status,mapping_method,
      confidence,reason,reviewed_by,reviewed_at,metadata,created_at,updated_at
    )
    VALUES(
      p.source_taxonomy_node_id,v_category_id,'approved','manual',
      1,'Approved from catalogue intelligence proposal',
      p_actor_user_id,now(),
      jsonb_build_object('proposalId',p.id,'approvedBy','catalog_intelligence_admin'),
      now(),now()
    )
    ON CONFLICT (source_taxonomy_node_id) WHERE mapping_status='approved'
    DO UPDATE SET
      category_id=EXCLUDED.category_id,
      mapping_method='manual',
      confidence=1,
      reason=EXCLUDED.reason,
      reviewed_by=p_actor_user_id,
      reviewed_at=now(),
      metadata=public.catalog_source_category_mappings.metadata||
        jsonb_build_object('proposalId',p.id,'approvedBy','catalog_intelligence_admin'),
      updated_at=now();

    UPDATE public.catalog_intelligence_proposals
    SET status='approved',candidate_category_id=v_category_id,
        reviewed_by=p_actor_user_id,reviewed_at=now(),
        resolution=jsonb_build_object('categoryId',v_category_id,'action','map_existing'),
        updated_at=now()
    WHERE id=p.id;

    RETURN jsonb_build_object(
      'proposalId',p.id,'status','approved','categoryId',v_category_id
    );
  END IF;

  v_attribute_id:=COALESCE(p_target_attribute_id,p.candidate_attribute_id);
  v_product_type_id:=COALESCE(p_target_product_type_id,p.candidate_product_type_id);

  IF v_attribute_id IS NULL OR v_product_type_id IS NULL THEN
    RAISE EXCEPTION 'Target attribute and Product Type are required for attribute proposal approval';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_type_attributes pta
    JOIN public.product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    WHERE pta.product_type_id=v_product_type_id
      AND pta.attribute_id=v_attribute_id
  ) THEN
    RAISE EXCEPTION 'Target attribute is not allowed by the selected active Product Type contract';
  END IF;

  INSERT INTO public.catalog_source_attribute_mapping_rules(
    source_id,source_attribute_key,scope_kind,scope_key,
    product_type_id,attribute_id,status,mapping_method,reason,
    reviewed_by,reviewed_at,metadata,created_at,updated_at
  )
  VALUES(
    p.source_id,p.source_attribute_key,p.scope_kind,p.scope_key,
    v_product_type_id,v_attribute_id,'approved','admin_exact_context',
    'Approved from catalogue intelligence proposal',
    p_actor_user_id,now(),
    jsonb_build_object('proposalId',p.id,'approvedBy','catalog_intelligence_admin'),
    now(),now()
  )
  ON CONFLICT (source_id,source_attribute_key,scope_kind,scope_key)
    WHERE status='approved'
  DO UPDATE SET
    product_type_id=EXCLUDED.product_type_id,
    attribute_id=EXCLUDED.attribute_id,
    mapping_method='admin_exact_context',
    reason=EXCLUDED.reason,
    reviewed_by=p_actor_user_id,
    reviewed_at=now(),
    metadata=public.catalog_source_attribute_mapping_rules.metadata||
      jsonb_build_object('proposalId',p.id,'approvedBy','catalog_intelligence_admin'),
    updated_at=now()
  RETURNING id INTO v_rule_id;

  PERFORM bls_private.backfill_catalog_source_attribute_mapping_rule(v_rule_id,p_actor_user_id);

  UPDATE public.catalog_intelligence_proposals
  SET status='approved',candidate_attribute_id=v_attribute_id,
      candidate_product_type_id=v_product_type_id,
      reviewed_by=p_actor_user_id,reviewed_at=now(),
      resolution=jsonb_build_object(
        'attributeId',v_attribute_id,
        'productTypeId',v_product_type_id,
        'mappingRuleId',v_rule_id,
        'action','map_existing'
      ),
      updated_at=now()
  WHERE id=p.id;

  RETURN jsonb_build_object(
    'proposalId',p.id,'status','approved',
    'attributeId',v_attribute_id,'productTypeId',v_product_type_id,
    'mappingRuleId',v_rule_id
  );
END
$$;

CREATE OR REPLACE FUNCTION bls_private.reject_catalog_intelligence_proposal(
  p_proposal_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF p_reason IS NULL OR btrim(p_reason)='' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE public.catalog_intelligence_proposals
  SET status='rejected',
      reviewed_by=p_actor_user_id,
      reviewed_at=now(),
      resolution=jsonb_build_object('action','reject','reason',btrim(p_reason)),
      updated_at=now()
  WHERE id=p_proposal_id
    AND status='open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open catalogue intelligence proposal not found';
  END IF;

  RETURN jsonb_build_object('proposalId',p_proposal_id,'status','rejected');
END
$$;

REVOKE ALL ON FUNCTION bls_private.refresh_catalog_category_intelligence(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.refresh_catalog_attribute_intelligence(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.refresh_catalog_intelligence(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.approve_catalog_intelligence_proposal(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.reject_catalog_intelligence_proposal(uuid,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bls_private.refresh_catalog_category_intelligence(text,uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.refresh_catalog_attribute_intelligence(text,uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.refresh_catalog_intelligence(text,uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.approve_catalog_intelligence_proposal(uuid,uuid,uuid,uuid,uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.reject_catalog_intelligence_proposal(uuid,uuid,text) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.refresh_catalog_intelligence(text,uuid) IS
  'Runs deterministic catalogue intelligence. Unique normalized exact matches may auto-map into existing canonical categories and Product Type attribute contracts; unresolved or ambiguous structure is persisted as governed proposals.';
COMMENT ON FUNCTION bls_private.approve_catalog_intelligence_proposal(uuid,uuid,uuid,uuid,uuid) IS
  'Approves a catalogue intelligence proposal by binding it to existing governed canonical structure and creating a reusable source mapping. Canonical structure creation remains a separate explicit admin action.';

COMMIT;
