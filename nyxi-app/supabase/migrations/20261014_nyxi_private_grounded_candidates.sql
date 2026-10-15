-- NYXI grounded PRIVATE candidate graph — conservative 4-pair bootstrap.
-- Existing human-independent acquisition only permits private analysis, NOT publication.
-- RLS-denied graph data never feeds consumer advice until separate human approval.
-- No inferred medical/safety claims, unverified colors, or unlinked semantic edges.

CREATE TEMP TABLE nyxi_20261014_private_candidates ON COMMIT DROP AS
SELECT DISTINCT
  q.fragment_id, q.source_id, q.snapshot_id,
  q.snapshot_sha256, q.fragment_sha256,
  rules.ingredient_key, rules.ingredient_label,
  rules.category_key, rules.category_label
FROM public.nyxi_private_review_queue_v1 q
JOIN public.nyxi_sources s
  ON s.id=q.source_id AND s.source_key='us-fda-nail-care-products'
JOIN (
  VALUES
  ('ingredient:acetonitrile', 'Acetonitrile',
   'product-category:artificial-nail-remover', 'Artificial nail remover',
   'acetonitrile', 'artificial nail removers?'),
  ('ingredient:toluene-sulfonamide-formaldehyde-resin', 'Toluene sulfonamide/formaldehyde resin',
   'product-category:nail-polish', 'Nail polish',
   'toluene sulfonamide/formaldehyde resin', 'nail polishes?'),
  ('ingredient:methyl-methacrylate-monomer', 'Methyl methacrylate monomer',
   'product-category:artificial-nail', 'Artificial nail',
   'methyl methacrylate monomer', 'artificial nails?'),
  ('ingredient:methacrylic-acid', 'Methacrylic acid',
   'product-category:nail-primer', 'Nail primer',
   'methacrylic acid', 'nail primers?')
) AS rules(ingredient_key,ingredient_label,category_key,category_label,ingredient_rx,category_rx)
  ON q.excerpt ~* rules.ingredient_rx AND q.excerpt ~* rules.category_rx
WHERE q.quality_lane='human_evidence_review'
  AND q.text_length >= 90
  AND q.fragment_sha256 ~ '^[0-9a-f]{64}$'
  AND q.snapshot_sha256 ~ '^[0-9a-f]{64}$';

-- Canonical, idempotent private nodes. Existing curated nodes are NEVER overwritten.
INSERT INTO public.nyxi_entities (entity_type, canonical_key, label, properties)
SELECT DISTINCT entity_type, canonical_key, label,
       jsonb_build_object(
        'lifecycle','candidate','review_required',true,
        'visibility','private','grounding','exact-phrase',
        'parser','nyxi-private-phrase-context-v1')
FROM (
 SELECT 'ingredient'::text AS entity_type, ingredient_key AS canonical_key,
        ingredient_label AS label FROM nyxi_20261014_private_candidates
 UNION ALL
 SELECT 'product_category', category_key, category_label
 FROM nyxi_20261014_private_candidates
) nodes
ON CONFLICT (canonical_key) DO NOTHING;

-- Link each candidate BOTH to exact immutable snapshot and fragment hash.
-- A mention is not an assertion of safety, regulatory status or product composition.
INSERT INTO public.nyxi_entity_evidence
  (entity_id, fragment_id, evidence_role, confidence, metadata)
SELECT DISTINCT e.id, c.fragment_id, 'candidate_mention', 0.55,
       jsonb_build_object(
         'review_status','pending','not_for_publication',true,
         'extractor','nyxi-private-phrase-context-v1',
         'snapshot_sha256',c.snapshot_sha256,
         'fragment_sha256',c.fragment_sha256)
FROM nyxi_20261014_private_candidates c
JOIN public.nyxi_entities e
  ON e.canonical_key=c.ingredient_key OR e.canonical_key=c.category_key
ON CONFLICT (entity_id,fragment_id,evidence_role) DO NOTHING;

-- Edge predicate deliberately says only what source proves: discussed in
-- the context of a product class. It does NOT assert safe use or general inclusion.
INSERT INTO public.nyxi_graph_edges
  (from_entity_id,to_entity_id,predicate,fragment_id,snapshot_id,source_id,
   confidence,metadata)
SELECT DISTINCT i.id, cat.id, 'discussed_in_context_of',
       c.fragment_id,c.snapshot_id,c.source_id,0.55,
       jsonb_build_object(
         'review_status','pending','not_for_publication',true,
         'extractor','nyxi-private-phrase-context-v1',
         'snapshot_sha256',c.snapshot_sha256,
         'fragment_sha256',c.fragment_sha256)
FROM nyxi_20261014_private_candidates c
JOIN public.nyxi_entities i ON i.canonical_key=c.ingredient_key
JOIN public.nyxi_entities cat ON cat.canonical_key=c.category_key
ON CONFLICT (from_entity_id,to_entity_id,predicate,fragment_id) DO NOTHING;

DROP TABLE nyxi_20261014_private_candidates;
