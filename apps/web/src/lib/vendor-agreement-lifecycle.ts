// Production deployment marker: canonical agreement lifecycle schema 0146 is reconciled.
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type VendorAgreementLifecycleResult = Readonly<{
  expiredAgreements: number;
  activatedSuccessors: number;
  restrictedVendors: number;
  restoredVendors: number;
}>;

export async function reconcileVendorAgreementLifecycle(at = new Date()): Promise<VendorAgreementLifecycleResult> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT * FROM bls_private.reconcile_vendor_agreement_lifecycle($1::timestamptz)`,
    [at.toISOString()]
  );
  const row = result.rows[0] ?? {};
  return {
    expiredAgreements: Number(row.expired_agreements ?? 0),
    activatedSuccessors: Number(row.activated_successors ?? 0),
    restrictedVendors: Number(row.restricted_vendors ?? 0),
    restoredVendors: Number(row.restored_vendors ?? 0)
  };
}
