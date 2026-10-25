-- MAZI 024: append-only official registry rechecks for immutable AFM applications.
-- Intake facts and review history remain immutable. Only marketplace Super Admin
-- server-side PostgreSQL may add verified GEMI lookups to this table.
CREATE TABLE public.mazi_interest_registry_rechecks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 interest_id uuid NOT NULL REFERENCES public.mazi_interest_applications(id),
 tax_number text NOT NULL CHECK (tax_number ~ '^[0-9]{9}$'),
 gemi_number text NOT NULL CHECK (gemi_number ~ '^[0-9]{12}$'),
 legal_name text NOT NULL CHECK (length(btrim(legal_name)) >= 3),
 company_status text,
 city text,
 checked_at timestamptz NOT NULL,
 checked_by uuid NOT NULL REFERENCES public.users(id),
 source text NOT NULL DEFAULT 'gemi_opendata_live'
   CHECK (source='gemi_opendata_live'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (interest_id,checked_at)
);
CREATE INDEX mazi_interest_registry_rechecks_latest_idx
 ON public.mazi_interest_registry_rechecks(interest_id,checked_at DESC,id DESC);
ALTER TABLE public.mazi_interest_registry_rechecks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_interest_registry_rechecks FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.mazi_interest_registry_rechecks_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION mazi_private.guard_interest_registry_recheck()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI_INTEREST_REGISTRY_RECHECK_IMMUTABLE';
END; $$;
REVOKE ALL ON FUNCTION mazi_private.guard_interest_registry_recheck()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mazi_guard_interest_registry_recheck
 BEFORE UPDATE OR DELETE ON public.mazi_interest_registry_rechecks
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_interest_registry_recheck();

COMMENT ON TABLE public.mazi_interest_registry_rechecks IS
 'Immutable official ΓΕΜΗ live AFM checks made by marketplace Super Admin; no client Data API exposure and no membership authorization by itself.';
