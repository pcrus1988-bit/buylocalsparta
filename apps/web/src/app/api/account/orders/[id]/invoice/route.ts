import { requireAccountSession } from "../../../../../../lib/account-session";
import { accountOrderDetail } from "../../../../../../lib/account-view";
import { customerFiscalDocumentForOrder } from "../../../../../../lib/customer-fiscal-runtime";
import { renderCustomerTaxPdf } from "../../../../../../lib/customer-tax-pdf";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, false);
    const { id } = await params;
    await accountOrderDetail(principal, id); // ownership/visibility authorization
    const document = await customerFiscalDocumentForOrder(id);
    if (!document) return Response.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
    const pdf = await renderCustomerTaxPdf(document);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const filename = `KONTA-MOY-${document.documentNumber.replace(/[^A-Za-z0-9._-]+/g, "-") || "parastatiko"}.pdf`;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invoice_download_failed";
    return Response.json({ error: message }, { status: message === "ORDER_NOT_FOUND" ? 404 : 401 });
  }
}
