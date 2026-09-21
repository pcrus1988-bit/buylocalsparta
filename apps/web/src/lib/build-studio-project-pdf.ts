import type { BuildGuidanceSourceLayer, BuildGuidanceUiItem } from "./build-guidance-runtime";
import type { BuildStudioProjectSnapshot } from "./build-studio-project-documents";

const COLORS = {
  ink: "#191817",
  inkSoft: "#5F5A54",
  paper: "#F6F1E8",
  paper2: "#ECE6DC",
  gold: "#9A7B3F",
  line: "#D8D0C4",
  warning: "#8B4C31",
  white: "#FFFFFF"
} as const;

function sourceLabel(layer: BuildGuidanceSourceLayer): string {
  if (layer === "GENERAL_GUIDANCE") return "Γενική τεχνική καθοδήγηση";
  if (layer === "MANUFACTURER_VITEX") return "Οδηγίες κατασκευαστή · VITEX";
  if (layer === "MANUFACTURER") return "Οδηγίες κατασκευαστή";
  return "Κανόνας ασφάλειας · ΚΟΝΤΑ ΜΟΥ";
}

function money(minor: number | undefined, currency: string | undefined): string | undefined {
  if (!minor || !currency) return undefined;
  try {
    return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100);
  } catch {
    return undefined;
  }
}

function guideSection(title: string, items: readonly BuildGuidanceUiItem[]): unknown[] {
  if (!items.length) return [];
  return [
    { text: title, style: "sectionTitle", margin: [0, 14, 0, 7] },
    ...items.map((item, index) => ({
      table: {
        widths: [22, "*"],
        body: [[
          { text: String(index + 1).padStart(2, "0"), color: COLORS.gold, bold: true, fontSize: 8, margin: [0, 3, 0, 0] },
          {
            stack: [
              { text: item.textEl, color: COLORS.ink, fontSize: 9.3, lineHeight: 1.35 },
              { text: sourceLabel(item.sourceLayer), color: COLORS.inkSoft, fontSize: 6.8, margin: [0, 3, 0, 0] }
            ]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4
      }
    }))
  ];
}

function evidenceLabel(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const pick = (...keys: string[]) => keys
    .map((key) => typeof row[key] === "string" ? String(row[key]).trim() : "")
    .find(Boolean);
  const title = pick("source_title", "document_title", "source_name", "title", "document_name");
  const sourceType = pick("source_type", "document_type");
  const url = pick("source_url", "url");
  const page = row.page_number ?? row.page ?? row.locator;
  const locator = typeof page === "string" || typeof page === "number" ? String(page).trim() : "";
  const parts = [title, sourceType, locator ? `σελ./θέση ${locator}` : undefined, url].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function evidenceAppendix(snapshot: BuildStudioProjectSnapshot): readonly string[] {
  const guide = snapshot.guide;
  const items = [
    ...guide.beforeYouStart,
    ...guide.preparation,
    ...guide.whatYouNeed,
    ...guide.stepByStep,
    ...guide.manufacturerInstructions,
    ...guide.timings,
    ...guide.avoid,
    ...guide.warnings
  ];
  const labels = items.flatMap((item) => item.evidence.map(evidenceLabel).filter((value): value is string => Boolean(value)));
  return [...new Set(labels)].slice(0, 80);
}

function buildDefinition(snapshot: BuildStudioProjectSnapshot): Record<string, unknown> {
  const productPrice = money(snapshot.product.priceMinor, snapshot.product.currency);
  const evidence = evidenceAppendix(snapshot);
  const content: unknown[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "KONTA MOY", style: "brand" },
            { text: "PAINT & BUILD STUDIO · PROJECT GUIDE", style: "brandTagline" }
          ]
        },
        {
          width: 150,
          stack: [
            { text: "ΟΔΗΓΟΣ ΕΡΓΟΥ", color: COLORS.white, fillColor: COLORS.gold, bold: true, alignment: "center", fontSize: 8, margin: [8, 7, 8, 7] },
            { text: new Date(snapshot.createdAt).toLocaleString("el-GR"), color: COLORS.inkSoft, fontSize: 7, alignment: "right", margin: [0, 5, 0, 0] }
          ]
        }
      ],
      margin: [0, 0, 0, 22]
    },
    { text: "ΤΟ ΕΡΓΟ ΣΟΥ", style: "eyebrow" },
    { text: snapshot.project.title, style: "hero", margin: [0, 5, 0, 6] },
    { text: snapshot.project.summary || "Επαληθευμένο έργο Paint & Build Studio.", color: COLORS.inkSoft, fontSize: 10, lineHeight: 1.4, margin: [0, 0, 0, 13] },
    ...(snapshot.project.colour ? [{
      columns: [
        { width: 16, canvas: [{ type: "rect", x: 0, y: 0, w: 12, h: 12, color: snapshot.project.colour, lineColor: COLORS.line, lineWidth: 0.5 }] },
        { width: "*", text: `Επιλεγμένη απόχρωση: ${snapshot.project.colour}`, color: COLORS.ink, fontSize: 8.5 }
      ],
      margin: [0, 0, 0, 16]
    }] : []),
    {
      table: {
        widths: ["*"],
        body: [[{
          fillColor: COLORS.paper2,
          margin: [14, 12, 14, 12],
          stack: [
            { text: "ΤΑ ΥΛΙΚΑ ΣΟΥ", style: "eyebrow" },
            { text: snapshot.product.productName, fontSize: 15, bold: true, color: COLORS.ink, margin: [0, 5, 0, 3] },
            { text: [snapshot.product.brandName, snapshot.product.officialProductCode ? `Κωδικός ${snapshot.product.officialProductCode}` : undefined, snapshot.product.eanGtin ? `EAN/GTIN ${snapshot.product.eanGtin}` : undefined].filter(Boolean).join(" · "), color: COLORS.inkSoft, fontSize: 8.2 },
            ...(productPrice ? [{ text: `Τιμή κατά τη δημιουργία: ${productPrice}`, color: COLORS.gold, fontSize: 8.5, bold: true, margin: [0, 5, 0, 0] }] : []),
            { text: "Η καταλληλότητα του προϊόντος επαληθεύτηκε για το συγκεκριμένο σενάριο πριν δημιουργηθεί ο οδηγός.", color: COLORS.inkSoft, fontSize: 7.6, margin: [0, 6, 0, 0] }
          ]
        }]]
      },
      layout: "noBorders",
      margin: [0, 0, 0, 20]
    },
    { text: "ΟΔΗΓΙΕΣ ΓΙΑ ΤΑ ΠΡΟΪΟΝΤΑ ΠΟΥ ΕΠΕΛΕΞΕΣ", style: "eyebrow", margin: [0, 0, 0, 3] },
    ...guideSection("Πριν ξεκινήσεις", snapshot.guide.beforeYouStart),
    ...guideSection("Προετοιμασία", snapshot.guide.preparation),
    ...guideSection("Τι χρειάζεσαι", snapshot.guide.whatYouNeed),
    ...guideSection("Βήμα-βήμα", snapshot.guide.stepByStep),
    ...guideSection("Οδηγίες προϊόντος", snapshot.guide.manufacturerInstructions),
    ...guideSection("Χρόνοι", snapshot.guide.timings),
    ...guideSection("Τι να αποφύγεις", snapshot.guide.avoid),
    ...guideSection("Προσοχή", snapshot.guide.warnings),
    { text: "Ποσότητα", style: "sectionTitle", margin: [0, 14, 0, 7] },
    { text: snapshot.guide.quantity.explanationEl, color: COLORS.ink, fontSize: 9.3, lineHeight: 1.35 },
    ...(evidence.length ? [
      { text: "ΤΕΚΜΗΡΙΩΣΗ SNAPSHOT", style: "eyebrow", pageBreak: "before", margin: [0, 0, 0, 8] },
      { text: "Οι παρακάτω αναφορές προέρχονται από την τεκμηρίωση που ήταν συνδεδεμένη με τις οδηγίες τη στιγμή δημιουργίας του οδηγού.", color: COLORS.inkSoft, fontSize: 8.5, lineHeight: 1.4, margin: [0, 0, 0, 10] },
      {
        ul: evidence,
        color: COLORS.inkSoft,
        fontSize: 7.5,
        lineHeight: 1.3
      }
    ] : []),
    {
      text: "Ο οδηγός αποτελεί αποτύπωση της επαληθευμένης τεκμηρίωσης για τα στοιχεία έργου που δηλώθηκαν κατά τη δημιουργία του. Αν αλλάξει η επιφάνεια, η κατάστασή της, το προϊόν ή οι συνθήκες εφαρμογής, χρειάζεται νέος έλεγχος στο Paint & Build Studio.",
      color: COLORS.inkSoft,
      fontSize: 7.2,
      lineHeight: 1.35,
      margin: [0, 18, 0, 0]
    }
  ];

  return {
    pageSize: "A4",
    pageMargins: [38, 36, 38, 42],
    background: () => ({ canvas: [{ type: "rect", x: 0, y: 0, w: 595.28, h: 841.89, color: COLORS.paper }] }),
    defaultStyle: { font: "Roboto", fontSize: 9, color: COLORS.ink },
    styles: {
      brand: { fontSize: 18, bold: true, color: COLORS.ink, characterSpacing: 1.6 },
      brandTagline: { fontSize: 7.2, color: COLORS.gold, margin: [0, 2, 0, 0] },
      eyebrow: { fontSize: 7.2, bold: true, color: COLORS.gold, characterSpacing: 0.8 },
      hero: { fontSize: 25, bold: true, color: COLORS.ink },
      sectionTitle: { fontSize: 12, bold: true, color: COLORS.ink }
    },
    content
  };
}

export async function renderBuildStudioProjectPdf(snapshot: BuildStudioProjectSnapshot): Promise<Buffer> {
  const definition = buildDefinition(snapshot);
  const pdfMakeModule = await import("pdfmake/build/pdfmake.js");
  const fontsModule = await import("pdfmake/build/vfs_fonts.js");
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as any;
  const fonts = (fontsModule.default ?? fontsModule) as any;
  pdfMake.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
  pdfMake.fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf"
    }
  };
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
