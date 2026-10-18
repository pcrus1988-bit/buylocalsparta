/**
 * Private-only INCI discrepancy entrypoint.
 * The audited implementation is not integrated on this branch. Fail closed
 * until its full evidence-validation dependency graph and tests are reviewed.
 */
export function auditPrivateInciVersionDiscrepancies() {
  throw new Error('NYXI_INCI_VERSION_AUDIT_NOT_INTEGRATED');
}
