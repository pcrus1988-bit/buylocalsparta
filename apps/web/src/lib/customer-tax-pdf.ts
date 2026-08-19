import type { CustomerFiscalDocument } from "./customer-fiscal-runtime";
import { KONTA_MOY_LEGAL_DETAILS } from "./vendor-agreement-pdf";

const money = (minor: number, currency: string) => new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100);

export async function renderCustomerTaxPdf(doc: CustomerFiscalDocument): Promise<Buffer> {
  const title = doc.type === "customer_invoice" ? "ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ" : "ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ ΠΩΛΗΣΗΣ";
  const definition = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 52],
    defaultStyle: { font: "Roboto", fontSize: 9 },
    content: [
      { text: "KONTA MOY", fontSize: 18, bold: true },
      { text: KONTA_MOY_LEGAL_DETAILS.legalName, bold: true },
      { text: `ΑΦΜ ${KONTA_MOY_LEGAL_DETAILS.taxNumber} · ΓΕΜΗ ${KONTA_MOY_LEGAL_DETAILS.gemiNumber}` },
      { text: KONTA_MOY_LEGAL_DETAILS.address },
      { text: title, fontSize: 14, bold: true, margin: [0, 18, 0, 4] },
      { text: `Αριθμός: ${doc.documentNumber}` },
      { text: `Παραγγελία: ${doc.orderId}` },
      { text: new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(doc.issuedAt)) },
      { table: { widths: ["*", 100], body: [["Καθαρή αξία", money(doc.netMinor, doc.currency)], ["ΦΠΑ", money(doc.taxMinor, doc.currency)], [{ text: "Σύνολο", bold: true }, { text: money(doc.grossMinor, doc.currency), bold: true }]] }, layout: "lightHorizontalLines", margin: [0, 18, 0, 18] },
      { text: "AADE / myDATA", bold: true },
      { table: { widths: [90, "*"], body: [["MARK", doc.mark], ["UID", doc.uid ?? "—"]] }, layout: "lightHorizontalLines", margin: [0, 5, 0, 0] },
      ...(doc.qrUrl ? [{ text: "Επαλήθευση AADE", link: doc.qrUrl, decoration: "underline", margin: [0, 8, 0, 0] }] : [])
    ]
  };
  const pdfMakeModule = await import("pdfmake/build/pdfmake.js");
  const fontsModule = await import("pdfmake/build/vfs_fonts.js");
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
  const fonts = (fontsModule.default ?? fontsModule) as any;
  pdfMake.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
  pdfMake.fonts = { Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf", italics: "Roboto-Italic.ttf", bolditalics: "Roboto-MediumItalic.ttf" } };
  return await new Promise<Buffer>((resolve, reject) => {
    try { pdfMake.createPdf(definition).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer))); }
    catch (error) { reject(error); }
  });
}
