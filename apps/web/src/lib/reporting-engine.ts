import { createHash } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";
import { sendTransactionalEmailBestEffort } from "./transactional-email";

export type ReportActorKind = "vendor" | "admin";
export type ReportDomain = "sales" | "commissions" | "inventory" | "performance" | "fairness" | "returns" | "search";
export type ReportPreset = "sales_commissions" | "inventory" | "performance" | "full" | "custom";

export type ReportSpec = Readonly<{
  preset: ReportPreset;
  title: string;
  prompt?: string;
  fromDate: string;
  toDate: string;
  domains: readonly ReportDomain[];
  vendorId?: string;
  categoryId?: string;
  productId?: string;
  locationId?: string;
  brandId?: string;
  comparePrevious: boolean;
  includeDetails: boolean;
}>;

export type ReportPlannerSnapshot = Readonly<{
  domains: readonly ReportDomain[];
  complexityScore: number;
  executionMode: "inline" | "worker";
  maxDetailRows: number;
  notes: readonly string[];
}>;

export type ReportJobListItem = Readonly<{
  publicId: string;
  title: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
  expiresAt: string;
  rowCount: number;
  pageCount: number;
  summary: Record<string, unknown>;
  errorMessage?: string;
}>;

export type ReportBuilderOptions = Readonly<{
  vendors: readonly { id: string; label: string }[];
  categories: readonly { id: string; label: string }[];
  products: readonly { id: string; label: string; vendorId?: string }[];
  locations: readonly { id: string; label: string; vendorId: string }[];
  brands: readonly { id: string; label: string }[];
}>;

type QueryFilters = Readonly<{
  marketId: string;
  timezone: string;
  fromDate: string;
  toDate: string;
  vendorId?: string;
  categoryIds: readonly string[];
  productId?: string;
  locationId?: string;
  brandId?: string;
  maxRows: number;
}>;

type SalesRow = {
  vendorId: string; vendorName: string; categoryId: string; categoryName: string;
  productId: string; productName: string; sku: string; brand: string;
  orders: number; units: number; fulfilledUnits: number; refundedUnits: number;
  grossMinor: number; refundMinor: number; netMinor: number;
  commissionNetMinor: number; commissionTaxMinor: number; commissionTotalMinor: number;
  vendorProceedsMinor: number;
};

type PerformanceRow = {
  vendorId: string; vendorName: string; categoryId: string; categoryName: string;
  productId: string; productName: string; brand: string;
  impressions: number; pageViews: number; uniqueViewers: number; engagedSeconds: number;
  addToCarts: number; checkoutStarts: number; purchases: number; unitsSold: number; revenueMinor: number;
};

type InventoryRow = {
  vendorId: string; vendorName: string; locationId: string; locationName: string;
  categoryId: string; categoryName: string; productId: string; productName: string;
  sku: string; brand: string; onHand: number; reserved: number; safetyStock: number;
  blocked: number; available: number; freshnessStatus: string; stockConfirmedAt: string;
};

type InventoryMovementRow = {
  vendorId: string; vendorName: string; productId: string; productName: string;
  sku: string; movementType: string; quantityDelta: number; source: string; occurredAt: string;
};

type SearchRow = {
  query: string; normalizedQuery: string; searches: number; zeroResults: number; clicks: number;
  averageResults: number;
};

type ReportDatasets = {
  sales?: SalesRow[];
  performance?: PerformanceRow[];
  inventory?: InventoryRow[];
  inventoryMovements?: InventoryMovementRow[];
  search?: SearchRow[];
};

const DOMAIN_SET = new Set<ReportDomain>(["sales","commissions","inventory","performance","fairness","returns","search"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function reportBuilderOptions(actor: ReportActorKind, principal: SessionPrincipal): Promise<ReportBuilderOptions> {
  if (!productionDatabaseConfigured()) return { vendors: [], categories: [], products: [], locations: [], brands: [] };
  const pool = getProductionPostgresRuntime().nativePool;
  const vendorId = actor === "vendor" ? principal.vendorId : undefined;
  const market = await resolveMarket(pool, vendorId);
  const params = [market.id, vendorId ?? null];
  const [vendors, categories, products, locations, brands] = await Promise.all([
    pool.query(`SELECT id::text, COALESCE(NULLIF(trading_name,''), legal_name, public_id) AS label
      FROM vendor_businesses WHERE market_id=$1 AND ($2::uuid IS NULL OR id=$2::uuid)
      ORDER BY label LIMIT 1000`, params),
    pool.query(`SELECT c.id::text, COALESCE(ct_el.name, ct_en.name, c.code, c.slug) AS label
      FROM categories c
      LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
      LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
      WHERE c.market_id=$1 AND c.active=true ORDER BY c.sort_order, label LIMIT 2000`, [market.id]),
    pool.query(`SELECT DISTINCT cv.id::text,
        COALESCE(pt_el.title, pt_en.title, cv.model, cv.public_id) AS label,
        vo.vendor_id::text AS vendor_id
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      WHERE vo.market_id=$1 AND ($2::uuid IS NULL OR vo.vendor_id=$2::uuid)
      ORDER BY label LIMIT 5000`, params),
    pool.query(`SELECT vl.id::text, vl.vendor_id::text AS vendor_id,
        COALESCE(NULLIF(vl.name,''), NULLIF(vl.locality,''), vl.public_id) AS label
      FROM vendor_locations vl WHERE vl.market_id=$1 AND ($2::uuid IS NULL OR vl.vendor_id=$2::uuid)
      ORDER BY label LIMIT 1000`, params),
    pool.query(`SELECT DISTINCT b.id::text, b.name AS label FROM brands b
      JOIN canonical_variants cv ON cv.brand_id=b.id
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      WHERE vo.market_id=$1 AND ($2::uuid IS NULL OR vo.vendor_id=$2::uuid)
      ORDER BY b.name LIMIT 2000`, params)
  ]);
  return {
    vendors: vendors.rows.map((r: any) => ({ id: String(r.id), label: String(r.label) })),
    categories: categories.rows.map((r: any) => ({ id: String(r.id), label: String(r.label) })),
    products: products.rows.map((r: any) => ({ id: String(r.id), label: String(r.label), vendorId: String(r.vendor_id) })),
    locations: locations.rows.map((r: any) => ({ id: String(r.id), label: String(r.label), vendorId: String(r.vendor_id) })),
    brands: brands.rows.map((r: any) => ({ id: String(r.id), label: String(r.label) }))
  };
}

export function reportSpecFromForm(actor: ReportActorKind, principal: SessionPrincipal, form: FormData): ReportSpec {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const presetRaw = field(form, "preset");
  const preset: ReportPreset = ["sales_commissions","inventory","performance","full","custom"].includes(presetRaw) ? presetRaw as ReportPreset : "full";
  const fromDate = validDate(field(form, "fromDate")) ?? shiftIsoDate(today, -29);
  const toDate = validDate(field(form, "toDate")) ?? today;
  if (fromDate > toDate) throw new Error("Η ημερομηνία έναρξης πρέπει να είναι πριν από την ημερομηνία λήξης.");
  if (daysBetween(fromDate, toDate) > 3660) throw new Error("Το μέγιστο εύρος αναφοράς είναι 10 έτη.");

  const prompt = field(form, "prompt").slice(0, 2000).trim() || undefined;
  const selected = form.getAll("domains").map(String).filter((d): d is ReportDomain => DOMAIN_SET.has(d as ReportDomain));
  let domains = selected.length ? selected : domainsForPreset(preset);
  domains = augmentDomainsFromPrompt(domains, prompt);
  if (actor === "vendor") domains = domains.filter((d) => d !== "search");
  if (!domains.length) domains = ["sales","commissions","inventory","performance"];

  const title = (field(form, "title").trim() || defaultTitle(preset)).slice(0, 240);
  const candidateVendor = validUuid(field(form, "vendorId"));
  return {
    preset, title, prompt, fromDate, toDate, domains: [...new Set(domains)],
    vendorId: actor === "vendor" ? principal.vendorId : candidateVendor,
    categoryId: validUuid(field(form, "categoryId")),
    productId: validUuid(field(form, "productId")),
    locationId: validUuid(field(form, "locationId")),
    brandId: validUuid(field(form, "brandId")),
    comparePrevious: field(form, "comparePrevious") === "on",
    includeDetails: field(form, "includeDetails") !== "off"
  };
}

export function planReport(spec: ReportSpec): ReportPlannerSnapshot {
  let score = spec.domains.length * 2;
  score += Math.min(8, Math.ceil(daysBetween(spec.fromDate, spec.toDate) / 90));
  if (!spec.vendorId) score += 5;
  if (spec.includeDetails) score += 2;
  if (spec.comparePrevious) score += 3;
  const notes: string[] = [];
  if (spec.domains.includes("inventory") && spec.domains.includes("performance")) notes.push("Cross-checks stock availability against product demand.");
  if (spec.domains.includes("sales") && spec.domains.includes("commissions")) notes.push("Uses immutable order-line commission snapshots for historical accuracy.");
  if (spec.domains.includes("fairness") && spec.domains.includes("performance")) notes.push("Connects Fair Vendor Exposure with downstream funnel outcomes.");
  if (spec.domains.includes("search")) notes.push("Search demand is platform-only and available only to administrators.");
  const asyncEnabled = process.env.BLS_REPORT_ASYNC_ENABLED === "true";
  return { domains: spec.domains, complexityScore: score, executionMode: asyncEnabled && score >= 15 ? "worker" : "inline", maxDetailRows: score >= 18 ? 750 : 1500, notes };
}

export async function createReport(actor: ReportActorKind, principal: SessionPrincipal, spec: ReportSpec): Promise<ReportJobListItem> {
  if (!productionDatabaseConfigured()) throw new Error("Η βάση δεδομένων παραγωγής δεν είναι διαθέσιμη.");
  if (actor === "vendor" && (!principal.vendorId || spec.vendorId !== principal.vendorId)) throw new Error("VENDOR_REPORT_SCOPE_DENIED");
  const pool = getProductionPostgresRuntime().nativePool;
  const market = await resolveMarket(pool, actor === "vendor" ? principal.vendorId : spec.vendorId);
  if (spec.vendorId) await assertVendorInMarket(pool, spec.vendorId, market.id);
  const planner = planReport(spec);
  const inserted = await pool.query(`INSERT INTO report_jobs
    (requester_user_id, requester_kind, market_id, vendor_id, title, requested_prompt, report_spec, planner_snapshot, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'queued')
    RETURNING public_id`, [principal.userId, actor, market.id, spec.vendorId ?? null, spec.title, spec.prompt ?? null, JSON.stringify(spec), JSON.stringify(planner)]);
  const publicId = String(inserted.rows[0].public_id);
  if (planner.executionMode === "inline") await generateReportJob(publicId);
  return await getReportListItem(pool, publicId);
}

export async function listReports(actor: ReportActorKind, principal: SessionPrincipal, limit = 40): Promise<readonly ReportJobListItem[]> {
  if (!productionDatabaseConfigured()) return [];
  const pool = getProductionPostgresRuntime().nativePool;
  const result = actor === "vendor"
    ? await pool.query(`SELECT public_id,title,status,requested_at,completed_at,expires_at,row_count,page_count,summary,error_message
        FROM report_jobs WHERE vendor_id=$1 AND requester_kind='vendor'
        ORDER BY requested_at DESC LIMIT $2`, [principal.vendorId, limit])
    : await pool.query(`SELECT public_id,title,status,requested_at,completed_at,expires_at,row_count,page_count,summary,error_message
        FROM report_jobs WHERE requester_user_id=$1
        ORDER BY requested_at DESC LIMIT $2`, [principal.userId, limit]);
  return result.rows.map(mapJob);
}

export async function generateReportJob(publicId: string): Promise<void> {
  const pool = getProductionPostgresRuntime().nativePool;
  const claimed = await pool.query(`UPDATE report_jobs SET status='running', started_at=COALESCE(started_at,now()), updated_at=now(), error_message=NULL
    WHERE public_id=$1 AND status IN ('queued','failed') RETURNING *`, [publicId]);
  if (!claimed.rowCount) {
    const existing = await pool.query(`SELECT status FROM report_jobs WHERE public_id=$1`, [publicId]);
    if (String(existing.rows[0]?.status ?? "") === "ready") return;
    throw new Error("Report job is not available for generation.");
  }
  const job = claimed.rows[0];
  try {
    const spec = normalizeStoredSpec(job.report_spec, job.requester_kind, job.vendor_id);
    const planner = planReport(spec);
    const market = await resolveMarketById(pool, String(job.market_id));
    const categoryIds = await resolveCategoryIds(pool, spec.categoryId, market.id);
    const filters: QueryFilters = {
      marketId: market.id, timezone: market.timezone, fromDate: spec.fromDate, toDate: spec.toDate,
      vendorId: spec.vendorId, categoryIds, productId: spec.productId, locationId: spec.locationId,
      brandId: spec.brandId, maxRows: planner.maxDetailRows
    };
    const datasets = await executeDatasets(pool, spec, filters);
    let comparisonDatasets: ReportDatasets | undefined;
    if (spec.comparePrevious) {
      const span = daysBetween(spec.fromDate, spec.toDate);
      const previousTo = shiftIsoDate(spec.fromDate, -1);
      const previousFrom = shiftIsoDate(previousTo, -(span - 1));
      comparisonDatasets = await executeDatasets(pool, { ...spec, fromDate: previousFrom, toDate: previousTo, domains: spec.domains.filter((d) => d !== "inventory") }, { ...filters, fromDate: previousFrom, toDate: previousTo });
    }
    const summary = buildSummary(spec, datasets, comparisonDatasets);
    const pdf = await buildPdf(spec, planner, summary, datasets);
    const sha = createHash("sha256").update(pdf.bytes).digest("hex");
    await pool.query(`UPDATE report_jobs SET status='ready', summary=$2::jsonb, datasets=$3::jsonb, pdf_bytes=$4,
      pdf_sha256=$5, page_count=$6, row_count=$7, completed_at=now(), updated_at=now(), error_message=NULL
      WHERE public_id=$1`, [publicId, JSON.stringify(summary), JSON.stringify(datasets), pdf.bytes, sha, pdf.pages, countRows(datasets)]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`UPDATE report_jobs SET status='failed', error_message=$2, updated_at=now() WHERE public_id=$1`, [publicId, message.slice(0, 4000)]);
    throw error;
  }
}

export async function processQueuedReports(limit = 2): Promise<{ processed: number; failed: number }> {
  const pool = getProductionPostgresRuntime().nativePool;
  const expired = await pool.query(`UPDATE report_jobs SET status='expired', pdf_bytes=NULL, datasets='{}'::jsonb, updated_at=now()
    WHERE expires_at <= now() AND status NOT IN ('expired','running')`);
  void expired;
  const queued = await pool.query(`SELECT public_id FROM report_jobs WHERE status='queued' ORDER BY requested_at LIMIT $1`, [Math.max(1, Math.min(limit, 10))]);
  let processed = 0, failed = 0;
  for (const row of queued.rows) {
    try { await generateReportJob(String(row.public_id)); processed++; }
    catch { failed++; }
  }
  return { processed, failed };
}

export async function getReportDownload(actor: ReportActorKind, principal: SessionPrincipal, publicId: string): Promise<{ bytes: Buffer; filename: string }> {
  if (!validUuid(publicId)) throw new Error("REPORT_NOT_FOUND");
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query(`SELECT id,requester_user_id,requester_kind,vendor_id,title,status,pdf_bytes,expires_at
    FROM report_jobs WHERE public_id=$1`, [publicId]);
  const row = result.rows[0];
  if (!row || String(row.status) !== "ready" || !row.pdf_bytes || new Date(row.expires_at).getTime() <= Date.now()) throw new Error("REPORT_NOT_READY");
  if (actor === "vendor" && (String(row.vendor_id ?? "") !== principal.vendorId || String(row.requester_kind) !== "vendor")) throw new Error("REPORT_SCOPE_DENIED");
  await pool.query(`INSERT INTO report_delivery_events(report_job_id,actor_user_id,delivery_method,status,metadata)
    VALUES ($1,$2,'download','downloaded',$3::jsonb)`, [row.id, principal.userId, JSON.stringify({ actorKind: actor })]);
  return { bytes: Buffer.from(row.pdf_bytes), filename: `${safeFileName(String(row.title))}-${publicId.slice(0,8)}.pdf` };
}

export async function emailReport(actor: ReportActorKind, principal: SessionPrincipal, publicId: string): Promise<{ sent: boolean }> {
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query(`SELECT id,requester_user_id,requester_kind,vendor_id,title,status,expires_at FROM report_jobs WHERE public_id=$1`, [publicId]);
  const row = result.rows[0];
  if (!row || String(row.status) !== "ready") throw new Error("REPORT_NOT_READY");
  if (actor === "vendor" && (String(row.vendor_id ?? "") !== principal.vendorId || String(row.requester_kind) !== "vendor")) throw new Error("REPORT_SCOPE_DENIED");
  const user = await pool.query(`SELECT email::text,email_verified_at FROM users WHERE id=$1`, [principal.userId]);
  const recipient = String(user.rows[0]?.email ?? principal.email ?? "").trim().toLowerCase();
  if (!recipient || !user.rows[0]?.email_verified_at) throw new Error("Απαιτείται επιβεβαιωμένη διεύθυνση email.");
  const downloadUrl = `${publicOrigin()}/api/reports/${encodeURIComponent(publicId)}/download`;
  const sent = await sendTransactionalEmailBestEffort({
    to: recipient,
    subject: `Buy Local Sparta report: ${String(row.title)}`.slice(0, 240),
    text: [`Η αναφορά σας είναι έτοιμη.`, ``, String(row.title), ``, `Ασφαλής λήψη (απαιτεί σύνδεση):`, downloadUrl,
      ``, `Η αναφορά είναι διαθέσιμη έως ${new Date(row.expires_at).toLocaleDateString("el-GR")}.`].join("\n"),
    eventType: "report.ready",
    idempotencyKey: `report-email:${publicId}:${principal.userId}`,
    payload: { reportPublicId: publicId }
  });
  await pool.query(`INSERT INTO report_delivery_events(report_job_id,actor_user_id,delivery_method,recipient,status,provider_message_id,metadata)
    VALUES ($1,$2,'email',$3,$4,$5,$6::jsonb)`, [row.id, principal.userId, recipient, sent.sent ? "sent" : "failed", sent.providerMessageId ?? null, JSON.stringify({ actorKind: actor })]);
  return { sent: sent.sent };
}

export async function saveReportDefinition(actor: ReportActorKind, principal: SessionPrincipal, name: string, spec: ReportSpec): Promise<void> {
  if (!name.trim()) throw new Error("Το όνομα προτύπου είναι υποχρεωτικό.");
  const pool = getProductionPostgresRuntime().nativePool;
  const market = await resolveMarket(pool, actor === "vendor" ? principal.vendorId : spec.vendorId);
  const vendorId = actor === "vendor" ? principal.vendorId : spec.vendorId;
  await pool.query(`INSERT INTO saved_report_definitions(owner_user_id,owner_kind,market_id,vendor_id,name,report_spec)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [principal.userId, actor, market.id, vendorId ?? null, name.trim().slice(0,160), JSON.stringify({ ...spec, vendorId })]);
}

export async function listSavedReportDefinitions(actor: ReportActorKind, principal: SessionPrincipal): Promise<readonly { publicId: string; name: string; spec: ReportSpec }[]> {
  if (!productionDatabaseConfigured()) return [];
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query(`SELECT public_id,name,report_spec FROM saved_report_definitions
    WHERE owner_user_id=$1 AND owner_kind=$2 ORDER BY updated_at DESC LIMIT 50`, [principal.userId, actor]);
  return result.rows.map((r: any) => ({ publicId: String(r.public_id), name: String(r.name), spec: normalizeStoredSpec(r.report_spec, actor, actor === "vendor" ? principal.vendorId : r.report_spec?.vendorId) }));
}

async function executeDatasets(pool: any, spec: ReportSpec, f: QueryFilters): Promise<ReportDatasets> {
  const datasets: ReportDatasets = {};
  const needsSales = spec.domains.some((d) => ["sales","commissions","returns"].includes(d));
  const needsPerformance = spec.domains.some((d) => ["performance","fairness"].includes(d));
  const tasks: Promise<void>[] = [];
  if (needsSales) tasks.push(querySales(pool, f).then((rows) => { datasets.sales = rows; }));
  if (needsPerformance) tasks.push(queryPerformance(pool, f).then((rows) => { datasets.performance = rows; }));
  if (spec.domains.includes("inventory")) {
    tasks.push(queryInventory(pool, f).then((rows) => { datasets.inventory = rows; }));
    tasks.push(queryInventoryMovements(pool, f).then((rows) => { datasets.inventoryMovements = rows; }));
  }
  if (spec.domains.includes("search")) tasks.push(querySearch(pool, f).then((rows) => { datasets.search = rows; }));
  await Promise.all(tasks);
  return datasets;
}

async function querySales(pool: any, f: QueryFilters): Promise<SalesRow[]> {
  const r = await pool.query(`SELECT
      ol.vendor_id::text AS vendor_id, COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name,
      cv.category_id::text AS category_id, COALESCE(ct_el.name,ct_en.name,c.code,c.slug,'Uncategorised') AS category_name,
      cv.id::text AS product_id, COALESCE(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_name,
      COALESCE(vo.vendor_sku,'') AS sku, COALESCE(b.name,'') AS brand,
      count(DISTINCT ol.order_id)::bigint AS orders, COALESCE(sum(ol.quantity),0)::bigint AS units,
      COALESCE(sum(ol.fulfilled_quantity),0)::bigint AS fulfilled_units,
      COALESCE(sum(ol.refunded_quantity),0)::bigint AS refunded_units,
      COALESCE(sum((ol.retail_unit_price_minor*ol.quantity)-ol.discount_allocation_minor),0)::bigint AS gross_minor,
      COALESCE(sum(ol.adjustment_refunded_minor),0)::bigint AS refund_minor,
      COALESCE(sum(GREATEST(0::bigint,(ol.retail_unit_price_minor*ol.quantity)-ol.discount_allocation_minor-ol.adjustment_refunded_minor)),0)::bigint AS net_minor,
      COALESCE(sum(ol.commission_net_minor),0)::bigint AS commission_net_minor,
      COALESCE(sum(ol.commission_tax_minor),0)::bigint AS commission_tax_minor,
      COALESCE(sum(ol.commission_total_minor),0)::bigint AS commission_total_minor,
      COALESCE(sum(ol.vendor_proceeds_minor),0)::bigint AS vendor_proceeds_minor
    FROM order_lines ol
    JOIN customer_orders co ON co.id=ol.order_id
    JOIN vendor_businesses vb ON vb.id=ol.vendor_id
    JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
    LEFT JOIN vendor_offers vo ON vo.id=ol.assigned_offer_id
    LEFT JOIN categories c ON c.id=cv.category_id
    LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
    LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    LEFT JOIN brands b ON b.id=cv.brand_id
    WHERE co.market_id=$1
      AND (co.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      AND co.status::text NOT IN ('draft','cancelled','failed')
      AND ($5::uuid IS NULL OR ol.vendor_id=$5::uuid)
      AND (COALESCE(array_length($6::uuid[],1),0)=0 OR cv.category_id=ANY($6::uuid[]))
      AND ($7::uuid IS NULL OR cv.id=$7::uuid)
      AND ($8::uuid IS NULL OR ol.location_id=$8::uuid)
      AND ($9::uuid IS NULL OR cv.brand_id=$9::uuid)
    GROUP BY ol.vendor_id,vendor_name,cv.category_id,category_name,cv.id,product_name,vo.vendor_sku,b.name
    ORDER BY net_minor DESC, product_name LIMIT $10`,
    [f.marketId,f.timezone,f.fromDate,f.toDate,f.vendorId??null,f.categoryIds,f.productId??null,f.locationId??null,f.brandId??null,f.maxRows]);
  return r.rows.map((x: any) => ({
    vendorId:String(x.vendor_id),vendorName:String(x.vendor_name),categoryId:String(x.category_id??""),categoryName:String(x.category_name),
    productId:String(x.product_id),productName:String(x.product_name),sku:String(x.sku??""),brand:String(x.brand??""),
    orders:n(x.orders),units:n(x.units),fulfilledUnits:n(x.fulfilled_units),refundedUnits:n(x.refunded_units),
    grossMinor:n(x.gross_minor),refundMinor:n(x.refund_minor),netMinor:n(x.net_minor),
    commissionNetMinor:n(x.commission_net_minor),commissionTaxMinor:n(x.commission_tax_minor),
    commissionTotalMinor:n(x.commission_total_minor),vendorProceedsMinor:n(x.vendor_proceeds_minor)
  }));
}

async function queryPerformance(pool: any, f: QueryFilters): Promise<PerformanceRow[]> {
  const r = await pool.query(`WITH fairness AS (
      SELECT selected_vendor_id AS vendor_id, canonical_variant_id, count(*)::bigint AS impressions
      FROM fairness_assignment_events
      WHERE market_id=$1 AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        AND ($5::uuid IS NULL OR selected_vendor_id=$5::uuid)
      GROUP BY selected_vendor_id,canonical_variant_id
    ), ev AS (
      SELECT vendor_id,canonical_variant_id,
        count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
        count(DISTINCT visitor_hash) FILTER (WHERE event_type='page_view' AND visitor_hash IS NOT NULL)::bigint AS unique_viewers,
        COALESCE(sum(engaged_seconds) FILTER (WHERE event_type='engagement'),0)::bigint AS engaged_seconds,
        count(*) FILTER (WHERE event_type='add_to_cart')::bigint AS add_to_carts,
        count(*) FILTER (WHERE event_type='checkout_started')::bigint AS checkout_starts,
        count(*) FILTER (WHERE event_type='purchase')::bigint AS purchases,
        COALESCE(sum(quantity) FILTER (WHERE event_type='purchase'),0)::bigint AS units_sold,
        COALESCE(sum(amount_minor) FILTER (WHERE event_type='purchase'),0)::bigint AS revenue_minor
      FROM product_analytics_events
      WHERE (occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        AND ($5::uuid IS NULL OR vendor_id=$5::uuid)
      GROUP BY vendor_id,canonical_variant_id
    ), keys AS (
      SELECT vendor_id,canonical_variant_id FROM fairness UNION SELECT vendor_id,canonical_variant_id FROM ev
    )
    SELECT k.vendor_id::text AS vendor_id, COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name,
      cv.category_id::text AS category_id, COALESCE(ct_el.name,ct_en.name,c.code,c.slug,'Uncategorised') AS category_name,
      cv.id::text AS product_id, COALESCE(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_name, COALESCE(b.name,'') AS brand,
      COALESCE(fa.impressions,0)::bigint AS impressions, COALESCE(ev.page_views,0)::bigint AS page_views,
      COALESCE(ev.unique_viewers,0)::bigint AS unique_viewers, COALESCE(ev.engaged_seconds,0)::bigint AS engaged_seconds,
      COALESCE(ev.add_to_carts,0)::bigint AS add_to_carts, COALESCE(ev.checkout_starts,0)::bigint AS checkout_starts,
      COALESCE(ev.purchases,0)::bigint AS purchases, COALESCE(ev.units_sold,0)::bigint AS units_sold,
      COALESCE(ev.revenue_minor,0)::bigint AS revenue_minor
    FROM keys k
    JOIN vendor_businesses vb ON vb.id=k.vendor_id
    JOIN canonical_variants cv ON cv.id=k.canonical_variant_id
    LEFT JOIN categories c ON c.id=cv.category_id
    LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
    LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN fairness fa ON fa.vendor_id=k.vendor_id AND fa.canonical_variant_id=k.canonical_variant_id
    LEFT JOIN ev ON ev.vendor_id=k.vendor_id AND ev.canonical_variant_id=k.canonical_variant_id
    WHERE (COALESCE(array_length($6::uuid[],1),0)=0 OR cv.category_id=ANY($6::uuid[]))
      AND ($7::uuid IS NULL OR cv.id=$7::uuid)
      AND ($8::uuid IS NULL OR cv.brand_id=$8::uuid)
      AND ($9::uuid IS NULL OR EXISTS (SELECT 1 FROM vendor_offers vo WHERE vo.vendor_id=k.vendor_id AND vo.canonical_variant_id=cv.id AND vo.location_id=$9::uuid))
    ORDER BY revenue_minor DESC, page_views DESC LIMIT $10`,
    [f.marketId,f.timezone,f.fromDate,f.toDate,f.vendorId??null,f.categoryIds,f.productId??null,f.brandId??null,f.locationId??null,f.maxRows]);
  return r.rows.map((x: any) => ({
    vendorId:String(x.vendor_id),vendorName:String(x.vendor_name),categoryId:String(x.category_id??""),categoryName:String(x.category_name),
    productId:String(x.product_id),productName:String(x.product_name),brand:String(x.brand??""),
    impressions:n(x.impressions),pageViews:n(x.page_views),uniqueViewers:n(x.unique_viewers),engagedSeconds:n(x.engaged_seconds),
    addToCarts:n(x.add_to_carts),checkoutStarts:n(x.checkout_starts),purchases:n(x.purchases),unitsSold:n(x.units_sold),revenueMinor:n(x.revenue_minor)
  }));
}

async function queryInventory(pool: any, f: QueryFilters): Promise<InventoryRow[]> {
  const r = await pool.query(`SELECT vo.vendor_id::text AS vendor_id,COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name,
      vo.location_id::text AS location_id,COALESCE(NULLIF(vl.name,''),vl.locality,vl.public_id) AS location_name,
      cv.category_id::text AS category_id,COALESCE(ct_el.name,ct_en.name,c.code,c.slug,'Uncategorised') AS category_name,
      cv.id::text AS product_id,COALESCE(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_name,
      COALESCE(vo.vendor_sku,'') AS sku,COALESCE(b.name,'') AS brand,ib.on_hand,ib.active_reservations,ib.safety_stock,ib.blocked,
      GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) AS available,
      COALESCE(ib.freshness_status,CASE WHEN ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) < now() THEN 'stale' ELSE 'fresh' END) AS freshness_status,
      ib.stock_confirmed_at
    FROM inventory_balances ib
    JOIN vendor_offers vo ON vo.id=ib.offer_id JOIN vendor_businesses vb ON vb.id=vo.vendor_id
    JOIN vendor_locations vl ON vl.id=vo.location_id JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN categories c ON c.id=cv.category_id
    LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
    LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    LEFT JOIN brands b ON b.id=cv.brand_id
    WHERE vo.market_id=$1 AND ($2::uuid IS NULL OR vo.vendor_id=$2::uuid)
      AND (COALESCE(array_length($3::uuid[],1),0)=0 OR cv.category_id=ANY($3::uuid[]))
      AND ($4::uuid IS NULL OR cv.id=$4::uuid) AND ($5::uuid IS NULL OR vo.location_id=$5::uuid)
      AND ($6::uuid IS NULL OR cv.brand_id=$6::uuid)
    ORDER BY available ASC, product_name LIMIT $7`,
    [f.marketId,f.vendorId??null,f.categoryIds,f.productId??null,f.locationId??null,f.brandId??null,f.maxRows]);
  return r.rows.map((x:any)=>({
    vendorId:String(x.vendor_id),vendorName:String(x.vendor_name),locationId:String(x.location_id),locationName:String(x.location_name),
    categoryId:String(x.category_id??""),categoryName:String(x.category_name),productId:String(x.product_id),productName:String(x.product_name),
    sku:String(x.sku??""),brand:String(x.brand??""),onHand:n(x.on_hand),reserved:n(x.active_reservations),safetyStock:n(x.safety_stock),
    blocked:n(x.blocked),available:n(x.available),freshnessStatus:String(x.freshness_status),stockConfirmedAt:new Date(x.stock_confirmed_at).toISOString()
  }));
}

async function queryInventoryMovements(pool:any,f:QueryFilters):Promise<InventoryMovementRow[]> {
  const r=await pool.query(`SELECT vo.vendor_id::text AS vendor_id,COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name,
      cv.id::text AS product_id,COALESCE(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_name,COALESCE(vo.vendor_sku,'') AS sku,
      im.movement_type,im.quantity_delta,im.source,im.created_at
    FROM inventory_movements im JOIN vendor_offers vo ON vo.id=im.offer_id JOIN vendor_businesses vb ON vb.id=vo.vendor_id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    WHERE vo.market_id=$1 AND (im.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
      AND ($5::uuid IS NULL OR vo.vendor_id=$5::uuid)
      AND (COALESCE(array_length($6::uuid[],1),0)=0 OR cv.category_id=ANY($6::uuid[]))
      AND ($7::uuid IS NULL OR cv.id=$7::uuid) AND ($8::uuid IS NULL OR vo.location_id=$8::uuid)
      AND ($9::uuid IS NULL OR cv.brand_id=$9::uuid)
    ORDER BY im.created_at DESC LIMIT $10`,
    [f.marketId,f.timezone,f.fromDate,f.toDate,f.vendorId??null,f.categoryIds,f.productId??null,f.locationId??null,f.brandId??null,f.maxRows]);
  return r.rows.map((x:any)=>({vendorId:String(x.vendor_id),vendorName:String(x.vendor_name),productId:String(x.product_id),productName:String(x.product_name),
    sku:String(x.sku??""),movementType:String(x.movement_type),quantityDelta:n(x.quantity_delta),source:String(x.source??""),occurredAt:new Date(x.created_at).toISOString()}));
}

async function querySearch(pool:any,f:QueryFilters):Promise<SearchRow[]> {
  const r=await pool.query(`SELECT query_text,normalized_query,COALESCE(sum(searches),0)::bigint searches,
      COALESCE(sum(zero_results),0)::bigint zero_results,COALESCE(sum(clicks),0)::bigint clicks,
      CASE WHEN sum(searches)>0 THEN sum(result_count_total)::numeric/sum(searches) ELSE 0 END AS average_results
    FROM analytics_search_terms_daily WHERE market_id=$1 AND day BETWEEN $2::date AND $3::date
    GROUP BY query_text,normalized_query ORDER BY zero_results DESC,searches DESC LIMIT $4`,[f.marketId,f.fromDate,f.toDate,Math.min(f.maxRows,500)]);
  return r.rows.map((x:any)=>({query:String(x.query_text),normalizedQuery:String(x.normalized_query),searches:n(x.searches),zeroResults:n(x.zero_results),clicks:n(x.clicks),averageResults:Number(x.average_results??0)}));
}

function buildSummary(spec: ReportSpec, d: ReportDatasets, previous?: ReportDatasets): Record<string, unknown> {
  const sales=d.sales??[], perf=d.performance??[], inventory=d.inventory??[], search=d.search??[];
  const sum=(rows:any[],key:string)=>rows.reduce((a,r)=>a+n(r[key]),0);
  const orderIdsEquivalent=sum(sales,"orders");
  const netMinor=sum(sales,"netMinor"), grossMinor=sum(sales,"grossMinor"), commissionMinor=sum(sales,"commissionTotalMinor"), proceedsMinor=sum(sales,"vendorProceedsMinor");
  const impressions=sum(perf,"impressions"),views=sum(perf,"pageViews"),carts=sum(perf,"addToCarts"),checkouts=sum(perf,"checkoutStarts"),purchases=sum(perf,"purchases");
  const outOfStock=inventory.filter(r=>r.available<=0).length,lowStock=inventory.filter(r=>r.available>0&&r.available<=2).length,stale=inventory.filter(r=>r.freshnessStatus.toLowerCase().includes("stale")).length;
  const topSales=[...sales].sort((a,b)=>b.netMinor-a.netMinor).slice(0,5).map(r=>({product:r.productName,vendor:r.vendorName,revenueMinor:r.netMinor}));
  const weakConversion=[...perf].filter(r=>r.pageViews>=10).sort((a,b)=>(a.purchases/Math.max(1,a.pageViews))-(b.purchases/Math.max(1,b.pageViews))).slice(0,5)
    .map(r=>({product:r.productName,vendor:r.vendorName,views:r.pageViews,purchases:r.purchases,conversion:r.purchases/Math.max(1,r.pageViews)}));
  const insights:string[]=[];
  if(netMinor>0) insights.push(`Net sales for the selected scope are ${money(netMinor)} across ${orderIdsEquivalent} product-order combinations.`);
  if(commissionMinor>0) insights.push(`Recorded marketplace commission is ${money(commissionMinor)}; historical rates come from immutable order-line snapshots.`);
  if(views>0) insights.push(`View-to-sale conversion is ${pct(purchases,views)} (${purchases} purchases from ${views} product views).`);
  if(outOfStock>0) insights.push(`${outOfStock} inventory positions are currently out of stock; ${lowStock} more have two or fewer available units.`);
  if(stale>0) insights.push(`${stale} inventory positions have stale stock confirmation and should be refreshed.`);
  if(search.length&&sum(search,"zeroResults")>0) insights.push(`${sum(search,"zeroResults")} zero-result searches indicate unmet catalogue demand in the selected period.`);
  const metrics={grossSalesMinor:grossMinor,netSalesMinor:netMinor,commissionMinor,vendorProceedsMinor:proceedsMinor,units:sum(sales,"units"),
    refundedUnits:sum(sales,"refundedUnits"),impressions,views,cartAdds:carts,checkoutStarts:checkouts,purchases,
    viewToSale:views? purchases/views:0,inventoryPositions:inventory.length,outOfStock,lowStock,staleStock:stale,zeroResultSearches:sum(search,"zeroResults")};
  let comparison:Record<string,unknown>|undefined;
  if(previous){
    const ps=previous.sales??[],pp=previous.performance??[],pq=previous.search??[];
    const prevNet=sum(ps,"netMinor"),prevCommission=sum(ps,"commissionTotalMinor"),prevViews=sum(pp,"pageViews"),prevPurchases=sum(pp,"purchases");
    comparison={previousPeriod:{from:shiftIsoDate(spec.fromDate,-daysBetween(spec.fromDate,spec.toDate)),to:shiftIsoDate(spec.fromDate,-1)},
      metrics:{netSalesMinor:prevNet,commissionMinor:prevCommission,views:prevViews,purchases:prevPurchases},
      deltas:{netSales:delta(netMinor,prevNet),commission:delta(commissionMinor,prevCommission),views:delta(views,prevViews),purchases:delta(purchases,prevPurchases),
        zeroResultSearches:delta(sum(search,"zeroResults"),sum(pq,"zeroResults"))}};
    insights.push(`Compared with the preceding equal-length period, net sales changed ${signedPct(delta(netMinor,prevNet))} and purchases changed ${signedPct(delta(purchases,prevPurchases))}.`);
  }
  if(!insights.length) insights.push("The selected scope contains limited activity; detailed datasets are included below for auditability.");
  return {period:{from:spec.fromDate,to:spec.toDate},domains:spec.domains,metrics,comparison,insights,topSales,weakConversion};
}

async function buildPdf(spec:ReportSpec,planner:ReportPlannerSnapshot,summary:Record<string,unknown>,d:ReportDatasets):Promise<{bytes:Buffer;pages:number}> {
  const pdfMakeModule:any=await import("pdfmake/build/pdfmake.js");
  const vfsModule:any=await import("pdfmake/build/vfs_fonts.js");
  const pdfMake:any=pdfMakeModule.default??pdfMakeModule;
  const vfs:any=vfsModule.default??vfsModule;
  if(typeof pdfMake.addVirtualFileSystem==="function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs=vfs.pdfMake?.vfs??vfs;

  const content:any[]=[
    {text:"BUY LOCAL SPARTA",style:"brand"},{text:spec.title,style:"title"},
    {text:`Report period: ${spec.fromDate} – ${spec.toDate}`,style:"meta"},
    {text:`Generated: ${new Date().toLocaleString("el-GR",{timeZone:"Europe/Athens"})}`,style:"meta"},
    {text:"Executive summary",style:"h1",margin:[0,18,0,6]},
    {text:(summary.insights as string[]).map((x)=>`• ${x}`).join("\n"),style:"body"},
    {text:"Scope & methodology",style:"h1",margin:[0,18,0,6]},
    {text:`Domains: ${spec.domains.join(", ")}\nComplexity score: ${planner.complexityScore}\n${planner.notes.join("\n")}`,style:"body"}
  ];
  const metrics:any=(summary.metrics??{});
  content.push({text:"Key metrics",style:"h1",margin:[0,18,0,6]});
  content.push(table(["Metric","Value"],[
    ["Net sales",money(n(metrics.netSalesMinor))],["Commission",money(n(metrics.commissionMinor))],["Vendor proceeds",money(n(metrics.vendorProceedsMinor))],
    ["Units sold",String(n(metrics.units))],["Impressions",String(n(metrics.impressions))],["Product views",String(n(metrics.views))],
    ["Purchases",String(n(metrics.purchases))],["View → sale",`${(Number(metrics.viewToSale??0)*100).toFixed(2)}%`],
    ["Out of stock",String(n(metrics.outOfStock))],["Low stock",String(n(metrics.lowStock))],["Stale stock",String(n(metrics.staleStock))]
  ]));

  const comparison:any=summary.comparison;
  if(comparison?.deltas){content.push({text:"Previous-period comparison",style:"h1",margin:[0,18,0,6]});
    content.push(table(["Metric","Change"],[["Net sales",signedPct(Number(comparison.deltas.netSales??0))],["Commission",signedPct(Number(comparison.deltas.commission??0))],["Product views",signedPct(Number(comparison.deltas.views??0))],["Purchases",signedPct(Number(comparison.deltas.purchases??0))]]));}
  if(spec.includeDetails&&d.sales?.length){content.push({text:"Sales, commissions & returns",style:"h1",pageBreak:"before"});
    content.push(table(["Vendor","Product","Category","Units","Net sales","Commission","Vendor proceeds","Refunds"],d.sales.map(r=>[
      r.vendorName,r.productName,r.categoryName,String(r.units),money(r.netMinor),money(r.commissionTotalMinor),money(r.vendorProceedsMinor),`${r.refundedUnits} / ${money(r.refundMinor)}`
    ]),[70,130,80,35,55,55,60,55]));}
  if(spec.includeDetails&&d.performance?.length){content.push({text:"Performance & Fair Vendor Exposure",style:"h1",pageBreak:"before"});
    content.push(table(["Vendor","Product","Impr.","Views","Avg engaged","Cart","Checkout","Sales","Conv."],d.performance.map(r=>[
      r.vendorName,r.productName,String(r.impressions),String(r.pageViews),seconds(r.pageViews?r.engagedSeconds/r.pageViews:0),String(r.addToCarts),String(r.checkoutStarts),String(r.purchases),pct(r.purchases,r.pageViews)
    ]),[70,150,42,42,48,35,45,35,40]));}
  if(spec.includeDetails&&d.inventory?.length){content.push({text:"Current inventory",style:"h1",pageBreak:"before"});
    content.push(table(["Vendor","Location","Product","SKU","On hand","Reserved","Available","Freshness"],d.inventory.map(r=>[
      r.vendorName,r.locationName,r.productName,r.sku,String(r.onHand),String(r.reserved),String(r.available),r.freshnessStatus
    ]),[70,70,150,60,42,42,42,55]));}
  if(spec.includeDetails&&d.inventoryMovements?.length){content.push({text:"Inventory movements",style:"h1",pageBreak:"before"});
    content.push(table(["Time","Vendor","Product","SKU","Type","Qty","Source"],d.inventoryMovements.map(r=>[
      new Date(r.occurredAt).toLocaleString("el-GR",{timeZone:"Europe/Athens"}),r.vendorName,r.productName,r.sku,r.movementType,String(r.quantityDelta),r.source
    ]),[75,70,150,55,55,35,70]));}
  if(spec.includeDetails&&d.search?.length){content.push({text:"Marketplace search demand",style:"h1",pageBreak:"before"});
    content.push(table(["Query","Searches","Zero results","Clicks","Avg results"],d.search.map(r=>[r.query,String(r.searches),String(r.zeroResults),String(r.clicks),r.averageResults.toFixed(1)]),[250,60,65,50,60]));}
  content.push({text:"Definitions & data integrity",style:"h1",pageBreak:"before"});
  content.push({text:"Sales figures are aggregated from order lines in the selected period. Historical commission values use the commission snapshot stored on each order line. Inventory availability is on-hand minus active reservations, safety stock and blocked stock. Performance combines Fair Vendor Exposure impressions with privacy-minimised product funnel events. Vendor reports are force-scoped to the authenticated vendor and do not expose customer-level or competitor-level raw events.",style:"body"});
  const doc={pageSize:"A4",pageOrientation:"landscape",pageMargins:[28,32,28,32],defaultStyle:{font:"Roboto",fontSize:8},
    styles:{brand:{fontSize:10,bold:true,color:"#555555"},title:{fontSize:24,bold:true,margin:[0,5,0,8]},meta:{fontSize:8,color:"#666666"},h1:{fontSize:14,bold:true},body:{fontSize:9,lineHeight:1.25}},
    footer:(current:number,count:number)=>({text:`Buy Local Sparta · ${spec.title} · ${current}/${count}`,alignment:"center",fontSize:7,color:"#777777"}),content};
  const bytes=await new Promise<Buffer>((resolve,reject)=>{try{pdfMake.createPdf(doc).getBuffer((b:Uint8Array)=>resolve(Buffer.from(b)));}catch(e){reject(e);}});
  const pages=Math.max(1,(bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length);
  return {bytes,pages};
}

function table(headers:string[],rows:any[][],widths?:number[]):any{return {table:{headerRows:1,widths:widths??headers.map(()=>"*"),body:[headers.map(h=>({text:h,bold:true,fillColor:"#eeeeee"})),...rows]},layout:"lightHorizontalLines",fontSize:7,margin:[0,4,0,8]};}
function countRows(d:ReportDatasets){return (d.sales?.length??0)+(d.performance?.length??0)+(d.inventory?.length??0)+(d.inventoryMovements?.length??0)+(d.search?.length??0);}
function domainsForPreset(p:ReportPreset):ReportDomain[]{if(p==="sales_commissions")return["sales","commissions","returns"];if(p==="inventory")return["inventory"];if(p==="performance")return["performance","fairness"];if(p==="full")return["sales","commissions","returns","inventory","performance","fairness"];return["sales","commissions","inventory","performance"];}
function augmentDomainsFromPrompt(domains:ReportDomain[],prompt?:string):ReportDomain[]{if(!prompt)return domains;const q=prompt.toLocaleLowerCase("el-GR");const out=[...domains];
  const add=(d:ReportDomain)=>{if(!out.includes(d))out.push(d);};if(/sale|πωλ|revenue|τζίρ/.test(q))add("sales");if(/commission|προμήθ/.test(q))add("commissions");
  if(/stock|inventory|απόθε|διαθεσιμ/.test(q))add("inventory");if(/performance|conversion|analytics|απόδο|μετατροπ/.test(q))add("performance");
  if(/fair|exposure|εμφαν|δικαιοσ/.test(q))add("fairness");if(/refund|return|επιστροφ|επιστροφ/.test(q))add("returns");if(/search|zero.result|αναζήτ/.test(q))add("search");
  if(/full|complete|comprehensive|όλα|πλήρ|συνολικ/.test(q))for(const d of ["sales","commissions","returns","inventory","performance","fairness"] as ReportDomain[])add(d);return out;}
function normalizeStoredSpec(raw:any,actor:string,vendorId?:string):ReportSpec{const domains=Array.isArray(raw?.domains)?raw.domains.filter((d:any)=>DOMAIN_SET.has(d)):domainsForPreset("full");
  return {preset:["sales_commissions","inventory","performance","full","custom"].includes(raw?.preset)?raw.preset:"full",title:String(raw?.title??"Report").slice(0,240),
    prompt:typeof raw?.prompt==="string"?raw.prompt.slice(0,2000):undefined,fromDate:validDate(String(raw?.fromDate??""))??shiftIsoDate(todayAthens(),-29),
    toDate:validDate(String(raw?.toDate??""))??todayAthens(),domains:actor==="vendor"?domains.filter((d:ReportDomain)=>d!=="search"):domains,
    vendorId:actor==="vendor"?vendorId:validUuid(String(raw?.vendorId??"")),categoryId:validUuid(String(raw?.categoryId??"")),productId:validUuid(String(raw?.productId??"")),
    locationId:validUuid(String(raw?.locationId??"")),brandId:validUuid(String(raw?.brandId??"")),comparePrevious:Boolean(raw?.comparePrevious),includeDetails:raw?.includeDetails!==false};}
async function resolveMarket(pool:any,vendorId?:string):Promise<{id:string;timezone:string}>{if(vendorId){const r=await pool.query(`SELECT m.id::text,m.timezone FROM vendor_businesses v JOIN markets m ON m.id=v.market_id WHERE v.id=$1`,[vendorId]);if(r.rows[0])return{id:String(r.rows[0].id),timezone:String(r.rows[0].timezone||"Europe/Athens")};}
  const code=process.env.DEFAULT_MARKET?.trim()||"sparta";const r=await pool.query(`SELECT id::text,timezone FROM markets WHERE code=$1 ORDER BY created_at LIMIT 1`,[code]);if(!r.rows[0])throw new Error(`Market ${code} not found`);return{id:String(r.rows[0].id),timezone:String(r.rows[0].timezone||"Europe/Athens")};}
async function resolveMarketById(pool:any,id:string){const r=await pool.query(`SELECT id::text,timezone FROM markets WHERE id=$1`,[id]);if(!r.rows[0])throw new Error("Market not found");return{id:String(r.rows[0].id),timezone:String(r.rows[0].timezone||"Europe/Athens")};}
async function assertVendorInMarket(pool:any,vendorId:string,marketId:string){const r=await pool.query(`SELECT 1 FROM vendor_businesses WHERE id=$1 AND market_id=$2`,[vendorId,marketId]);if(!r.rowCount)throw new Error("Vendor is outside the selected market.");}
async function resolveCategoryIds(pool:any,categoryId:string|undefined,marketId:string):Promise<string[]>{if(!categoryId)return[];const r=await pool.query(`WITH RECURSIVE tree AS (SELECT id FROM categories WHERE id=$1 AND market_id=$2 UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id) SELECT id::text FROM tree`,[categoryId,marketId]);return r.rows.map((x:any)=>String(x.id));}
async function getReportListItem(pool:any,id:string):Promise<ReportJobListItem>{const r=await pool.query(`SELECT public_id,title,status,requested_at,completed_at,expires_at,row_count,page_count,summary,error_message FROM report_jobs WHERE public_id=$1`,[id]);if(!r.rows[0])throw new Error("Report job not found");return mapJob(r.rows[0]);}
function mapJob(r:any):ReportJobListItem{return{publicId:String(r.public_id),title:String(r.title),status:String(r.status),requestedAt:new Date(r.requested_at).toISOString(),completedAt:r.completed_at?new Date(r.completed_at).toISOString():undefined,expiresAt:new Date(r.expires_at).toISOString(),rowCount:n(r.row_count),pageCount:n(r.page_count),summary:(r.summary&&typeof r.summary==="object")?r.summary:{},errorMessage:r.error_message?String(r.error_message):undefined};}
function field(form:FormData,name:string):string{const v=form.get(name);return typeof v==="string"?v:"";}
function validUuid(v:string|undefined):string|undefined{return v&&UUID_RE.test(v)?v:undefined;}
function validDate(v:string|undefined):string|undefined{return v&&DATE_RE.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))?v:undefined;}
function todayAthens(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function shiftIsoDate(date:string,days:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function daysBetween(a:string,b:string){return Math.floor((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000)+1;}
function defaultTitle(p:ReportPreset){return p==="sales_commissions"?"Sales & Commission Report":p==="inventory"?"Inventory Report":p==="performance"?"Performance & Analytics Report":p==="full"?"Comprehensive Business Report":"Custom Report";}
function n(v:any){const x=Number(v??0);return Number.isFinite(x)?x:0;}
function money(minor:number){return new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);}
function pct(a:number,b:number){return b>0?`${((a/b)*100).toFixed(2)}%`:"0.00%";}
function seconds(s:number){if(s<60)return`${Math.round(s)}s`;return`${Math.floor(s/60)}m ${Math.round(s%60)}s`;}
function delta(current:number,previous:number){if(previous===0)return current===0?0:1;return(current-previous)/Math.abs(previous);}
function signedPct(v:number){if(!Number.isFinite(v))return"—";return`${v>=0?"+":""}${(v*100).toFixed(1)}%`;}
function safeFileName(v:string){return v.normalize("NFKD").replace(/[^\p{L}\p{N}._-]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,100)||"report";}
