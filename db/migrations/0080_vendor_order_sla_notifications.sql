-- Agreement-bound order SLA policies, notification-centre state, and escalation audit.
BEGIN;

CREATE TABLE vendor_order_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('sla_policy_' || replace(gen_random_uuid()::text,'-','')),
  agreement_id uuid NOT NULL UNIQUE REFERENCES vendor_commercial_agreements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  acceptance_minutes integer NOT NULL CHECK (acceptance_minutes BETWEEN 5 AND 10080),
  preparation_minutes integer NOT NULL CHECK (preparation_minutes BETWEEN 5 AND 43200),
  warning_percent integer NOT NULL DEFAULT 50 CHECK (warning_percent BETWEEN 1 AND 95),
  email_reminder_percent integer NOT NULL DEFAULT 80 CHECK (email_reminder_percent BETWEEN 5 AND 99),
  escalation_grace_minutes integer NOT NULL DEFAULT 60 CHECK (escalation_grace_minutes BETWEEN 0 AND 10080),
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  source_text_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (warning_percent < email_reminder_percent)
);

CREATE INDEX vendor_order_sla_vendor_idx
  ON vendor_order_sla_policies(vendor_id, enabled, updated_at DESC);

ALTER TABLE fulfilment_sla_cases
  ADD COLUMN IF NOT EXISTS agreement_id uuid REFERENCES vendor_commercial_agreements(id),
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES vendor_order_sla_policies(id),
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS baseline_status text,
  ADD COLUMN IF NOT EXISTS last_status_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS fulfilment_sla_agreement_idx
  ON fulfilment_sla_cases(agreement_id, state, due_at)
  WHERE agreement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION suppress_duplicate_admin_order_received() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel = 'in_app' AND NEW.event_type = 'admin.order_received'
     AND EXISTS (
       SELECT 1 FROM notifications n
       WHERE n.channel = 'in_app'
         AND n.event_type = 'admin.order_received'
         AND n.payload->>'orderId' IS NOT DISTINCT FROM NEW.payload->>'orderId'
         AND n.payload->>'fulfilmentId' IS NOT DISTINCT FROM NEW.payload->>'fulfilmentId'
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notifications_admin_order_received_dedupe
BEFORE INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION suppress_duplicate_admin_order_received();

CREATE OR REPLACE FUNCTION mirror_vendor_order_received_to_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  admin_key text;
  order_ref text;
  fulfilment_ref text;
BEGIN
  IF NEW.channel = 'in_app' AND NEW.event_type = 'vendor.order_received' THEN
    order_ref := COALESCE(NEW.payload->>'orderId', 'unknown');
    fulfilment_ref := COALESCE(NEW.payload->>'fulfilmentId', 'unknown');
    admin_key := 'order:' || order_ref || ':fulfilment:' || fulfilment_ref || ':admin:received';
    INSERT INTO notifications(
      id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,
      title,body,payload,status,dedupe_key,sent_at,created_at
    ) VALUES(
      gen_random_uuid(),'notification_' || replace(gen_random_uuid()::text,'-',''),NULL,NULL,'in_app','transactional',
      'admin.order_received','order-sla-v1',COALESCE(NEW.locale,'el'),
      'Νέα παραγγελία σε vendor','Η παραγγελία ' || order_ref || ' ανατέθηκε σε vendor και περιμένει αποδοχή.',
      NEW.payload || jsonb_build_object('sourceVendorUuid',NEW.vendor_id::text),'sent',admin_key,NEW.created_at,NEW.created_at
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER notifications_vendor_order_admin_mirror
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION mirror_vendor_order_received_to_admin();

ALTER TABLE vendor_order_sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_order_sla_vendor_read
  ON vendor_order_sla_policies FOR SELECT
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);

CREATE POLICY vendor_order_sla_platform_all
  ON vendor_order_sla_policies FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
