-- KONTA MOY — vendor Instagram storefront connection metadata and encrypted OAuth token storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_instagram_connections (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text NOT NULL,
  account_type text,
  profile_picture_url text,
  access_token_ciphertext text NOT NULL,
  token_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_instagram_connections_username_check
    CHECK (username ~ '^[A-Za-z0-9._]{1,30}$'),
  CONSTRAINT vendor_instagram_connections_account_type_check
    CHECK (account_type IS NULL OR account_type IN ('BUSINESS','MEDIA_CREATOR','CREATOR'))
);

ALTER TABLE public.vendor_instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_instagram_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.vendor_instagram_connections FROM PUBLIC;
REVOKE ALL ON public.vendor_instagram_connections FROM anon;
REVOKE ALL ON public.vendor_instagram_connections FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_instagram_connections TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_instagram_connections TO bls_platform_runtime;

DROP POLICY IF EXISTS vendor_instagram_connections_scope ON public.vendor_instagram_connections;
CREATE POLICY vendor_instagram_connections_scope
ON public.vendor_instagram_connections
FOR ALL
TO bls_app_runtime
USING (
  (SELECT bls_private.is_platform_runtime())
  OR vendor_id = (SELECT bls_private.current_vendor_scope_id())
)
WITH CHECK (
  (SELECT bls_private.is_platform_runtime())
  OR vendor_id = (SELECT bls_private.current_vendor_scope_id())
);

DROP POLICY IF EXISTS vendor_instagram_connections_platform ON public.vendor_instagram_connections;
CREATE POLICY vendor_instagram_connections_platform
ON public.vendor_instagram_connections
FOR ALL
TO bls_platform_runtime
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.vendor_instagram_connections IS
  'Vendor-scoped Instagram professional account connection for storefront media. OAuth tokens are application-encrypted and never returned to browser clients.';
COMMENT ON COLUMN public.vendor_instagram_connections.access_token_ciphertext IS
  'AES-256-GCM encrypted long-lived Instagram access token. Decryption key is derived server-side from BLS_AUTH_SECRET.';

COMMIT;
