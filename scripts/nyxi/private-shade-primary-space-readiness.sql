-- NYXI Agent 3 | PRIVATE, READ-ONLY primary color-space integrity diagnostic.
-- No private IDs, source URLs, fragment text, or publishable claims.
-- A valid HEX or other color tuple cannot substitute for the declared primary space.
-- 'derived' is deliberately agnostic; physical calibration remains unverified.
WITH measurements AS (
 SELECT
  (CASE color_space
    WHEN 'oklab' THEN oklab_l IS NOT NULL AND oklab_a IS NOT NULL AND oklab_b IS NOT NULL
    WHEN 'cielab' THEN lab_l IS NOT NULL AND lab_a IS NOT NULL AND lab_b IS NOT NULL
    WHEN 'derived' THEN TRUE
    ELSE FALSE
  END) IS TRUE AS declared_primary_tuple_complete,
  (
    (derived_hex IS NULL OR (derived_hex ~ '^#[0-9a-fA-F]{6}$') IS TRUE)
    AND (
      (lab_l IS NULL AND lab_a IS NULL AND lab_b IS NULL)
      OR (lab_l BETWEEN 0 AND 100 AND lab_a BETWEEN -200 AND 200 AND lab_b BETWEEN -200 AND 200) IS TRUE
    )
    AND (
      (oklab_l IS NULL AND oklab_a IS NULL AND oklab_b IS NULL)
      OR (oklab_l BETWEEN 0 AND 1 AND oklab_a BETWEEN -1 AND 1 AND oklab_b BETWEEN -1 AND 1) IS TRUE
    )
    AND (derived_hex IS NOT NULL OR lab_l IS NOT NULL OR lab_a IS NOT NULL OR lab_b IS NOT NULL
         OR oklab_l IS NOT NULL OR oklab_a IS NOT NULL OR oklab_b IS NOT NULL)
  ) IS TRUE AS supplied_color_tuple_valid
 FROM public.nyxi_shade_measurements
)
SELECT count(*) AS inspected_measurements,
 count(*) FILTER (WHERE declared_primary_tuple_complete IS NOT TRUE) AS missing_declared_primary_tuple,
 count(*) FILTER (WHERE supplied_color_tuple_valid IS NOT TRUE) AS malformed_or_missing_color_tuples,
 false AS physical_calibration_established,
 false AS independent_review_established,
 false AS publication_authorized
FROM measurements;
