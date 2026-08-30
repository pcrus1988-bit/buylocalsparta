-- KONTA MOY — durable Admin Personal Assistant state and usage audit.
-- Stores only Admin-scoped conversations, compact structured responses and tool metadata.
-- Core commerce data remains in its existing domain tables and is never copied here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_assistant_conversations (
  id uuid PRIMARY KEY,
  admin_user_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  last_route text,
  entity_type text,
  entity_id text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_conversations_user_updated
  ON public.admin_assistant_conversations (admin_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_assistant_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.admin_assistant_conversations(id) ON DELETE CASCADE,
  admin_user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  structured_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_messages_conversation_created
  ON public.admin_assistant_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_messages_user_created
  ON public.admin_assistant_messages (admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_assistant_tool_audit (
  id uuid PRIMARY KEY,
  admin_user_id text NOT NULL,
  conversation_id uuid REFERENCES public.admin_assistant_conversations(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  entity_type text,
  entity_id text,
  parameters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_state text NOT NULL CHECK (result_state IN ('ok', 'error')),
  error text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_tool_audit_user_created
  ON public.admin_assistant_tool_audit (admin_user_id, created_at DESC);

ALTER TABLE public.admin_assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assistant_tool_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_assistant_conversations_platform_scope ON public.admin_assistant_conversations;
CREATE POLICY admin_assistant_conversations_platform_scope ON public.admin_assistant_conversations
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS admin_assistant_messages_platform_scope ON public.admin_assistant_messages;
CREATE POLICY admin_assistant_messages_platform_scope ON public.admin_assistant_messages
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS admin_assistant_tool_audit_platform_scope ON public.admin_assistant_tool_audit;
CREATE POLICY admin_assistant_tool_audit_platform_scope ON public.admin_assistant_tool_audit
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.admin_assistant_conversations FROM PUBLIC;
REVOKE ALL ON public.admin_assistant_messages FROM PUBLIC;
REVOKE ALL ON public.admin_assistant_tool_audit FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_assistant_conversations TO bls_platform_runtime;
GRANT SELECT, INSERT ON public.admin_assistant_messages TO bls_platform_runtime;
GRANT SELECT, INSERT ON public.admin_assistant_tool_audit TO bls_platform_runtime;

COMMIT;
