-- Add supporting indexes for foreign keys introduced by SLA and Daily migrations.
BEGIN;

CREATE INDEX IF NOT EXISTS fulfilment_sla_cases_policy_idx
  ON fulfilment_sla_cases(sla_policy_id)
  WHERE sla_policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_order_sla_policies_created_by_idx
  ON vendor_order_sla_policies(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_order_sla_policies_updated_by_idx
  ON vendor_order_sla_policies(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_daily_access_created_by_idx
  ON vendor_daily_access(created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

COMMIT;
