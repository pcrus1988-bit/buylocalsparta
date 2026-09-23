import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuildGuidanceSourceLayer, BuildGuidanceUiItem } from "./build-guidance-runtime";
import type { PaintBuildProjectSnapshot } from "./paint-build-project-documents";
import { paintBuildFinishLabel, paintBuildGreekText, paintBuildProductTitle, paintBuildTintBaseLabel } from "./paint-build-greek-presentation";

function sourceLabel(layer: BuildGuidanceSourceLayer): string {
  if (layer === "GENERAL_GUIDANCE") return "Γενική τεχνική καθοδήγηση";
  if (layer === "MANUFACTURER_VITEX") return "Οδηγίες κατασκευαστή · VITEX";
  if (layer === "MANUFACTURER") return "Οδηγίες κατασκευαστή";
  return "ΚΟΝΤΑ ΜΟΥ · κανόνας ασφάλειας / ροής";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type PaintBuildPdfAssets = Readonly<{
  brandLogoDataUrl?: string;
  productImageDataUrl?: string;
  kitItemImageDataUrls?: Readonly<Record<string, string>>;
}>;

function values(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => typeof entry === "string" && entry.trim() ? [entry.trim()] : [])
    : [];
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rangeText(min: unknown, max: unknown, suffix = ""): string | undefined {
  const low = numeric(min);
  const high = numeric(max);
  if (low == null && high == null) return undefined;
  if (low != null && high != null && low !== high) return `${Math.min(low, high)}–${Math.max(low, high)}${suffix}`;
  return `${low ?? high}${suffix}`;
}

function joinValues(value: unknown): string | undefined {
  const rows = values(value);
  return rows.length ? rows.join(" · ") : undefined;
}


function pdfGreekText(value: string): string {
  return paintBuildGreekText(value);
}

function projectTypeLabel(value: string): string {
  if (value === "paint") return "Βαφή";
  if (value === "waterproofing") return "Στεγανοποίηση";
  if (value === "insulation") return "Θερμομόνωση";
  if (value === "repair") return "Επισκευή";
  return paintBuildGreekText(value);
}

function kitProductUrl(canonicalVariantId: string): string {
  return `https://kontamou.site/product/${encodeURIComponent(canonicalVariantId)}`;
}

function kitRoleLabel(role: string, required: boolean): string {
  if (required) return "ΑΠΑΡΑΙΤΗΤΟ";
  if (role === "recommended_working") return "ΠΡΟΤΕΙΝΟΜΕΝΟ";
  return "ΠΡΟΑΙΡΕΤΙΚΟ";
}

function absoluteProductUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (raw.startsWith("/")) return `https://kontamou.site${raw}`;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["kontamou.site", "www.kontamou.site"].includes(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function quickGuideItems(snapshot: PaintBuildProjectSnapshot): readonly BuildGuidanceUiItem[] {
  const guide = snapshot.customerGuide;
  const selected = [
    ...guide.beforeYouStart.slice(0, 2),
    ...guide.preparation.slice(0, 2),
    ...guide.stepByStep.slice(0, 3),
    ...guide.warnings.slice(0, 1)
  ];
  const unique = new Map<string, BuildGuidanceUiItem>();
  for (const item of selected) {
    const display = item.shortEl?.trim() || item.textEl.trim();
    if (!display || unique.has(display)) continue;
    unique.set(display, item.shortEl ? { ...item, textEl: item.shortEl } : item);
  }
  return [...unique.values()].slice(0, 6);
}

function productOverview(snapshot: PaintBuildProjectSnapshot, assets: PaintBuildPdfAssets) {
  const product = snapshot.project.selectedProduct;
  if (!product?.title) return [];
  const url = absoluteProductUrl(product.url);
  const size = product.size || (product.packValue != null && product.packUnit ? `${product.packValue}${product.packUnit}` : undefined);
  const productColour = paintBuildTintBaseLabel(product.colour || product.tintBase);
  const swatch = snapshot.project.colour && /^#[0-9A-Fa-f]{6}$/.test(snapshot.project.colour)
    ? { canvas: [{ type: "rect", x: 0, y: 0, w: 16, h: 16, color: snapshot.project.colour, lineColor: "#D2CAC0" }], width: 22 }
    : undefined;
  const productImage = assets.productImageDataUrl
    ? { image: assets.productImageDataUrl, fit: [86, 86], alignment: "center", margin: [0, 2, 0, 2] }
    : { text: "ΦΩΤΟΓΡΑΦΙΑ\nΠΡΟΪΟΝΤΟΣ", alignment: "center", color: "#8C8177", fontSize: 8, margin: [0, 28, 0, 0] };
  const qr = url
    ? { stack: [{ qr: url, fit: 66, alignment: "center" }, { text: "Άνοιξε το προϊόν", alignment: "center", fontSize: 7, color: "#6C625A", margin: [0, 4, 0, 0] }] }
    : { text: "QR μη διαθέσιμο", alignment: "center", color: "#8C8177", fontSize: 7, margin: [0, 32, 0, 0] };
  return [
    { text: "ΤΟ ΠΡΟΪΟΝ ΠΟΥ ΕΠΕΛΕΞΕΣ", style: "groupTitle", margin: [0, 16, 0, 6] },
    {
      table: {
        widths: [96, "*", 82],
        body: [[productImage, {
          stack: [
            { text: product.brand || "VITEX", style: "eyebrow", margin: [0, 0, 0, 3] },
            { text: paintBuildProductTitle(product.title), style: "productTitle", margin: [0, 0, 0, 7] },
            { columns: [
              swatch ?? { width: 0, text: "" },
              { width: "*", stack: [
                { text: `Χρώμα / βάση: ${productColour || snapshot.project.colour || "—"}`, style: "productMeta" },
                { text: `Συσκευασία: ${size || "—"}`, style: "productMeta" },
                product.finish ? { text: `Φινίρισμα: ${paintBuildFinishLabel(product.finish)}`, style: "productMeta" } : { text: "" },
                product.price ? { text: `Τιμή κατά την επιλογή: ${product.price}`, style: "productMetaStrong", margin: [0, 4, 0, 0] } : { text: "" }
              ] }
            ] }
          ]
        }, qr]]
      },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => "#D8D0C6",
        vLineColor: () => "#D8D0C6",
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      fillColor: "#FBF9F5",
      margin: [0, 0, 0, 10]
    },
    url ? { text: url, fontSize: 6.5, color: "#736A62", margin: [0, 0, 0, 8] } : { text: "" }
  ];
}

function quickGuideSection(snapshot: PaintBuildProjectSnapshot) {
  const items = quickGuideItems(snapshot);
  if (!items.length) return [];
  return [
    { text: "ΣΥΝΤΟΜΗ ΚΑΘΟΔΗΓΗΣΗ", style: "groupTitle", margin: [0, 12, 0, 6] },
    {
      table: {
        widths: [24, "*"],
        body: items.map((item, index) => [
          { text: String(index + 1).padStart(2, "0"), style: "quickNumber" },
          { stack: [
            { text: pdfGreekText(item.textEl), style: "quickText" },
            { text: sourceLabel(item.sourceLayer), style: item.sourceLayer === "KONTA_MOU_RULE" ? "sourceSafety" : item.sourceLayer.startsWith("MANUFACTURER") ? "sourceManufacturer" : "sourceGeneral", margin: [0, 3, 0, 0] }
          ] }
        ])
      },
      layout: {
        hLineWidth: (i: number) => i === 0 ? 0 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#E5DED5",
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 4,
        paddingRight: () => 6
      },
      margin: [0, 0, 0, 10]
    }
  ];
}

function manufacturerDataSheet(snapshot: PaintBuildProjectSnapshot) {
  const manufacturer = record(snapshot.guidance.manufacturer_guidance);
  const profile = record(manufacturer.application_profile);
  if (text(manufacturer.status) !== "verified" || !Object.keys(profile).length) return [];
  const scalarRows: Array<[string, string]> = [];
  const push = (label: string, value: string | undefined) => { if (value) scalarRows.push([label, pdfGreekText(value)]); };
  push("Κάλυψη", rangeText(profile.coverage_m2_per_litre_min, profile.coverage_m2_per_litre_max, " m²/L"));
  push("Αριθμός στρώσεων", rangeText(profile.number_of_coats_min, profile.number_of_coats_max, ""));
  const dilution = rangeText(profile.dilution_percent_min, profile.dilution_percent_max, "%");
  const dilutionMaterial = text(profile.dilution_material);
  if (profile.dilution_required === true) push("Αραίωση", dilution ? `${dilution}${dilutionMaterial ? ` με ${dilutionMaterial}` : ""}` : "Απαιτείται σύμφωνα με την τεχνική καρτέλα");
  if (profile.dilution_required === false) push("Αραίωση", "Δεν απαιτείται");
  push("Τρόποι εφαρμογής", joinValues(profile.application_methods));
  push("Στέγνωμα στην αφή", rangeText(profile.dry_to_touch_minutes_min, profile.dry_to_touch_minutes_max, " λεπτά"));
  push("Επαναβαφή", rangeText(profile.recoat_minutes_min, profile.recoat_minutes_max, " λεπτά"));
  push("Πλήρης ωρίμανση", rangeText(profile.full_cure_minutes_min, profile.full_cure_minutes_max, " λεπτά"));
  if (typeof profile.primer_required === "boolean") push("Αστάρι", profile.primer_required ? "Απαιτείται" : "Δεν απαιτείται ως γενικός κανόνας προϊόντος");
  push("Προτεινόμενα αστάρια", joinValues(profile.recommended_primers));
  push("Απαιτούμενα στοιχεία συστήματος", joinValues(profile.required_system_components));
  push("Προτεινόμενο ρολό", text(profile.recommended_roller));
  push("Προτεινόμενη βούρτσα", text(profile.recommended_brush));
  push("Συνθήκες κάλυψης", text(profile.coverage_conditions));
  push("Απαιτήσεις υγρασίας", text(profile.moisture_requirements));
  push("Απαίτηση κατάστασης επιφάνειας", text(profile.surface_condition_required));
  push("Θερμοκρασία αέρα / επιφάνειας / υλικού", text(profile.substrate_temperature_requirements));
  push("Περιορισμός άμεσου ήλιου", text(profile.direct_sun_restrictions));
  push("Περιορισμός βροχής", text(profile.rain_restrictions));
  push("Περιορισμός δρόσου / συμπύκνωσης", text(profile.dew_or_condensation_restrictions));
  push("Συνθήκες αποθήκευσης", text(profile.storage_conditions));
  push("Διάρκεια αποθήκευσης", text(profile.shelf_life));
  push("Πληροφορίες ΠΟΕ", text(profile.voc_information));

  const detailGroups = [
    ["Προετοιμασία επιφάνειας", values(profile.surface_preparation).map(pdfGreekText)],
    ["Καθαρισμός πριν την εφαρμογή", values(profile.cleaning_before_application).map(pdfGreekText)],
    ["Απαιτήσεις επισκευής", values(profile.repair_requirements).map(pdfGreekText)],
    ["Ανάδευση / προετοιμασία υλικού", values(profile.mixing_instructions).map(pdfGreekText)],
    ["Καθαρισμός εργαλείων", values(profile.tool_cleaning).map(pdfGreekText)],
    ["Μέσα ατομικής προστασίας", values(profile.ppe_requirements).map(pdfGreekText)],
    ["Περιορισμοί καιρού / περιβάλλοντος", values(profile.weather_restrictions).map(pdfGreekText)],
    ["Τι να αποφεύγεις", values(profile.manufacturer_do_not_do).map(pdfGreekText)],
    ["Δεν είναι κατάλληλο για", values(profile.not_suitable_for).map(pdfGreekText)],
    ["Προειδοποιήσεις ασφαλείας", values(profile.safety_warnings).map(pdfGreekText)],
    ["Ειδικές σημειώσεις εφαρμογής", values(profile.special_application_notes).map(pdfGreekText)]
  ] as const;

  const content: unknown[] = [
    { text: "ΤΕΧΝΙΚΗ ΚΑΡΤΑ ΕΠΙΛΕΓΜΕΝΟΥ ΠΡΟΪΟΝΤΟΣ", style: "groupTitle", margin: [0, 18, 0, 6], pageBreak: "before" },
    { text: "Εμφανίζονται μόνο τα πεδία που υπάρχουν στα επαληθευμένα στοιχεία του κατασκευαστή για το επιλεγμένο προϊόν.", style: "body", margin: [0, 0, 0, 8] }
  ];
  if (scalarRows.length) {
    content.push({
      table: {
        widths: [150, "*"],
        body: scalarRows.map(([label, value]) => [{ text: label, style: "dataLabel" }, { text: value, style: "dataValue" }])
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#E1DAD2",
        paddingTop: () => 5,
        paddingBottom: () => 5,
        paddingLeft: () => 4,
        paddingRight: () => 4
      },
      margin: [0, 0, 0, 10]
    });
  }
  for (const [label, rows] of detailGroups) {
    if (!rows.length) continue;
    content.push({ text: label, style: "sectionTitle", margin: [0, 10, 0, 4] });
    content.push({ ul: rows.map((row) => ({ text: row, margin: [0, 0, 0, 4] })), style: "body" });
  }
  return content;
}

function safeImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) return `https://kontamou.site${value}`;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en");
    const allowed = url.protocol === "https:" && (
      host === "kontamou.site" || host === "www.kontamou.site" ||
      host === "eemihhfreggbigxejjhj.supabase.co" || host === "media.adeo.com" ||
      host.endsWith(".leroymerlin.gr")
    );
    return allowed ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function rasterDataUrl(buffer: Buffer, mime?: string): Promise<string | undefined> {
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg") {
    const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
    return `data:${normalized};base64,${buffer.toString("base64")}`;
  }
  try {
    const sharpModule: any = await import("sharp");
    const sharp = sharpModule.default ?? sharpModule;
    const png = await sharp(buffer).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function fetchPdfImage(url: string | undefined): Promise<string | undefined> {
  const safe = safeImageUrl(url);
  if (!safe) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(safe, { cache: "no-store", signal: controller.signal, headers: { Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8" } });
    if (!response.ok) return undefined;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 8 * 1024 * 1024) return undefined;
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > 8 * 1024 * 1024) return undefined;
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLocaleLowerCase("en");
    return rasterDataUrl(data, mime);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function brandLogoDataUrl(): Promise<string | undefined> {
  const candidates = [
    join(process.cwd(), "public", "brand", "kontamou-sparta-logo.webp"),
    join(process.cwd(), "apps", "web", "public", "brand", "kontamou-sparta-logo.webp")
  ];
  for (const candidate of candidates) {
    try {
      const data = await readFile(candidate);
      const converted = await rasterDataUrl(data, "image/webp");
      if (converted) return converted;
    } catch {
      // Try the next deployment-root candidate.
    }
  }
  return undefined;
}

async function loadPaintBuildPdfAssets(snapshot: PaintBuildProjectSnapshot): Promise<PaintBuildPdfAssets> {
  const product = snapshot.project.selectedProduct;
  const imageSource = product?.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : product?.imageUrl;
  const selectedKitItems = snapshot.project.kit?.items.filter((item) => item.selected).slice(0, 16) ?? [];
  const [brandLogo, productImage, kitImages] = await Promise.all([
    brandLogoDataUrl(),
    fetchPdfImage(imageSource),
    Promise.all(selectedKitItems.map(async (item) => [
      item.canonicalVariantId,
      await fetchPdfImage(item.imageUrl)
    ] as const))
  ]);
  return {
    brandLogoDataUrl: brandLogo,
    productImageDataUrl: productImage,
    kitItemImageDataUrls: Object.fromEntries(
      kitImages.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    )
  };
}


type SnapshotKitItem = NonNullable<PaintBuildProjectSnapshot["project"]["kit"]>["items"][number];

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function kitItemCard(item: SnapshotKitItem, index: number, assets: PaintBuildPdfAssets) {
  const image = assets.kitItemImageDataUrls?.[item.canonicalVariantId];
  const url = kitProductUrl(item.canonicalVariantId);
  const role = kitRoleLabel(item.role, item.required);
  return {
    table: {
      widths: [58, "*", 70, 58],
      body: [[
        image
          ? { image, fit: [48, 48], alignment: "center", margin: [0, 3, 0, 3] }
          : { text: String(index + 1).padStart(2, "0"), style: "kitIndex", alignment: "center", margin: [0, 15, 0, 0] },
        {
          stack: [
            { text: role, style: item.required ? "kitRoleRequired" : "kitRole", margin: [0, 0, 0, 4] },
            { text: paintBuildProductTitle(item.title), style: "kitItemTitle" },
            item.reasonEl ? { text: pdfGreekText(item.reasonEl), style: "kitReason", margin: [0, 4, 0, 0] } : { text: "" }
          ]
        },
        {
          stack: [
            { text: `${item.quantity} × ${item.price}`, style: "kitPriceSmall", alignment: "right" },
            { text: euro(item.priceMinor * item.quantity), style: "kitPrice", alignment: "right", margin: [0, 5, 0, 0] }
          ],
          margin: [0, 7, 0, 0]
        },
        {
          stack: [
            { qr: url, fit: 46, alignment: "center" },
            { text: "Σάρωσε", style: "qrCaption", alignment: "center", margin: [0, 2, 0, 0] }
          ]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => "#DED7CF",
      vLineColor: () => "#DED7CF",
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 7,
      paddingBottom: () => 7
    },
    fillColor: "#FCFAF6",
    margin: [0, 0, 0, 8],
    unbreakable: true
  };
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
    { text: pdfGreekText(item.textEl), style: "body", margin: [0, 0, 0, 5] }
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

export function buildPaintBuildProjectDocument(snapshot: PaintBuildProjectSnapshot, referenceId?: string, assets: PaintBuildPdfAssets = {}): Record<string, unknown> {
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
    {
      columns: [
        assets.brandLogoDataUrl
          ? { image: assets.brandLogoDataUrl, width: 122, margin: [0, 0, 0, 0] }
          : { text: "KONTA MOY", style: "brand" },
        { text: "ΟΔΗΓΟΣ ΒΑΦΗΣ & ΚΑΤΑΣΚΕΥΗΣ · ΑΝΑΛΥΤΙΚΟ ΕΡΓΟ", style: "eyebrow", alignment: "right", margin: [0, 5, 0, 0] }
      ],
      margin: [0, 0, 0, 14]
    },
    { text: project.title, style: "title" },
    { text: pdfGreekText(project.summary || projectTypeLabel(project.projectType)), style: "lead", margin: [0, 5, 0, 12] },
    {
      table: {
        widths: [118, "*"],
        body: [
          ["Αναφορά έργου", referenceId || "—"],
          ["Δημιουργήθηκε", createdLabel],
          ["Τύπος έργου", projectTypeLabel(project.projectType)],
          ["Επιφάνεια", project.areaM2 ? `${project.areaM2} m²` : "—"],
          ["Απόχρωση", project.colour || "—"]
        ]
      },
      layout: {
        hLineWidth: (i: number) => i === 0 ? 0 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#DDD6CE",
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 5,
        paddingRight: () => 5
      },
      fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? "#FBF9F5" : "#FFFFFF",
      margin: [0, 0, 0, 12]
    }
  ];

  content.push(...productOverview(snapshot, assets));
  content.push(...quickGuideSection(snapshot));

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

  content.push({ text: "ΤΑ ΥΛΙΚΑ ΣΟΥ", style: "groupTitle", margin: [0, 18, 0, 6] });
  if (selected?.title) {
    content.push({
      table: {
        widths: [118, "*"],
        body: [
          ["Προϊόν", paintBuildProductTitle(selected.title)],
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
    content.push({ text: "ΠΛΗΡΕΣ ΣΕΤ ΥΛΙΚΩΝ ΕΡΓΟΥ", style: "sectionTitle", margin: [0, 13, 0, 5] });
    content.push({
      table: {
        widths: ["*"],
        body: [[{
          stack: [
            { text: kit.complete ? "ΠΛΗΡΕΣ ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΥΣΤΗΜΑ" : "ΤΟ ΣΥΣΤΗΜΑ ΧΡΕΙΑΖΕΤΑΙ ΣΥΜΠΛΗΡΩΣΗ", style: kit.complete ? "kitStatusGood" : "kitStatusWarn" },
            { text: kit.complete
              ? "Τα απαιτούμενα υλικά του τεκμηριωμένου συστήματος περιλαμβάνονται στο έργο."
              : "Ένα ή περισσότερα απαιτούμενα στοιχεία λείπουν, αφαιρέθηκαν ή δεν έχουν επαληθευμένη αυτόματη ποσότητα.", style: "kitStatusCopy", margin: [0, 3, 0, 0] }
          ]
        }]]
      },
      layout: "noBorders",
      fillColor: kit.complete ? "#EEF5EF" : "#FFF4EA",
      margin: [0, 0, 0, 9]
    });
    const selectedKitItems = kit.items.filter((item) => item.selected);
    if (selectedKitItems.length) {
      selectedKitItems.forEach((item, index) => content.push(kitItemCard(item, index, assets)));
    }
    content.push({
      table: {
        widths: ["*", "auto"],
        body: [[
          { text: "ΣΥΝΟΛΟ ΕΠΙΛΕΓΜΕΝΩΝ ΥΛΙΚΩΝ", style: "kitTotalLabel" },
          { text: euro(kit.totalMinor), style: "kitTotalValue", alignment: "right" }
        ]]
      },
      layout: "noBorders",
      fillColor: "#2B211C",
      margin: [0, 2, 0, 10]
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
      text: "Τα αξεσουάρ με ένδειξη ΚΟΝΤΑ ΜΟΥ προτείνονται από τους κανόνες υλικών του έργου και δεν παρουσιάζονται ως οδηγίες του κατασκευαστή.",
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
    content.push({ text: "Δεν υπολογίστηκε ποσότητα επειδή λείπουν πλήρη επαληθευμένα στοιχεία του κατασκευαστή.", style: "bodyStrong" });
  }
  content.push({ text: pdfGreekText(quantity.basisEl), style: "body", margin: [0, 3, 0, 8] });

  content.push(...manufacturerDataSheet(snapshot));
  content.push({ text: "ΑΝΑΛΥΤΙΚΕΣ ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ ΠΡΟΪΟΝΤΟΣ", style: "groupTitle", margin: [0, 18, 0, 5] });
  content.push(...section("Οδηγίες προϊόντος", guide.manufacturerInstructions));
  content.push(...section("Χρόνοι", guide.timings));
  content.push(...section("Τι να αποφύγεις", guide.avoid));
  content.push(...section("Προσοχή", guide.warnings));
  content.push(...section("Μετά την εφαρμογή / Συντήρηση", guide.afterApplication));

  content.push({ text: "ΠΗΓΕΣ & ΙΧΝΗΛΑΣΙΜΟΤΗΤΑ", style: "groupTitle", margin: [0, 18, 0, 6], pageBreak: "before" });
  content.push({
    text: "Κάθε τεχνική οδηγία διατηρεί σαφή προέλευση: γενική τεχνική καθοδήγηση, επίσημες οδηγίες κατασκευαστή VITEX ή κανόνες ασφάλειας και ροής του ΚΟΝΤΑ ΜΟΥ. Σε περίπτωση σύγκρουσης οι πηγές δεν συγχωνεύονται αυτόματα.",
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
    content.push({ text: "Δεν υπάρχουν διαθέσιμες πηγές στο αποθηκευμένο έργο. Μην χρησιμοποιήσεις μη τεκμηριωμένη οδηγία ως τεχνικό κανόνα.", style: "warning" });
  }

  content.push({
    text: "Σημαντικό: Ο οδηγός οργανώνει τις επαληθευμένες πληροφορίες του συγκεκριμένου έργου και προϊόντος. Δεν αντικαθιστά αυτοψία ή επαγγελματική διάγνωση όταν υπάρχει ενεργή εισροή νερού, άγνωστη σημαντική υγρασία, δομική/επαναλαμβανόμενη ρωγμή, αστάθεια υποστρώματος, εκτεταμένη αποκόλληση, σοβαρή μούχλα, ζήτημα απορροής/κλίσεων, πιθανή βλάβη σκυροδέματος ή μη ασφαλής πρόσβαση.",
    style: "disclaimer",
    margin: [0, 16, 0, 0]
  });

  return {
    pageSize: "A4",
    pageMargins: [36, 42, 36, 46],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.3, color: "#222222" },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "ΚΟΝΤΑ ΜΟΥ · Οδηγός Βαφής & Κατασκευής", margin: [36, 10, 0, 0], fontSize: 7, color: "#777777" },
        { text: `Σελίδα ${currentPage} / ${pageCount}`, alignment: "right", margin: [0, 10, 36, 0], fontSize: 7, color: "#777777" }
      ]
    }),
    styles: {
      brand: { fontSize: 13, bold: true, letterSpacing: 1.4, color: "#241813" },
      eyebrow: { fontSize: 8, bold: true, color: "#8A6A32" },
      title: { fontSize: 22, bold: true, lineHeight: 1.1, color: "#241813" },
      lead: { fontSize: 10, color: "#5E554E" },
      groupTitle: { fontSize: 14, bold: true, color: "#241813" },
      sectionTitle: { fontSize: 11, bold: true, color: "#332B26" },
      productTitle: { fontSize: 14, bold: true, color: "#241813", lineHeight: 1.15 },
      productMeta: { fontSize: 8.5, color: "#514943", lineHeight: 1.3 },
      productMetaStrong: { fontSize: 9, bold: true, color: "#241813" },
      quickNumber: { fontSize: 9, bold: true, color: "#9A7B43", alignment: "center" },
      quickText: { fontSize: 9.2, lineHeight: 1.3, color: "#2E2925" },
      dataLabel: { fontSize: 8.5, bold: true, color: "#5E554E" },
      dataValue: { fontSize: 8.5, color: "#24201D", lineHeight: 1.3 },
      kitIndex: { fontSize: 18, bold: true, color: "#B69454" },
      kitRoleRequired: { fontSize: 6.5, bold: true, color: "#8A4B34", letterSpacing: 0.5 },
      kitRole: { fontSize: 6.5, bold: true, color: "#6F6258", letterSpacing: 0.5 },
      kitItemTitle: { fontSize: 9.5, bold: true, color: "#28221E", lineHeight: 1.2 },
      kitReason: { fontSize: 7.2, color: "#6F665F", lineHeight: 1.25 },
      kitPriceSmall: { fontSize: 7.5, color: "#746A62" },
      kitPrice: { fontSize: 10, bold: true, color: "#8A6A32" },
      qrCaption: { fontSize: 6, color: "#7B7169" },
      kitStatusGood: { fontSize: 8, bold: true, color: "#477154" },
      kitStatusWarn: { fontSize: 8, bold: true, color: "#8A4B34" },
      kitStatusCopy: { fontSize: 7.5, color: "#5E554E", lineHeight: 1.3 },
      kitTotalLabel: { fontSize: 8, bold: true, color: "#EAD9B5", margin: [8, 7, 0, 7] },
      kitTotalValue: { fontSize: 13, bold: true, color: "#FFFFFF", margin: [0, 5, 8, 5] },
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
  const assets = await loadPaintBuildPdfAssets(snapshot);
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      pdfMake.createPdf(buildPaintBuildProjectDocument(snapshot, referenceId, assets)).getBuffer((buffer: Uint8Array) => resolve(Buffer.from(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}
