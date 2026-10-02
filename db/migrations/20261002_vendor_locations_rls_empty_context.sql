-- Harden vendor_locations RLS against an unset vendor session context.
-- Platform-runtime jobs intentionally run without app.vendor_id. PostgreSQL may
-- evaluate both sides of an OR policy expression, so casting current_setting()
-- directly can raise 22P02 on the empty string before the platform bypass wins.

ALTER POLICY vendor_locations_vendor_read
ON public.vendor_locations
USING (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);

ALTER POLICY vendor_locations_vendor_insert
ON public.vendor_locations
WITH CHECK (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);

ALTER POLICY vendor_locations_vendor_update
ON public.vendor_locations
USING (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
)
WITH CHECK (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);
