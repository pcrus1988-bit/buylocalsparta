-- Avoid a recursive category-ancestor walk for every storefront offer when the
-- vendor has no hidden category overrides. The fallback branch preserves the
-- existing ancestor semantics exactly for vendors that do have hidden rules.

BEGIN;

CREATE INDEX IF NOT EXISTS vendor_category_visibility_hidden_vendor_idx
  ON public.vendor_category_visibility(vendor_id, category_id)
  WHERE visible = false;

CREATE OR REPLACE FUNCTION bls_private.vendor_category_effectively_visible(
  p_vendor_id uuid,
  p_category_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'bls_private', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.vendor_category_visibility existing_hidden
      WHERE existing_hidden.vendor_id = p_vendor_id
        AND existing_hidden.visible = false
    ) THEN true
    ELSE NOT EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT c.id, c.parent_id
        FROM public.categories c
        WHERE c.id = p_category_id

        UNION ALL

        SELECT parent.id, parent.parent_id
        FROM public.categories parent
        JOIN ancestors child ON child.parent_id = parent.id
      )
      SELECT 1
      FROM ancestors a
      JOIN public.vendor_category_visibility vcv
        ON vcv.category_id = a.id
       AND vcv.vendor_id = p_vendor_id
      WHERE vcv.visible = false
    )
  END;
$function$;

COMMIT;
