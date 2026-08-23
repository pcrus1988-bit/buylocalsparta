-- Buy Local Sparta — structured-data observations on immutable SEO crawl evidence.
-- Historical crawl rows remain nullable/unknown; new crawler runs record JSON-LD coverage
-- without mutating any previously captured evidence.

BEGIN;

ALTER TABLE seo_crawl_results
  ADD COLUMN structured_data_count integer,
  ADD COLUMN structured_data_types jsonb,
  ADD COLUMN structured_data_parse_error_count integer;

ALTER TABLE seo_crawl_results
  ADD CONSTRAINT seo_crawl_results_structured_data_count_check
    CHECK (structured_data_count IS NULL OR structured_data_count >= 0),
  ADD CONSTRAINT seo_crawl_results_structured_data_types_check
    CHECK (structured_data_types IS NULL OR jsonb_typeof(structured_data_types) = 'array'),
  ADD CONSTRAINT seo_crawl_results_structured_data_parse_error_count_check
    CHECK (structured_data_parse_error_count IS NULL OR structured_data_parse_error_count >= 0),
  ADD CONSTRAINT seo_crawl_results_structured_data_consistency_check
    CHECK (
      (structured_data_count IS NULL AND structured_data_types IS NULL AND structured_data_parse_error_count IS NULL)
      OR
      (structured_data_count IS NOT NULL AND structured_data_types IS NOT NULL AND structured_data_parse_error_count IS NOT NULL)
    );

COMMENT ON COLUMN seo_crawl_results.structured_data_count IS
  'Number of application/ld+json script blocks observed in this immutable production crawl result; NULL means the historical crawler did not capture structured-data evidence.';
COMMENT ON COLUMN seo_crawl_results.structured_data_types IS
  'Distinct schema.org @type values recursively observed in parsed JSON-LD blocks for this crawl result.';
COMMENT ON COLUMN seo_crawl_results.structured_data_parse_error_count IS
  'Number of application/ld+json blocks that could not be parsed as JSON during this crawl result.';

COMMIT;
