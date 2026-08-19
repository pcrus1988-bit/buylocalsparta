import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  activateCommercialAgreement,
  changeCommercialAgreementStatus,
  commercialAgreementWorkspace,
  createCommercialAgreement,
  emailCommercialAgreementPdf,
  generateCommercialAgreementPdf,
  getCommercialAgreementDocument,
  storeSignedCommercialAgreement,
  verifyCommercialAgreementGovgr
} from "../../../../../lib/admin-commercial-agreements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "finance.read" });
    const url = new URL(request.url);
    const agreementId = url.searchParams.get("agreementId");
    const document = url.searchParams.get("document");

    if (agreementId && document) {
      const result = await getCommercialAgreementDocument(agreementId, document);
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
      await storeSignedCommercialAgreement(principal, {
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
        await generateCommercialAgreementPdf(principal, created.agreementId);
      } catch (error) {
        warning = `Η συμφωνία ${created.agreementCode} αποθηκεύτηκε, αλλά το PDF δεν δημιουργήθηκε αυτόματα: ${error instanceof Error ? error.message : "pdf_generation_failed"}`;
      }
    } else if (action === "generate_pdf") {
      await generateCommercialAgreementPdf(principal, body.agreementId);
    } else if (action === "email_pdf") {
      await emailCommercialAgreementPdf(principal, body.agreementId);
    } else if (action === "verify_govgr") {
      await verifyCommercialAgreementGovgr(principal, body);
    } else if (action === "activate") {
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
