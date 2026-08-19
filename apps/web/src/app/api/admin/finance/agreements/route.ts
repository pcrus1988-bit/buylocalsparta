import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  activateCommercialAgreement,
  changeCommercialAgreementStatus,
  commercialAgreementWorkspace,
  createCommercialAgreement,
  verifyCommercialAgreementGovgr
} from "../../../../../lib/admin-commercial-agreements";
import { generateCommercialAgreementPdfVault } from "../../../../../lib/agreement-document-vault-generate";
import { emailCommercialAgreementPdfVault } from "../../../../../lib/agreement-document-vault-email";
import { storeSignedCommercialAgreementVault } from "../../../../../lib/agreement-document-vault-signed";
import { getCommercialAgreementDocumentVault } from "../../../../../lib/agreement-document-vault-get";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertFinanceActivationDoesNotBypassOnboarding(principal: SessionPrincipal, agreementId: unknown) {
  if (typeof agreementId !== "string" || !agreementId.trim()) throw new Error("agreementId is required");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT app.public_id AS application_public_id,app.status::text AS application_status
      FROM vendor_commercial_agreements agreement
      LEFT JOIN LATERAL (
        SELECT public_id,status
        FROM vendor_applications
        WHERE vendor_id=agreement.vendor_id
        ORDER BY updated_at DESC,created_at DESC
        LIMIT 1
      ) app ON true
      WHERE agreement.public_id=$1 OR agreement.id::text=$1
    `, [agreementId.trim()]);
    if (!result.rowCount) throw new Error("Agreement not found");
    const applicationStatus = result.rows[0].application_status ? String(result.rows[0].application_status) : undefined;
    if (applicationStatus && applicationStatus !== "active") {
      throw new Error(`Η σύμβαση είναι έτοιμη, αλλά η αίτηση βρίσκεται στο στάδιο ${applicationStatus}. Η τελική ενεργοποίηση vendor γίνεται από Admin → Vendors όταν ολοκληρωθούν catalog/test readiness.`);
    }
  }, { readOnly: true });
}

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "finance.read" });
    const url = new URL(request.url);
    const agreementId = url.searchParams.get("agreementId");
    const document = url.searchParams.get("document");

    if (agreementId && document) {
      const result = await getCommercialAgreementDocumentVault(agreementId, document);
      return new Response(new Uint8Array(result.buffer), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${result.filename.replace(/[\r\n"]/g, "-")}"`,
          "cache-control": "private, no-store"
        }
      });
    }

    return Response.json(await commercialAgreementWorkspace(), {
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreements_load_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "finance.write" });
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const form = await request.formData();
      const action = String(form.get("action") ?? "");
      if (action !== "signed_upload") throw new Error("Unsupported multipart agreement action");
      const signedPdf = form.get("signedPdf");
      if (!(signedPdf instanceof File)) throw new Error("Signed agreement PDF is required");
      await storeSignedCommercialAgreementVault(principal, {
        agreementId: form.get("agreementId"),
        govgrReference: form.get("govgrReference"),
        signedAt: form.get("signedAt") || undefined,
        file: signedPdf
      });
      return Response.json(await commercialAgreementWorkspace(), {
        headers: { "cache-control": "private, no-store" }
      });
    }

    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "create";
    let warning: string | undefined;

    if (action === "create") {
      const created = await createCommercialAgreement(principal, body);
      try {
        await generateCommercialAgreementPdfVault(principal, created.agreementId);
      } catch (error) {
        warning = `Η συμφωνία ${created.agreementCode} αποθηκεύτηκε, αλλά το PDF δεν δημιουργήθηκε αυτόματα: ${error instanceof Error ? error.message : "pdf_generation_failed"}`;
      }
    } else if (action === "generate_pdf") {
      await generateCommercialAgreementPdfVault(principal, body.agreementId);
    } else if (action === "email_pdf") {
      await emailCommercialAgreementPdfVault(principal, body.agreementId);
    } else if (action === "verify_govgr") {
      await verifyCommercialAgreementGovgr(principal, body);
    } else if (action === "activate") {
      await assertFinanceActivationDoesNotBypassOnboarding(principal, body.agreementId);
      await activateCommercialAgreement(principal, body);
    } else if (action === "status") {
      await changeCommercialAgreementStatus(principal, body);
    } else {
      throw new Error("Unsupported agreement action");
    }

    return Response.json({ ...(await commercialAgreementWorkspace()), ...(warning ? { warning } : {}) }, {
      headers: { "cache-control": "private, no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreement_action_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}