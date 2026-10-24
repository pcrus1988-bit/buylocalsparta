-- MAZI 018: append-only Super Admin release-gate attestations.
-- Evidence here records a human review; it NEVER enables onboarding, billing,
-- voting, award disbursement, public signup, or fund financing automatically.
CREATE TABLE public.mazi_launch_gate_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 gate_key text NOT NULL CHECK (gate_key IN (
  'auth_email_delivery','legal_and_retention','consenting_business_e2e'
 )),
 decision text NOT NULL CHECK(decision IN ('verified','reopened')),
 evidence text NOT NULL CHECK (
  char_length(btrim(evidence)) BETWEEN 40 AND 1200
 ),
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mazi_launch_gate_reviews_latest_idx
 ON public.mazi_launch_gate_reviews(gate_key,recorded_at DESC,id DESC);
ALTER TABLE public.mazi_launch_gate_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_launch_gate_reviews FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.mazi_launch_gate_reviews_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION mazi_private.prevent_launch_gate_review_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI_LAUNCH_GATE_REVIEW_IMMUTABLE';
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.prevent_launch_gate_review_mutation()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_launch_gate_review_append_only
 BEFORE UPDATE OR DELETE ON public.mazi_launch_gate_reviews
 FOR EACH ROW EXECUTE FUNCTION mazi_private.prevent_launch_gate_review_mutation();

COMMENT ON TABLE public.mazi_launch_gate_reviews IS
 'Private append-only evidence of human Super Admin release checks. Informational: never a financial, registration, invitation delivery, or public deployment permission.';
