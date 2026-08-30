-- KONTA MOY — index the Admin Personal Assistant audit conversation foreign key.
-- Keeps conversation-linked audit lookups and parent-row FK maintenance efficient.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_admin_assistant_tool_audit_conversation
  ON public.admin_assistant_tool_audit (conversation_id);

COMMIT;
