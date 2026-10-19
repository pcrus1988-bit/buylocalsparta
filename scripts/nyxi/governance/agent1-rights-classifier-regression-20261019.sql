-- NYXI Agent 1: read-only rights classifier regression fixtures.
WITH cases(label, receipt, expected_ai, expected_missing) AS (
 VALUES ('AI-assisted', NULL::text, true, true),
        ('Agent 1', NULL::text, true, true),
        ('independent reviewer', repeat('a',64), false, false),
        ('independent reviewer', NULL::text, false, true)
), classified AS (
 SELECT *, coalesce(label,'') ~* '(ai[ _-]?assisted|agent|bot|worker|automation|model)' AS actual_ai,
   NOT (coalesce(receipt,'') ~ '^[0-9a-f]{64}$') AS actual_missing
 FROM cases
)
SELECT count(*) AS fixtures, count(*) FILTER (WHERE actual_ai=expected_ai AND actual_missing=expected_missing) AS passed FROM classified;
