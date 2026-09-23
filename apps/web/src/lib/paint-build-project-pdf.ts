import type { BuildGuidanceSourceLayer, BuildGuidanceUiItem } from "./build-guidance-runtime";
import type { PaintBuildProjectSnapshot } from "./paint-build-project-documents";

function sourceLabel(layer: BuildGuidanceSourceLayer): string {
  if (layer === "GENERAL_GUIDANCE") return "Γενική τεχνική καθοδήγηση";
  if (layer === "MANUFACTURER_VITEX") return "Οδηγίες κατασκευαστή · VITEX";
  if (layer === "MANUFACTURER") return "Οδηγίες κατασκευαστή";
  return "KONTA MOU · κανόνας ασφάλειας / ροής";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function evidenceReferences(snapshot: PaintBuildProjectSnapshot) {
  const guide = snapshot.customerGuide;
  const items = [
    ...guide.beforeYouStart,
    ...guide.preparation,
    ...guide.whatYouNeed,
    ...guide.stepByStep,
    ...guide.manufacturerInstructions,
    ...guide.timings,
    ...guide.avoid,
    ...guide.warnings,
    ...guide.afterApplication
  ];
  const unique = new Map<string, { label: string; url?: string }>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      const row = record(evidence);
      const source = record(row.source);
      const organization = text(row.organization) ?? text(source.organization);
      const title = text(row.title) ?? text(source.title) ?? text(row.source_title) ?? text(source.source_title);
      const section = text(row.relevant_section_page) ?? text(row.section_heading) ?? text(row.source_page)
        ?? text(source.relevant_section_page) ?? text(source.section_heading);
      const url = text(row.url) ?? text(source.url);
      const page = row.source_page != null && typeof row.source_page !== "object" ? String(row.source_page) : undefined;
      const parts = [organization, title, section ?? (page ? `σελ. ${page}` : undefined)].filter(Boolean);
      if (!parts.length) continue;
      const label = parts.join(" · ");
      unique.set(`${label}|${url ?? ""}`, { label, url });
    }
  }
  return [...unique.values()];
}

function itemStack(items: readonly BuildGuidanceUiItem[]) {
  return items.flatMap((item) => [
    {
      text: sourceLabel(item.sourceLayer),
      style: item.sourceLayer === "KONTA_MOU_RULE" ? "sourceSafety" : item.sourceLayer.startsWith("MANUFACTURER") ? "sourceManufacturer" : "sourceGeneral",
      margin: [0, 4, 0, 2]
    },
    { text: item.textEl, style: "body", margin: [0, 0, 0, 5] }
  ]);
}

function section(title: string, items: readonly BuildGuidanceUiItem[]) {
  if (!items.length) return [];
  return [
    { text: title, style: "sectionTitle", margin: [0, 13, 0, 5] },
    ...itemStack(items)
  ];
}

function factValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value == null) return "—";
  return JSON.stringify(value);
}

export function buildPaintBuildProjectDocument(snapshot: PaintBuildProjectSnapshot, referenceId?: string): Record<string, unknown> {
  const project = snapshot.project;
  const guide = snapshot.customerGuide;
  const selected = project.selectedProduct;
  const kit = project.kit;
  const refs = evidenceReferences(snapshot);
  const createdAt = new Date(snapshot.createdAt);
  const createdLabel = Number.isFinite(createdAt.getTime())
    ? createdAt.toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" })
    : snapshot.createdAt;

  const content: unknown[] = [
    { text: "KONTA MOY", style: "brand" },
    { text: "PAINT & BUILD · ΑΝΑΛΥΤΙΚΟΣ ΟΔΗΓΟΣ ΕΡΓΟΥ", style: "eyebrow", margin: [0, 2, 0, 14] },
    { text: project.title, style: "title" },
    { text: project.summary || project.projectType, style: "lead", margin: [0, 5, 0, 12] },
    {
      table: {
        widths: [118, "*"],
        body: [
          ["Αναφορά έργου", referenceId || "—"],
          ["Δημιουργήθηκε", createdLabel],
          ["Τύπος έργου", project.projectType],
          ["Επιφάνεια", project.areaM2 ? `${project.areaM2} m²` : "—"],
          ["Απόχρωση", project.colour || "—"]
        ]
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 12]
    }
  ];

  if (snapshot.guidance.guidance_conflict || snapshot.guidance.blocked) {
    content.push({
      text: snapshot.guidance.guidance_conflict
        ? "Υπάρχει μη επιλυμένη σύγκρουση καθοδήγησης. Μην αντιμετωπίσεις τον οδηγό ως έγκριση εφαρμογής πριν γίνει τεχνικός έλεγχος."
        : "Το έργο έχει ενεργό κανόνα διακοπής/ελέγχου. Οι σχετικές οδηγίες παρακάτω δεν αποτελούν έγκριση για να ξεκινήσει η εφαρμογή.",
      style: "warning",
      margin: [0, 4, 0, 12]
    });
  }

  content.push({ text: "ΤΟ ΕΡΓΟ ΣΟΥ", style: "groupTitle", margin: [0, 12, 0, 5] });
  const projectFacts = Object.entries(snapshot.guidance.effective_facts ?? {})
    .filter(([key]) => !["exact_product_selected", "manufacturer_verified_application_profile", "guidance_conflict"].includes(key));
  if (projectFacts.length) {
    content.push({ text: "Απαντήσεις / δεδομένα έργου", style: "sectionTitle", margin: [0, 10, 0, 5] });
    content.push({
      ul: projectFacts.map(([key, value]) => ({ text: `${key}: ${factValue(value)}`, margin: [0, 0, 0, 3] })),
      style: "body"
    });
  }
  content.push(...section("Πριν ξεκινήσεις", guide.beforeYouStart));
  content.push(...section("Προετοιμασία", guide.preparation));
  content.push(...section("Βήμα-βήμα", guide.stepByStep));

  content.push({ text: "ΤΑ ΥΛΙΚΑ ΣΟΥ", style: "groupTitle", margin: [0, 18, 0, 6], pageBreak: "before" });
  if (selected?.title) {
    content.push({
      table: {
        widths: [118, "*"],
        body: [
          ["Προϊόν", selected.title],
          ["Μάρκα", selected.brand || "—"],
          ["Τιμή κατά την επιλογή", selected.price || "—"]
        ]
      },
      layout: "lightHorizontalLines"
    });
  } else {
    content.push({ text: "Δεν έχει αποθηκευτεί επιβεβαιωμένο προϊόν στο συγκεκριμένο snapshot.", style: "body" });
  }

  if (kit) {
    content.push({ text: "ΑΚΡΙΒΕΣ PROJECT KIT", style: "sectionTitle", margin: [0, 13, 0, 5] });
    content.push({
      text: kit.complete
        ? "Κατάσταση: πλήρες επαληθευμένο σύστημα."
        : "Κατάσταση: ελλιπές σύστημα — ένα ή περισσότερα απαιτούμενα στοιχεία λείπουν, αφαιρέθηκαν ή δεν έχουν επαληθευμένη αυτόματη ποσότητα.",
      style: kit.complete ? "bodyStrong" : "warning",
      margin: [0, 0, 0, 7]
    });
    const selectedKitItems = kit.items.filter((item) => item.selected);
    if (selectedKitItems.length) {
      content.push({
        table: {
          headerRows: 1,
          widths: ["*", 42, 72, 76],
          body: [
            ["Είδος", "Ποσ.", "Τιμή/τεμ.", "Σύνολο"],
            ...selectedKitItems.map((item) => [
              [
                { text: item.title, bold: true },
                { text: item.required ? "\nΑΠΑΡΑΙΤΗΤΟ" : item.role === "recommended_working" ? "\nΠΡΟΤΕΙΝΟΜΕΝΟ" : "\nΠΡΟΑΙΡΕΤΙΚΟ", fontSize: 6, color: item.required ? "#7b3d29" : "#666666" }
              ],
              String(item.quantity),
              item.price,
              new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format((item.priceMinor * item.quantity) / 100)
            ])
          ]
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 8]
      });
    }
    content.push({
      text: `Σύνολο επιλεγμένου kit κατά τη δημιουργία: ${new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(kit.totalMinor / 100)}`,
      style: "bodyStrong",
      margin: [0, 0, 0, 8]
    });
    const excluded = kit.items.filter((item) => !item.selected);
    if (excluded.length) {
      content.push({ text: `Μη επιλεγμένα / αφαιρεμένα: ${excluded.map((item) => item.title).join(", ")}`, style: "body", margin: [0, 0, 0, 6] });
    }
    if (kit.unresolvedRequired.length) {
      content.push({ text: "Μη επιλυμένα απαιτούμενα στοιχεία", style: "sectionTitle", margin: [0, 8, 0, 4] });
      content.push({ ul: [...kit.unresolvedRequired], style: "body" });
    }
    if (kit.unavailableAccessorySlots.length) {
      content.push({ text: `Μη διαθέσιμες κατηγορίες αξεσουάρ: ${kit.unavailableAccessorySlots.join(", ")}`, style: "body", margin: [0, 7, 0, 4] });
    }
    content.push({
      text: "Τα αξεσουάρ με ένδειξη KONTA MOU προέρχονται από Project Accessory Rules και δεν παρουσιάζονται ως οδηγίες του κατασκευαστή.",
      style: "sourceSafety",
      margin: [0, 7, 0, 8]
    });
  }

  content.push(...section("Τι χρειάζεσαι", guide.whatYouNeed));

  const quantity = snapshot.quantityEstimate;
  content.push({ text: "Ποσότητα", style: "sectionTitle", margin: [0, 13, 0, 5] });
  if (quantity.status === "available" && quantity.min != null && quantity.max != null) {
    content.push({
      text: quantity.min === quantity.max
        ? `Θεωρητική ποσότητα: ${quantity.min} ${quantity.unit ?? ""}`
        : `Θεωρητικό εύρος: ${quantity.min}–${quantity.max} ${quantity.unit ?? ""}`,
      style: "bodyStrong"
    });
  } else {
    content.push({ text: "Δεν υπολογίστηκε ποσότητα χωρίς πλήρες επαληθευμένο manufacturer dataset.", style: "bodyStrong" });
  }
  content.push({ text: quantity.basisEl, style: "body", margin: [0, 3, 0, 8] });

  content.push({ text: "ΟΔΗΓΙΕΣ ΓΙΑ ΤΑ ΠΡΟΪΟΝΤΑ ΠΟΥ ΕΠΕΛΕΞΕΣ", style: "groupTitle", margin: [0, 18, 0, 5] });
  content.push(...section("Οδηγίες προϊόντος", guide.manufacturerInstructions));
  content.push(...section("Χρόνοι", guide.timings));
  content.push(...section("Τι να αποφύγεις", guide.avoid));
  content.push(...section("Προσοχή", guide.warnings));
  content.push(...section("Μετά την εφαρμογή / Συντήρηση", guide.afterApplication));

  content.push({ text: "ΠΗΓΕΣ & ΙΧΝΗΛΑΣΙΜΟΤΗΤΑ", style: "groupTitle", margin: [0, 18, 0, 6], pageBreak: "before" });
  content.push({
    text: "Οι τεχνικές οδηγίες παραπάνω διατηρούν την προέλευσή τους ως GENERAL_GUIDANCE, MANUFACTURER_VITEX ή KONTA_MOU_RULE. Δεν συγχωνεύονται σιωπηρά όταν υπάρχει σύγκρουση.",
    style: "body",
    margin: [0, 0, 0, 8]
  });
  if (refs.length) {
    content.push({
      ol: refs.map((ref) => ({
        text: ref.url ? [{ text: ref.label }, { text: ` · ${ref.url}`, color: "#575757" }] : ref.label,
        margin: [0, 0, 0, 4]
      })),
      style: "sourceReference"
    });
  } else {
    content.push({ text: "Δεν υπάρχουν πηγές διαθέσιμες στο snapshot. Μην χρησιμοποιήσεις μη τεκμηριωμένη οδηγία ως τεχνικό κανόνα.", style: "warning" });
  }

  content.push({
    text: "Σημαντικό: Ο οδηγός οργανώνει τις επαληθευμένες πληροφορίες του συγκεκριμένου έργου και προϊόντος. Δεν αντικαθιστά αυτοψία ή επαγγελματική διάγνωση όταν υπάρχει ενεργή εισροή νερού, άγνωστη σημαντική υγρασία, δομική/επαναλαμβανόμενη ρωγμή, αστάθεια υποστρώματος, εκτεταμένη αποκόλληση, σοβαρή μούχλα, ζήτημα απορροής/κλίσεων, πιθανή βλάβη σκυροδέματος ή μη ασφαλής πρόσβαση.",
    style: "disclaimer",
    margin: [0, 16, 0, 0]
  });

  return {
    pageSize: "A4",
    pageMargins: [42, 50, 42, 48],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.3, color: "#222222" },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "KONTA MOY · Paint & Build Studio", margin: [42, 10, 0, 0], fontSize: 7, color: "#777777" },
        { text: `Σελίδα ${currentPage} / ${pageCount}`, alignment: "right", margin: [0, 10, 42, 0], fontSize: 7, color: "#777777" }
      ]
    }),
    styles: {
      brand: { fontSize: 10, bold: true, letterSpacing: 1.2 },
      eyebrow: { fontSize: 8, bold: true, color: "#6d5a31" },
      title: { fontSize: 22, bold: true, lineHeight: 1.1 },
      lead: { fontSize: 10, color: "#555555" },
      groupTitle: { fontSize: 14, bold: true, color: "#2d2a25" },
      sectionTitle: { fontSize: 11, bold: true },
      body: { fontSize: 9, lineHeight: 1.3 },
      bodyStrong: { fontSize: 9, bold: true },
      sourceGeneral: { fontSize: 7, bold: true, color: "#526251" },
      sourceManufacturer: { fontSize: 7, bold: true, color: "#305b80" },
      sourceSafety: { fontSize: 7, bold: true, color: "#8a4b34" },
      sourceReference: { fontSize: 7.5, lineHeight: 1.25, color: "#444444" },
      warning: { fontSize: 9, bold: true, color: "#7b3d29", lineHeight: 1.35 },
      disclaimer: { fontSize: 8, color: "#555555", lineHeight: 1.35 }
    },
    content
  };
}

export async function renderPaintBuildProjectPdf(snapshot: PaintBuildProjectSnapshot, referenceId?: string): Promise<Buffer> {
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
      pdfMake.createPdf(buildPaintBuildProjectDocument(snapshot, referenceId)).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
