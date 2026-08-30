-- KONTA MOY — Admin Assistant recommendation lifecycle state.
-- This is assistant metadata only. It never mutates commerce domain entities.
-- State is scoped to one Admin and one stable recommendation key. A changed
-- evidence fingerprint makes a previously dismissed/resolved/intentional item
-- eligible to surface again without deleting the historical preference.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_assistant_recommendation_states (
  id uuid PRIMARY KEY,
  admin_user_id text NOT NULL,
  recommendation_key text NOT NULL CHECK (char_length(recommendation_key) BETWEEN 1 AND 240),
  rule_id text,
  entity_type text,
  entity_id text,
  context_route text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  evidence_fingerprint text NOT NULL CHECK (char_length(evidence_fingerprint) = 64),
  state text NOT NULL CHECK (state IN ('active','accepted','dismissed','snoozed','resolved','intentional')),
  snoozed_until bigint,
  state_reason text CHECK (state_reason IS NULL OR char_length(state_reason) <= 500),
  first_seen_at bigint NOT NULL,
  last_seen_at bigint NOT NULL,
  state_updated_at bigint NOT NULL,
  UNIQUE (admin_user_id, recommendation_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_recommendation_states_user_state
  ON public.admin_assistant_recommendation_states (admin_user_id, state, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_recommendation_states_user_entity
  ON public.admin_assistant_recommendation_states (admin_user_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

ALTER TABLE public.admin_assistant_recommendation_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_assistant_recommendation_states_platform_scope
  ON public.admin_assistant_recommendation_states;
CREATE POLICY admin_assistant_recommendation_states_platform_scope
  ON public.admin_assistant_recommendation_states
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.admin_assistant_recommendation_states FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.admin_assistant_recommendation_states TO bls_platform_runtime;

COMMIT;
