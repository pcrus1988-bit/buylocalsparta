import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function adminTaxWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "finance.read");
  if (!postgresAdminRuntimeEnabled()) {
    return {
      environment: "development",
      specVersion: "",
      issuanceEnabled: false,
      issuanceChannel: "timologio" as const,
      approvedMappingVersion: undefined,
      documents: [] as const
    };
  }
  const runtime = getProductionPostgresRuntime();
  const documents = await runtime.fiscalWork.workspace();
  if (!runtime.myData) {
    return {
      environment: "not_configured",
      specVersion: "",
      issuanceEnabled: false,
      issuanceChannel: "timologio" as const,
      approvedMappingVersion: undefined,
      documents
    };
  }
  const metadata = await runtime.myData.workspace(principal);
  return { ...metadata, documents };
}

export async function adminAadeConnectivity(principal: SessionPrincipal) {
  assertAdminPermission(principal, "finance.read");
  if (!postgresAdminRuntimeEnabled()) throw new Error("AADE connectivity check requires PostgreSQL runtime");
  const service = getProductionPostgresRuntime().myData;
  if (!service) throw new Error("AADE myDATA credentials are not configured");
  return service.connectivityCheck();
}

export async function adminRecordTimologioDocument(principal: SessionPrincipal, input: {
  documentId: string;
  documentNumber: string;
  aadeMark: string;
  aadeUid?: string;
  qrUrl?: string;
  issueDate: string;
}) {
  assertAdminPermission(principal, "finance.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Timologio reconciliation requires PostgreSQL runtime");
  const result = await getProductionPostgresRuntime().fiscalWork.recordTimologioIssuance({
    ...input,
    actorUserId: principal.userId,
    now: Date.now()
  });
  await recordAdminAudit(principal, "tax.timologio_reconciled", "tax_document", result.id, "Official timologio identifiers recorded", {
    documentNumber: result.documentNumber,
    aadeMark: result.aadeMark,
    aadeUidRecorded: Boolean(result.aadeUid),
    qrUrlRecorded: Boolean(result.qrUrl)
  });
  return result;
}
