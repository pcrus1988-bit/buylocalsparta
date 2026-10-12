-- PostgreSQL regex interval quantifiers are capped at 255.
-- Replace the invalid {5,500} URL check with bounded length and safe regex checks.
ALTER TABLE research_private.hub_gemi_address_source_evidence
 DROP CONSTRAINT IF EXISTS hub_gemi_address_source_evidence_source_url_check;
ALTER TABLE research_private.hub_gemi_address_source_evidence
 ADD CONSTRAINT hub_gemi_address_source_evidence_source_url_check
 CHECK (
   length(source_url) BETWEEN 13 AND 1024
   AND source_url LIKE 'https://%'
   AND source_url !~ '[[:space:]]'
 );
