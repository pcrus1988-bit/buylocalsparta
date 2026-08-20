import type { CustomerFiscalDocument, CustomerFiscalLine, CustomerFiscalVendorGroup } from "./customer-fiscal-runtime";
import { KONTA_MOY_LEGAL_DETAILS } from "./vendor-agreement-pdf";

const COLORS = Object.freeze({
  paper: "#F4F0E8",
  paper2: "#FFFAF1",
  ink: "#183027",
  inkSoft: "#405149",
  olive: "#6D7651",
  oliveDark: "#596143",
  terracotta: "#AA664F",
  brass: "#B29661",
  line: "#D6CFBF",
  white: "#FFFDF8"
});

const money = (minor: number, currency: string) => new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100);
const percent = (bps: number) => new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(bps / 100) + "%";
const dateTime = (value: number) => new Intl.DateTimeFormat("el-GR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Europe/Athens"
}).format(new Date(value));

export function buildCustomerTaxPdfDefinition(doc: CustomerFiscalDocument): Record<string, unknown> {
  const fiscalTitle = doc.type === "customer_invoice" ? "Τιμολόγιο πώλησης" : "Απόδειξη λιανικής πώλησης";
  const friendlyTitle = doc.type === "customer_invoice" ? "Το τιμολόγιό σου" : "Η απόδειξή σου";
  const vendorSections = doc.vendorGroups.flatMap((group, index) => vendorSection(group, doc.currency, index));
  const billing = billingAddressLines(doc.billingAddress);
  const paymentMethod = paymentMethodLabel(doc.payment.method, doc.payment.mydataPaymentType);
  const content: unknown[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "ΚΟΝΤΑ ΜΟΥ", style: "brand" },
            { text: "η αγορά της πόλης σου, λίγο πιο κοντά", style: "brandTagline" }
          ]
        },
        {
          width: 170,
          table: { widths: ["*"], body: [[{ text: fiscalTitle.toUpperCase(), style: "fiscalPill" }]] },
          layout: "noBorders"
        }
      ],
      columnGap: 18
    },
    { canvas: [{ type: "line", x1: 0, y1: 8, x2: 523, y2: 8, lineWidth: 1, lineColor: COLORS.brass }], margin: [0, 0, 0, 18] },
    {
      table: {
        widths: ["*"],
        body: [[{
          fillColor: COLORS.ink,
          margin: [22, 20, 22, 20],
          stack: [
            { text: friendlyTitle, color: COLORS.white, fontSize: 24, bold: true, margin: [0, 0, 0, 6] },
            { text: "Ευχαριστούμε που ψώνισες τοπικά.", color: "#EDF1EA", fontSize: 12, margin: [0, 0, 0, 3] },
            { text: "Η παραγγελία σου συνδέει ανθρώπους, προϊόντα και καταστήματα της τοπικής αγοράς.", color: "#CFD8D1", fontSize: 9.5 }
          ]
        }]]
      },
      layout: "noBorders",
      margin: [0, 0, 0, 16]
    },
    {
      table: {
        widths: ["*", "*"],
        body: [
          [metaCell("ΑΡΙΘΜΟΣ ΠΑΡΑΣΤΑΤΙΚΟΥ", doc.documentNumber, COLORS.terracotta), metaCell("ΠΑΡΑΓΓΕΛΙΑ", doc.orderNumber, COLORS.olive)],
          [metaCell("ΗΜΕΡΟΜΗΝΙΑ & ΩΡΑ ΠΑΡΑΓΓΕΛΙΑΣ", dateTime(doc.orderPlacedAt)), metaCell("ΕΚΔΟΣΗ ΠΑΡΑΣΤΑΤΙΚΟΥ", dateTime(doc.issuedAt))]
        ]
      },
      layout: cardGridLayout(),
      margin: [0, 0, 0, 20]
    },
    ...vendorSections,
    {
      columns: [
        {
          width: "55%",
          stack: [
            { text: "Πληρωμή", style: "sectionTitle", margin: [0, 0, 0, 7] },
            detailTable([
              ["Πάροχος", providerLabel(doc.payment.provider)],
              ["Μέθοδος", paymentMethod],
              ...(doc.payment.transactionId ? [["UID / Transaction ID", doc.payment.transactionId] as const] : []),
              ...(doc.payment.providerOrderCode ? [["Κωδικός παρόχου", doc.payment.providerOrderCode] as const] : []),
              ...(doc.payment.tid ? [["TID", doc.payment.tid] as const] : [])
            ])
          ]
        },
        {
          width: "45%",
          stack: [
            { text: "Σύνοψη", style: "sectionTitle", margin: [0, 0, 0, 7] },
            totalsTable(doc)
          ]
        }
      ],
      columnGap: 20,
      margin: [0, 2, 0, 18]
    },
    ...(billing.length ? [
      { text: "Στοιχεία χρέωσης", style: "sectionTitle", margin: [0, 0, 0, 6] },
      { text: billing.join("\n"), color: COLORS.inkSoft, fontSize: 8.8, lineHeight: 1.35, margin: [0, 0, 0, 16] }
    ] : []),
    {
      table: {
        widths: ["*"],
        body: [[{
          fillColor: "#E9E5DA",
          margin: [16, 14, 16, 14],
          stack: [
            { text: "AADE / myDATA", style: "sectionTitle", margin: [0, 0, 0, 8] },
            {
              table: {
                widths: [78, "*"],
                body: [
                  [{ text: "MARK", style: "detailLabel" }, { text: doc.mark, style: "monoValue" }],
                  [{ text: "UID", style: "detailLabel" }, { text: doc.uid ?? "—", style: "monoValue" }],
                  [{ text: "Παραστατικό", style: "detailLabel" }, { text: `${doc.documentNumber} · ${fiscalTitle}`, color: COLORS.ink }]
                ]
              },
              layout: "noBorders"
            },
            ...(doc.qrUrl ? [{ text: "Ο κωδικός QR κάτω δεξιά επαληθεύει το παραστατικό απευθείας στην AADE.", color: COLORS.inkSoft, fontSize: 8, margin: [0, 7, 0, 0] }] : [])
          ]
        }]]
      },
      layout: "noBorders",
      margin: [0, 0, 0, 12]
    },
    {
      text: "Το φορολογικό παραστατικό εκδίδεται από την KONTA MOY / SP BUSINESS LAB για τη συναλλαγή της πλατφόρμας. Τα στοιχεία των συνεργαζόμενων τοπικών καταστημάτων εμφανίζονται ανά ομάδα προϊόντων για διαφάνεια και εύκολη αναφορά.",
      color: COLORS.inkSoft,
      fontSize: 7.8,
      lineHeight: 1.25
    }
  ];

  return {
    pageSize: "A4",
    pageMargins: [36, 34, 36, doc.qrUrl ? 112 : 78],
    background: () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: 595.28, h: 841.89, color: COLORS.paper }] }),
    footer: (currentPage: number, pageCount: number) => receiptFooter(doc, currentPage, pageCount),
    defaultStyle: { font: "Roboto", fontSize: 9, color: COLORS.ink },
    styles: {
      brand: { fontSize: 18, bold: true, color: COLORS.ink, characterSpacing: 1.6 },
      brandTagline: { fontSize: 7.5, color: COLORS.oliveDark, margin: [0, 2, 0, 0] },
      fiscalPill: { fontSize: 7.6, bold: true, color: COLORS.white, fillColor: COLORS.terracotta, alignment: "center", margin: [8, 7, 8, 7], characterSpacing: 0.6 },
      sectionTitle: { fontSize: 11, bold: true, color: COLORS.ink },
      partnerEyebrow: { fontSize: 7.5, bold: true, color: COLORS.oliveDark, characterSpacing: 0.65 },
      partnerName: { fontSize: 15, bold: true, color: COLORS.ink },
      partnerLegal: { fontSize: 8, color: COLORS.inkSoft },
      detailLabel: { fontSize: 7.5, bold: true, color: COLORS.oliveDark },
      monoValue: { fontSize: 8.2, color: COLORS.ink }
    },
    content
  };
}

export async function renderCustomerTaxPdf(doc: CustomerFiscalDocument): Promise<Buffer> {
  const definition = buildCustomerTaxPdfDefinition(doc);
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

function vendorSection(group: CustomerFiscalVendorGroup, currency: string, index: number): unknown[] {
  const identity = [
    group.legalName !== group.tradingName ? group.legalName : undefined,
    group.taxNumber ? `ΑΦΜ ${group.taxNumber}` : undefined,
    group.gemiNumber ? `ΓΕΜΗ ${group.gemiNumber}` : undefined
  ].filter(Boolean).join(" · ");
  return [
    {
      table: {
        widths: [8, "*"],
        body: [[
          { text: "", fillColor: index % 2 === 0 ? COLORS.olive : COLORS.terracotta, margin: [0, 0, 0, 0] },
          {
            fillColor: COLORS.paper2,
            margin: [14, 11, 14, 11],
            stack: [
              { text: "ΤΑ ΠΡΟΪΟΝΤΑ ΣΟΥ ΑΠΟ ΤΟ ΣΥΝΕΡΓΑΖΟΜΕΝΟ ΤΟΠΙΚΟ ΚΑΤΑΣΤΗΜΑ", style: "partnerEyebrow" },
              { text: group.tradingName, style: "partnerName", margin: [0, 4, 0, 2] },
              ...(identity ? [{ text: identity, style: "partnerLegal" }] : [])
            ]
          }
        ]]
      },
      layout: "noBorders",
      margin: [0, 0, 0, 6]
    },
    itemTable(group.lines, currency),
    { text: "", margin: [0, 0, 0, 12] }
  ];
}

function itemTable(lines: readonly CustomerFiscalLine[], currency: string): Record<string, unknown> {
  return {
    table: {
      headerRows: 1,
      widths: ["*", 28, 60, 42, 65],
      body: [
        [headerCell("Προϊόν"), headerCell("Ποσ."), headerCell("Τιμή"), headerCell("ΦΠΑ"), headerCell("Σύνολο")],
        ...lines.map(line => [
          {
            stack: [
              { text: line.title, bold: true, color: COLORS.ink, fontSize: 9.2 },
              ...(line.description ? [{ text: line.description, color: COLORS.inkSoft, fontSize: 7.5, margin: [0, 2, 0, 0] }] : []),
              ...(identifierText(line) ? [{ text: identifierText(line), color: COLORS.oliveDark, fontSize: 6.9, margin: [0, 3, 0, 0] }] : [])
            ],
            margin: [0, 5, 6, 5]
          },
          { text: String(line.quantity), alignment: "center", margin: [0, 7, 0, 5] },
          { text: money(line.unitPriceMinor, currency), alignment: "right", margin: [0, 7, 0, 5] },
          { text: percent(line.taxRateBps), alignment: "right", margin: [0, 7, 0, 5] },
          { text: money(line.lineTotalMinor, currency), alignment: "right", bold: true, margin: [0, 7, 0, 5] }
        ])
      ]
    },
    layout: {
      hLineWidth: (i: number) => i === 1 ? 1 : 0.45,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 2,
      paddingBottom: () => 2,
      fillColor: (rowIndex: number) => rowIndex === 0 ? "#E9E5DA" : undefined
    }
  };
}

function identifierText(line: CustomerFiscalLine): string {
  return [
    line.itemCode ? `Κωδικός: ${line.itemCode}` : undefined,
    line.sku ? `SKU: ${line.sku}` : undefined,
    line.gtin ? `EAN/GTIN: ${line.gtin}` : undefined,
    line.mpn ? `MPN: ${line.mpn}` : undefined,
    line.model ? `Model: ${line.model}` : undefined
  ].filter(Boolean).join("  ·  ");
}

function totalsTable(doc: CustomerFiscalDocument): Record<string, unknown> {
  const body: unknown[][] = [];
  if (doc.subtotalMinor !== doc.grossMinor || doc.shippingMinor || doc.discountMinor) body.push(["Προϊόντα", money(doc.subtotalMinor, doc.currency)]);
  if (doc.shippingMinor) body.push(["Παράδοση", money(doc.shippingMinor, doc.currency)]);
  if (doc.discountMinor) body.push(["Έκπτωση", `-${money(doc.discountMinor, doc.currency)}`]);
  body.push(["Καθαρή αξία", money(doc.netMinor, doc.currency)]);
  body.push(["ΦΠΑ", money(doc.taxMinor, doc.currency)]);
  body.push([{ text: "ΣΥΝΟΛΟ", bold: true, color: COLORS.white }, { text: money(doc.grossMinor, doc.currency), bold: true, color: COLORS.white, alignment: "right" }]);
  return {
    table: { widths: ["*", 86], body },
    layout: {
      hLineWidth: (i: number, node: any) => i === node.table.body.length - 1 ? 0 : 0.4,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: (rowIndex: number, node: any) => rowIndex === node.table.body.length - 1 ? COLORS.ink : COLORS.paper2
    }
  };
}

function detailTable(rows: readonly (readonly [string, string])[]): Record<string, unknown> {
  return {
    table: {
      widths: [92, "*"],
      body: rows.map(([label, value]) => [
        { text: label, style: "detailLabel", margin: [0, 3, 0, 3] },
        { text: value || "—", color: COLORS.ink, fontSize: 8.2, margin: [0, 3, 0, 3] }
      ])
    },
    layout: {
      hLineWidth: (i: number) => i === 0 ? 0 : 0.35,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
      paddingLeft: () => 0,
      paddingRight: () => 5
    }
  };
}

function metaCell(label: string, value: string, accent: string = COLORS.brass): Record<string, unknown> {
  return {
    fillColor: COLORS.paper2,
    margin: [12, 10, 12, 10],
    stack: [
      { text: label, fontSize: 6.8, bold: true, color: accent, characterSpacing: 0.45 },
      { text: value, fontSize: 10.5, bold: true, color: COLORS.ink, margin: [0, 3, 0, 0] }
    ]
  };
}

function headerCell(text: string): Record<string, unknown> {
  return { text, bold: true, color: COLORS.inkSoft, fontSize: 7.2, margin: [0, 4, 0, 4] };
}

function cardGridLayout(): Record<string, unknown> {
  return {
    hLineWidth: () => 5,
    vLineWidth: () => 5,
    hLineColor: () => COLORS.paper,
    vLineColor: () => COLORS.paper,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0
  };
}

function paymentMethodLabel(method: string | undefined, mydataType: number | undefined): string {
  const raw = method?.trim();
  if (raw) {
    const normalized = raw.toUpperCase();
    if (normalized === "IRIS") return "IRIS";
    if (normalized === "CARD" || normalized === "CARD_PAYMENT") return "Κάρτα";
    if (normalized === "APPLE_PAY") return "Apple Pay";
    if (normalized === "GOOGLE_PAY") return "Google Pay";
    return raw;
  }
  const labels: Record<number, string> = { 1: "Επαγγελματικός λογαριασμός", 2: "Λογαριασμός εξωτερικού", 3: "Μετρητά", 4: "Επιταγή", 5: "Πίστωση", 6: "Web banking", 7: "POS / e-POS", 8: "IRIS" };
  return mydataType == null ? "—" : labels[mydataType] ?? `myDATA ${mydataType}`;
}

function providerLabel(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "viva") return "Viva.com";
  if (normalized === "viva.com") return "Viva.com";
  return provider || "—";
}

function billingAddressLines(input: Record<string, unknown>): string[] {
  const pick = (...keys: string[]) => keys.map(key => stringValue(input[key])).find(Boolean);
  const lines: string[] = [];
  const name = pick("companyName", "company", "name", "fullName");
  const vat = pick("vatNumber", "taxNumber", "afm");
  const doy = pick("taxOffice", "doy");
  const address = pick("addressLine1", "address1", "street", "address");
  const address2 = pick("addressLine2", "address2");
  const postal = pick("postalCode", "zip", "postcode");
  const city = pick("city", "locality");
  const country = pick("country", "countryCode");
  if (name) lines.push(name);
  if (vat || doy) lines.push([vat ? `ΑΦΜ ${vat}` : undefined, doy ? `ΔΟΥ ${doy}` : undefined].filter(Boolean).join(" · "));
  if (address) lines.push(address);
  if (address2) lines.push(address2);
  const locality = [postal, city, country].filter(Boolean).join(" ");
  if (locality) lines.push(locality);
  return lines;
}

function receiptFooter(doc: CustomerFiscalDocument, currentPage: number, pageCount: number): Record<string, unknown> {
  const lastPage = currentPage === pageCount;
  return {
    margin: [36, 4, 36, 16],
    columns: [
      {
        width: "*",
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: lastPage && doc.qrUrl ? 415 : 523, y2: 0, lineWidth: 0.7, lineColor: COLORS.line }], margin: [0, 0, 0, 7] },
          { text: `${KONTA_MOY_LEGAL_DETAILS.legalName} · ΑΦΜ ${KONTA_MOY_LEGAL_DETAILS.taxNumber} · ΓΕΜΗ ${KONTA_MOY_LEGAL_DETAILS.gemiNumber}`, fontSize: 6.6, color: COLORS.inkSoft },
          { text: `${KONTA_MOY_LEGAL_DETAILS.address} · ${KONTA_MOY_LEGAL_DETAILS.email} · ${KONTA_MOY_LEGAL_DETAILS.phone} · ${KONTA_MOY_LEGAL_DETAILS.website}`, fontSize: 6.3, color: COLORS.inkSoft, margin: [0, 2, 0, 0] },
          { text: `Σελίδα ${currentPage}/${pageCount}`, fontSize: 6, color: COLORS.oliveDark, margin: [0, 3, 0, 0] }
        ]
      },
      ...(lastPage && doc.qrUrl ? [{
        width: 90,
        stack: [
          { text: "ΕΠΑΛΗΘΕΥΣΗ AADE", fontSize: 5.8, bold: true, color: COLORS.oliveDark, alignment: "right", margin: [0, 0, 0, 3] },
          { qr: doc.qrUrl, fit: 66, alignment: "right", foreground: COLORS.ink, background: COLORS.white }
        ]
      }] : [])
    ],
    columnGap: 12
  };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
