-- FISCAL milestone 13: legal research references and unapproved, versioned rule candidates.
-- NEVER interpret a source link, an internal review or a proposed rate as authorization
-- to calculate, issue, classify or send a lawful Greek tax document.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_regulatory_sources (
 code text PRIMARY KEY CHECK(code ~ '^[a-z0-9_]{6,80}$'),
 topic text NOT NULL CHECK(topic IN ('vat','mydata','b2g','provider_certification','cross_border')),
 authority text NOT NULL CHECK(authority IN ('aade','eu_commission')),
 title text NOT NULL CHECK(length(title) BETWEEN 8 AND 240),
 source_url text NOT NULL CHECK(
  length(source_url) <= 500 AND (
   source_url LIKE 'https://www.aade.gr/%' OR
   source_url LIKE 'https://aade.gr/%' OR
   source_url LIKE 'https://ec.europa.eu/%'
  )
 ),
 research_note text NOT NULL CHECK(length(research_note) BETWEEN 8 AND 1500),
 source_version text,
 evidence_sha256 char(64) CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 evidence_state text NOT NULL DEFAULT 'reference_only'
  CHECK(evidence_state IN ('reference_only','archived_unreviewed')),
 reviewer_approved boolean NOT NULL DEFAULT false CHECK(reviewer_approved=false),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- No approved state exists in this schema by design. Future approval needs a
-- separate, security-reviewed migration and accountant/regulatory sign-off.
CREATE TABLE IF NOT EXISTS fiscal_tax_rule_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_code text NOT NULL CHECK(candidate_code ~ '^[a-z0-9_]{6,80}$'),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 100000),
 jurisdiction char(2) NOT NULL DEFAULT 'GR' CHECK(jurisdiction='GR'),
 lane text NOT NULL CHECK(lane IN ('b2c','pos','b2b','b2g')),
 rule_family text NOT NULL CHECK(rule_family IN (
  'vat_rate','vat_exemption','mydata_classification','counterparty_identity','public_routing'
 )),
 subject_code text NOT NULL CHECK(length(subject_code) BETWEEN 2 AND 120),
 proposed_rate_bps integer CHECK(proposed_rate_bps BETWEEN 0 AND 10000),
 valid_from date NOT NULL,
 valid_until date,
 source_code text NOT NULL REFERENCES fiscal_regulatory_sources(code),
 rationale text NOT NULL CHECK(length(rationale) BETWEEN 20 AND 2000),
 evidence_sha256 char(64) CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'research_only' CHECK(state='research_only'),
 fiscal_use_authorized boolean NOT NULL DEFAULT false CHECK(fiscal_use_authorized=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(candidate_code,version),
 CHECK(valid_until IS NULL OR valid_until>valid_from),
 CHECK(rule_family='vat_rate' OR proposed_rate_bps IS NULL)
);
CREATE INDEX IF NOT EXISTS fiscal_tax_rule_candidate_lookup_idx
 ON fiscal_tax_rule_candidates(jurisdiction,lane,rule_family,subject_code,valid_from DESC);
CREATE OR REPLACE FUNCTION fiscal_regulatory_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal legal research entries are immutable; create a new version'; END; $$;
DROP TRIGGER IF EXISTS fiscal_regulatory_sources_immutable ON fiscal_regulatory_sources;
CREATE TRIGGER fiscal_regulatory_sources_immutable BEFORE UPDATE OR DELETE ON fiscal_regulatory_sources
 FOR EACH ROW EXECUTE FUNCTION fiscal_regulatory_immutable();
DROP TRIGGER IF EXISTS fiscal_tax_rule_candidates_immutable ON fiscal_tax_rule_candidates;
CREATE TRIGGER fiscal_tax_rule_candidates_immutable BEFORE UPDATE OR DELETE ON fiscal_tax_rule_candidates
 FOR EACH ROW EXECUTE FUNCTION fiscal_regulatory_immutable();
ALTER TABLE fiscal_regulatory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_tax_rule_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fiscal_regulatory_sources,fiscal_tax_rule_candidates FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE fiscal_regulatory_sources,fiscal_tax_rule_candidates FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE fiscal_regulatory_sources,fiscal_tax_rule_candidates FROM authenticated;
 END IF;
END; $$;
-- Only the website references were researched; no law PDF or immutable source bytes
-- have been archived. A URL alone must never be considered evidence verification.
INSERT INTO fiscal_regulatory_sources(code,topic,authority,title,source_url,research_note)
VALUES
 ('aade_vat_guidance','vat','aade','ΑΑΔΕ · Βασικοί συντελεστές ΦΠΑ',
  'https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/basikoi-syntelestes-fpa',
  'Rates and exceptions require supply-specific and effective-date checks. This is a source pointer, not an approved classification.'),
 ('aade_mydata_home','mydata','aade','ΑΑΔΕ · myDATA',
  'https://aade.gr/mydata',
  'Certification, ERP/provider transmission routes and versioned specifications are separate workflows.'),
 ('eu_tedb_vat','cross_border','eu_commission','European Commission · Taxes in Europe (TEDB)',
  'https://ec.europa.eu/taxation_customs/tedb/index.html',
  'EU VAT research database. Scope and exceptions must be verified; this pointer is not an approval to issue.')
ON CONFLICT(code) DO NOTHING;
COMMIT;
