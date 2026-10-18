import {fiscalDatabaseConfigured,fiscalPool} from "./fiscal-runtime";
import {evaluateFiscalReleaseGates} from "./fiscal-release-gates";
import type {FiscalReleaseInputs,FiscalReleaseSummary} from "./fiscal-release-gates";

/** Operator-only, read-only status query; never selects merchant records or secrets. */
type SchemaProbe=Readonly<{
  baseline_schema:boolean;
  mfa_schema:boolean;
  recovery_schema:boolean;
  alert_schema:boolean;
  receipt_schema:boolean;
  reconcile_schema:boolean;
  certification_schema:boolean;
}>;

const schemaSQL=`
SELECT
  (
    to_regclass('public.fiscal_organizations') IS NOT NULL
    AND to_regclass('public.fiscal_merchant_invitations') IS NOT NULL
    AND to_regclass('public.fiscal_kyb_evidence_events') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0016_operator_kyb_evidence.sql')
  ) AS baseline_schema,
  (
    to_regclass('public.fiscal_operator_mfa_factors') IS NOT NULL
    AND to_regclass('public.fiscal_operator_mfa_sessions') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0017_operator_mfa_stepup.sql')
  ) AS mfa_schema,
  (
    to_regclass('public.fiscal_mfa_recovery_cases') IS NOT NULL
    AND to_regclass('public.fiscal_mfa_recovery_approvals') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0018_governed_mfa_recovery.sql')
  ) AS recovery_schema,
  (
    to_regclass('public.fiscal_security_alert_contacts') IS NOT NULL
    AND to_regclass('public.fiscal_security_alert_outbox') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0019_security_alert_outbox.sql')
  ) AS alert_schema,
  (
    to_regclass('public.fiscal_security_alert_delivery_events') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0020_security_alert_delivery_receipts.sql')
  ) AS receipt_schema,
  (
    to_regclass('public.fiscal_security_alert_reconciliation') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.fiscal_schema_migrations WHERE name='0021_security_alert_reconciliation.sql')
  ) AS reconcile_schema,
  (to_regclass('public.fiscal_certification_controls') IS NOT NULL
   AND to_regclass('public.fiscal_regulatory_sources') IS NOT NULL
  ) AS certification_schema
`;

export async function getFiscalOperationalReleaseSummary():Promise<FiscalReleaseSummary>{
  // Read only exact booleans. Do not enumerate credentials, endpoints,
  // operator identities, account records or signed webhook configuration.
  const flags={
    standalone:process.env.FISCAL_STANDALONE_MODE==="true",
    registrationEnabled:process.env.FISCAL_REGISTRATION_ENABLED==="true",
    liveMarketplaceSyncEnabled:process.env.FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED==="true",
    issuanceFlagEnabled:process.env.FISCAL_ISSUANCE_ENABLED==="true",
    mfaSetupEnabled:process.env.FISCAL_OPERATOR_MFA_SETUP_ENABLED==="true",
    mfaEnforced:process.env.FISCAL_OPERATOR_MFA_ENFORCED==="true",
    recoveryEnabled:process.env.FISCAL_MFA_RECOVERY_ENABLED==="true",
    alertDeliveryEnabled:process.env.FISCAL_SECURITY_ALERT_DELIVERY_ENABLED==="true",
    alertWebhookEnabled:process.env.FISCAL_SECURITY_ALERT_WEBHOOK_ENABLED==="true",
    alertReconciliationEnabled:process.env.FISCAL_SECURITY_ALERT_RECONCILIATION_ENABLED==="true",
    emailVerificationEnabled:process.env.FISCAL_EMAIL_VERIFICATION_ENABLED==="true"
  };
  const databaseConfigured=fiscalDatabaseConfigured();
  let databaseReachable=false;
  let probes:Partial<SchemaProbe>={};
  if(databaseConfigured){
    try{
      const result=await fiscalPool().query<SchemaProbe>(schemaSQL);
      if(result.rows[0]){
        databaseReachable=true;
        probes=result.rows[0];
      }
    }catch{
      // Fail closed: never include connection diagnostics or SQL messages in UI.
    }
  }
  const input:FiscalReleaseInputs={
    ...flags,databaseConfigured,databaseReachable,
    baselineSchema:probes.baseline_schema===true,
    mfaSchema:probes.mfa_schema===true,
    recoverySchema:probes.recovery_schema===true,
    alertSchema:probes.alert_schema===true,
    receiptSchema:probes.receipt_schema===true,
    reconcileSchema:probes.reconcile_schema===true,
    certificationSchema:probes.certification_schema===true
  };
  return evaluateFiscalReleaseGates(input);
}
