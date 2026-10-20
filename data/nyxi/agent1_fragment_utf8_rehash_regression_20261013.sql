-- NYXI Agent 1 | #1460 #1444 | 2026-10-13 | READ ONLY
-- Independently hash UTF-8 fragment body_text in PostgreSQL. Does NOT rehash
-- original archived Storage bytes or authorize public publication.
-- No private body_text is returned by either query.
WITH checked AS (
  SELECT f.id, f.body_text, f.content_sha256,
         s.id AS matched_snapshot,
         encode(digest(convert_to(f.body_text,'UTF8'),'sha256'),'hex') AS recomputed_sha256
  FROM public.nyxi_evidence_fragments f
  LEFT JOIN public.nyxi_source_snapshots s
    ON s.id=f.snapshot_id AND s.source_id=f.source_id
)
SELECT count(*) AS private_fragment_count,
       count(*) FILTER (WHERE recomputed_sha256 IS DISTINCT FROM content_sha256) AS hash_mismatches,
       count(*) FILTER (WHERE matched_snapshot IS NULL) AS provenance_mismatches,
       count(*) FILTER (WHERE body_text IS NULL OR btrim(body_text)='') AS empty_bodies,
       count(*) FILTER (WHERE content_sha256 IS NULL) AS missing_hashes
FROM checked;

-- Four synthetic cases: a changed body, a changed digest and a missing digest
-- MUST all fail closed. The valid case MUST pass.
WITH cases(label,body,expected,should_pass) AS (
  VALUES
  ('valid','abc'::text,encode(digest(convert_to('abc','UTF8'),'sha256'),'hex'),true),
  ('changed_body','abcd',encode(digest(convert_to('abc','UTF8'),'sha256'),'hex'),false),
  ('changed_hash','abc',repeat('0',64),false),
  ('missing_hash','abc',NULL::text,false)
)
SELECT label,
       (coalesce(encode(digest(convert_to(body,'UTF8'),'sha256'),'hex')=expected,false)
        IS NOT DISTINCT FROM should_pass) AS test_pass
FROM cases ORDER BY label;

-- Additional release gates (not covered): original Storage-byte SHA-256,
-- authenticated independent rights clearance, reviewer gate, revocation,
-- public-search/RLS negative tests, working citation anchors.
