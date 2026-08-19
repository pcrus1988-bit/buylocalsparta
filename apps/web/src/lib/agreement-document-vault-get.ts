import { getProductionPostgresRuntime } from "./postgres-runtime";
import { agreementText, readAgreementVaultPdf } from "./agreement-document-vault-common";

export async function getCommercialAgreementDocumentVault(
  agreementIdRaw: unknown,
  kindRaw: unknown
): Promise<{ buffer: Buffer; filename: string }> {
  const agreementId = agreementText(agreementIdRaw, "agreementId");
  const kind = agreementText(kindRaw, "document", 20);
  if (!["unsigned", "signed"].includes(kind)) throw new Error("document must be unsigned or signed");
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`
    SELECT agreement_code,agreement_version,unsigned_pdf_object_key,signed_pdf_object_key
    FROM vendor_commercial_agreements
    WHERE public_id=$1 OR id::text=$1
  `, [agreementId]);
  if (!result.rowCount) throw new Error("Agreement not found");
  const row = result.rows[0];
  const objectKey = kind === "signed" ? row.signed_pdf_object_key : row.unsigned_pdf_object_key;
  if (!objectKey) throw new Error(kind === "signed" ? "Signed agreement PDF is not available" : "Generated agreement PDF is not available");
  return {
    buffer: await readAgreementVaultPdf(String(objectKey)),
    filename: `${row.agreement_code}-v${row.agreement_version}-${kind === "signed" ? "signed-govgr" : "unsigned"}.pdf`
  };
}
