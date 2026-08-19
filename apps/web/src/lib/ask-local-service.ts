import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getCatalogCard } from "./catalog-view";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";
import { getPublicVendorDirectory, getPublicVendorDirectoryEntry, type PublicVendorDirectoryEntry } from "./public-vendor-directory";
import { categoryCodeMatches } from "./storefront-taxonomy";

export type AskLocalEntryMode = "search" | "category" | "product" | "vendor";
export type AskLocalRoutingOwner = "admin" | "vendor";

export type AskLocalVendorCandidate = Readonly<{
  id: string;
  name: string;
  adviser: string;
  locality?: string;
  categoryCodes: readonly string[];
}>;

export type AskLocalRequestView = Readonly<{
  id: string;
  status: string;
  need: string;
  quantity: number;
  postcode: string;
  entryMode: AskLocalEntryMode;
  category?: string;
  routingOwner: AskLocalRoutingOwner;
  routingReason?: string;
  canonicalVariantId?: string;
  assignedVendorId?: string;
  assignedVendorName?: string;
  assignedAdviser?: string;
  responseDueAt?: number;
  createdAt: number;
  privateOffers: readonly Readonly<{ id: string; status: string; priceMinor: number; currency: string; fulfilmentPromise?: string; expiresAt: number }>[];
}>;

export type AskLocalAdminRequestView = AskLocalRequestView & Readonly<{
  eligibleVendors: readonly AskLocalVendorCandidate[];
}>;

export type AskLocalSubmitInput = Readonly<{
  need: string;
  postcode: string;
  quantity: number;
  sourceUrl?: string;
  canonicalVariantId?: string;
  preferredVendorId?: string;
  category?: string;
  entryMode?: AskLocalEntryMode;
  now?: number;
}>;

const globalKey = "__blsAskLocalMemory" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: Map<string, AskLocalRequestView[]> };
const TERMINAL_STATUSES = new Set(["accepted", "converted", "closed", "expired"]);
const VENDOR_RESPONSE_MS = 24 * 60 * 60 * 1000;

function memoryStore() { return globals[globalKey] ??= new Map(); }
function postgresEnabled() { return Boolean(process.env.DATABASE_URL?.trim()); }

function normalizeEntryMode(input: AskLocalSubmitInput): AskLocalEntryMode {
  if (input.entryMode && ["search", "category", "product", "vendor"].includes(input.entryMode)) return input.entryMode;
  if (input.canonicalVariantId?.trim()) return "product";
  if (input.category?.trim()) return "category";
  if (input.preferredVendorId?.trim()) return "vendor";
  return "search";
}

function routingHistory(metadata: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = metadata.routingHistory;
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object").slice(-24) : [];
}

function withRouting(metadata: Record<string, unknown>, event: Readonly<{ at: number; owner: AskLocalRoutingOwner; reason: string; vendorId?: string; adviser?: string; category?: string; event: string }>): Record<string, unknown> {
  return {
    ...metadata,
    category: event.category ?? (typeof metadata.category === "string" ? metadata.category : undefined),
    routingOwner: event.owner,
    routingReason: event.reason,
    assignedAdviser: event.adviser,
    routingUpdatedAt: event.at,
    routingHistory: [...routingHistory(metadata), event]
  };
}

function candidateRank(category: string, vendorId: string): number {
  return Number.parseInt(createHash("sha256").update(`${category}:${vendorId}`).digest("hex").slice(0, 8), 16);
}

function candidatesFromDirectory(directory: readonly PublicVendorDirectoryEntry[], category: string, limit = 6): readonly AskLocalVendorCandidate[] {
  const requested = category.trim();
  if (!requested) return [];
  return directory
    .filter((vendor) => vendor.directoryStatus === "partner" && Boolean(vendor.adviser) && vendor.categoryCodes.some((code) => categoryCodeMatches(code, requested)))
    .sort((a, b) => candidateRank(requested, a.id) - candidateRank(requested, b.id) || a.name.localeCompare(b.name, "el"))
    .slice(0, limit)
    .map((vendor) => ({ id: vendor.id, name: vendor.name, adviser: vendor.adviser!, locality: vendor.location?.locality, categoryCodes: vendor.categoryCodes }));
}

export async function askLocalVendorCandidates(category: string): Promise<readonly AskLocalVendorCandidate[]> {
  if (!category.trim()) return [];
  return candidatesFromDirectory(await getPublicVendorDirectory(), category, 6);
}

async function selectedDirectVendor(input: ReturnType<typeof validate>, principal: SessionPrincipal): Promise<{ vendorId?: string; adviser?: string; reason: string }> {
  if (input.entryMode === "search") return { reason: "search_requires_admin_review" };

  if (input.entryMode === "product" && input.canonicalVariantId) {
    try {
      const assignment = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({
        canonicalVariantId: input.canonicalVariantId,
        visitorKey: `ask-local:${principal.userId}`,
        postcode: input.postcode,
        reason: "product_view"
      });
      return assignment ? { vendorId: assignment.vendorId, reason: "product_fair_assignment" } : { reason: "product_has_no_eligible_vendor" };
    } catch {
      return { reason: "product_assignment_failed_admin_fallback" };
    }
  }

  if (input.entryMode === "category") {
    if (!input.category) return { reason: "category_missing_admin_fallback" };
    if (!input.preferredVendorId) return { reason: "category_no_vendor_selected_admin_fallback" };
    const candidates = await askLocalVendorCandidates(input.category);
    const selected = candidates.find((candidate) => candidate.id === input.preferredVendorId);
    return selected
      ? { vendorId: selected.id, adviser: selected.adviser, reason: "customer_selected_system_category_candidate" }
      : { reason: "category_vendor_no_longer_eligible_admin_fallback" };
  }

  if (input.entryMode === "vendor" && input.preferredVendorId) {
    const vendor = await getPublicVendorDirectoryEntry(input.preferredVendorId);
    return vendor?.directoryStatus === "partner"
      ? { vendorId: vendor.id, adviser: vendor.adviser, reason: "customer_selected_vendor" }
      : { reason: "selected_vendor_not_active_admin_fallback" };
  }

  return { reason: "admin_review_required" };
}

export async function submitAskLocal(principal: SessionPrincipal, raw: AskLocalSubmitInput): Promise<AskLocalRequestView> {
  const input = validate(raw);
  if (!postgresEnabled()) return submitMemory(principal, input);
  const runtime = getProductionPostgresRuntime();
  const direct = await selectedDirectVendor(input, principal);
  const publicId = `cor_${randomUUID()}`;
  const nowDate = new Date(input.now);
  const sourceUrl = input.sourceUrl ?? `${publicOrigin()}/ask-local`;
  const visitorHash = createHash("sha256").update(`ask-local:${principal.userId}`).digest("hex");
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });

  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const user = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1", [principal.userId]);
    if (!user.rowCount) throw new Error("Customer account was not found");

    const initialMetadata: Record<string, unknown> = {
      need: input.need,
      category: input.category,
      entryMode: input.entryMode,
      source: "customer_web"
    };
    const initialRouted = withRouting(initialMetadata, {
      at: input.now,
      owner: "admin",
      reason: "persisted_before_routing",
      category: input.category,
      event: "created"
    });

    const inserted = await tx.query<SqlRow>(`INSERT INTO counteroffer_requests(id,public_id,market_id,customer_user_id,visitor_hash,source_url,source_url_hash,source_metadata,canonical_variant_id,requested_quantity,postcode,priorities,status,assigned_vendor_id,assigned_offer_id,expires_at,created_at,updated_at)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,$5,$6,$7::jsonb,NULL,$8,$9,$10::jsonb,'submitted',NULL,NULL,NULL,$11,$11)
      RETURNING id::text AS id`, [randomUUID(), publicId, user.rows[0].id, visitorHash, sourceUrl, createHash("sha256").update(sourceUrl).digest("hex"), JSON.stringify(initialRouted), input.quantity, input.postcode, JSON.stringify({ category: input.category, entryMode: input.entryMode }), nowDate]);
    const requestUuid = String(inserted.rows[0].id);

    let canonicalUuid: string | undefined;
    let counterofferAllowed = true;
    if (input.canonicalVariantId) {
      const canonical = await tx.query<SqlRow>(`SELECT cv.id::text AS id,c.counteroffer_allowed FROM canonical_variants cv JOIN categories c ON c.id=cv.category_id WHERE cv.public_id=$1 AND cv.active=true AND cv.suppressed=false AND cv.recalled=false`, [input.canonicalVariantId]);
      if (canonical.rowCount) {
        canonicalUuid = String(canonical.rows[0].id);
        counterofferAllowed = canonical.rows[0].counteroffer_allowed !== false;
        await tx.query("UPDATE counteroffer_requests SET canonical_variant_id=$2 WHERE id=$1", [requestUuid, canonicalUuid]);
      }
    }

    let assignedVendorUuid: string | undefined;
    let assignedVendorPublicId: string | undefined;
    let assignedAdviser = direct.adviser;
    let assignedOfferUuid: string | undefined;
    let routeReason = direct.reason;

    if (direct.vendorId && counterofferAllowed) {
      const vendor = await tx.query<SqlRow>(`SELECT vb.id::text AS id,vb.public_id,vb.trading_name,
        (SELECT COALESCE(NULLIF(ap.display_name,''),vb.trading_name) FROM adviser_profiles ap JOIN vendor_users vu ON vu.id=ap.vendor_user_id WHERE vu.vendor_id=vb.id AND vu.active=true AND ap.active=true ORDER BY ap.created_at,ap.public_id LIMIT 1) AS adviser
        FROM vendor_businesses vb WHERE vb.public_id=$1 AND vb.status='active'`, [direct.vendorId]);
      if (vendor.rowCount) {
        assignedVendorUuid = String(vendor.rows[0].id);
        assignedVendorPublicId = String(vendor.rows[0].public_id);
        if (!assignedAdviser && typeof vendor.rows[0].adviser === "string") assignedAdviser = vendor.rows[0].adviser;
        if (canonicalUuid) {
          const offer = await tx.query<SqlRow>(`SELECT vo.id::text AS id FROM vendor_offers vo JOIN vendor_locations vl ON vl.id=vo.location_id WHERE vo.vendor_id=$1::uuid AND vo.canonical_variant_id=$2::uuid AND vo.status='approved' AND vl.active=true ORDER BY vo.updated_at DESC,vo.id LIMIT 1`, [assignedVendorUuid, canonicalUuid]);
          if (offer.rowCount) assignedOfferUuid = String(offer.rows[0].id);
        }
      } else {
        routeReason = "vendor_became_inactive_admin_fallback";
      }
    } else if (!counterofferAllowed) {
      routeReason = "category_disallows_counteroffer_admin_review";
    } else if (input.canonicalVariantId && !canonicalUuid) {
      routeReason = "product_unavailable_admin_review";
    }

    const assigned = Boolean(assignedVendorUuid);
    const dueAt = assigned ? new Date(input.now + VENDOR_RESPONSE_MS) : undefined;
    const finalMetadata = withRouting(initialRouted, {
      at: input.now,
      owner: assigned ? "vendor" : "admin",
      reason: routeReason,
      vendorId: assignedVendorPublicId,
      adviser: assignedAdviser,
      category: input.category,
      event: assigned ? "assigned_to_vendor" : "queued_for_admin"
    });

    await tx.query(`UPDATE counteroffer_requests SET source_metadata=$2::jsonb,status=$3,assigned_vendor_id=$4,assigned_offer_id=$5,expires_at=$6,updated_at=$7 WHERE id=$1`, [requestUuid, JSON.stringify(finalMetadata), assigned ? "awaiting_vendor" : "submitted", assignedVendorUuid ?? null, assignedOfferUuid ?? null, dueAt ?? null, nowDate]);

    await tx.query(`INSERT INTO analytics_events(id,public_id,market_id,event_name,occurred_at,visitor_hash,customer_id,vendor_id,canonical_variant_id,quantity,metadata,dedupe_key,retention_until)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),'counteroffer.requested',$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [randomUUID(), `analytics_${randomUUID()}`, nowDate, visitorHash, user.rows[0].id, assignedVendorUuid ?? null, canonicalUuid ?? null, input.quantity, JSON.stringify({ assigned, category: input.category, entryMode: input.entryMode, requestId: publicId, routingReason: routeReason }), `ask-local:${publicId}`, new Date(input.now + 400 * 24 * 60 * 60 * 1000)]);

    if (assigned) await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3,'in_app','transactional','counteroffer.requested','ask-local-v2','el','Νέο ιδιωτικό Ask Local αίτημα',$4,$5::jsonb,'queued',$6,$7) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [randomUUID(), `notification_${randomUUID()}`, assignedVendorUuid, input.need.slice(0, 240), JSON.stringify({ requestId: publicId, canonicalVariantId: input.canonicalVariantId, category: input.category, responseDueAt: dueAt?.getTime() }), `ask-local-vendor:${publicId}`, nowDate]);
  }, { isolation: "serializable" });

  return (await customerAskLocalRequests(principal)).find((request) => request.id === publicId)!;
}

// Safety-net rescue is deliberately idempotent. It runs whenever an Ask Local
// customer/admin/vendor workspace is read, so an overdue vendor assignment is
// re-owned by Admin before that queue is presented to an operator.
export async function rescueStaleAskLocalAssignments(now = Date.now()): Promise<number> {
  if (!postgresEnabled()) return 0;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    const stale = await tx.query<SqlRow>(`SELECT id::text AS id,source_metadata FROM counteroffer_requests WHERE status='awaiting_vendor' AND expires_at IS NOT NULL AND expires_at <= $1 ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 100`, [new Date(now)]);
    for (const row of stale.rows) {
      const metadata = (row.source_metadata ?? {}) as Record<string, unknown>;
      const next = withRouting(metadata, { at: now, owner: "admin", reason: "vendor_response_sla_elapsed", category: typeof metadata.category === "string" ? metadata.category : undefined, event: "returned_to_admin" });
      await tx.query(`UPDATE counteroffer_requests SET status='submitted',assigned_vendor_id=NULL,assigned_offer_id=NULL,expires_at=NULL,source_metadata=$2::jsonb,updated_at=$3 WHERE id=$1`, [String(row.id), JSON.stringify(next), new Date(now)]);
    }
    return stale.rowCount;
  }, { isolation: "serializable" });
}

export async function customerAskLocalRequests(principal: SessionPrincipal): Promise<readonly AskLocalRequestView[]> {
  if (!postgresEnabled()) return [...(memoryStore().get(principal.userId) ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  await rescueStaleAskLocalAssignments();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const rows = await tx.query<SqlRow>(`SELECT cr.public_id,cr.status::text,cr.source_metadata,cr.requested_quantity,cr.postcode,cr.expires_at,cr.created_at,cv.public_id AS canonical_public_id,v.public_id AS vendor_public_id,v.trading_name,
      COALESCE(jsonb_agg(jsonb_build_object('id',po.public_id,'status',po.status,'priceMinor',po.price_minor,'currency',po.currency,'fulfilmentPromise',po.fulfilment_promise->>'text','expiresAt',extract(epoch from po.expires_at)*1000) ORDER BY po.created_at) FILTER(WHERE po.id IS NOT NULL),'[]'::jsonb) AS private_offers
      FROM counteroffer_requests cr JOIN users u ON u.id=cr.customer_user_id LEFT JOIN canonical_variants cv ON cv.id=cr.canonical_variant_id LEFT JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id LEFT JOIN private_offers po ON po.counteroffer_request_id=cr.id
      WHERE u.public_id=$1 GROUP BY cr.id,cv.public_id,v.public_id,v.trading_name ORDER BY cr.created_at DESC`, [principal.userId]);
    return rows.rows.map(toView);
  }, { readOnly: true });
}

export async function adminAskLocalWorkspace(principal: SessionPrincipal): Promise<{ csrfToken: string; requests: readonly AskLocalAdminRequestView[]; vendors: readonly AskLocalVendorCandidate[] }> {
  if (!postgresEnabled()) {
    const requests = [...memoryStore().values()].flat().sort((a, b) => b.createdAt - a.createdAt).map((request) => ({ ...request, eligibleVendors: [] }));
    return { csrfToken: principal.csrfToken, requests, vendors: [] };
  }
  await rescueStaleAskLocalAssignments();
  const directory = await getPublicVendorDirectory();
  const allVendors = directory
    .filter((vendor) => vendor.directoryStatus === "partner" && Boolean(vendor.adviser))
    .map((vendor) => ({ id: vendor.id, name: vendor.name, adviser: vendor.adviser!, locality: vendor.location?.locality, categoryCodes: vendor.categoryCodes }));
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const rows = await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, (tx) => tx.query<SqlRow>(`SELECT cr.public_id,cr.status::text,cr.source_metadata,cr.requested_quantity,cr.postcode,cr.expires_at,cr.created_at,cv.public_id AS canonical_public_id,v.public_id AS vendor_public_id,v.trading_name,
    '[]'::jsonb AS private_offers
    FROM counteroffer_requests cr LEFT JOIN canonical_variants cv ON cv.id=cr.canonical_variant_id LEFT JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
    WHERE cr.status NOT IN ('converted','closed','expired') ORDER BY CASE WHEN cr.status='submitted' THEN 0 ELSE 1 END,cr.updated_at,cr.created_at`), { readOnly: true });
  const requests = rows.rows.map(toView).map((request) => ({ ...request, eligibleVendors: request.category ? candidatesFromDirectory(directory, request.category, 12) : allVendors.slice(0, 20) }));
  return { csrfToken: principal.csrfToken, requests, vendors: allVendors };
}

export async function adminRouteAskLocalRequest(principal: SessionPrincipal, input: { requestId: string; vendorId: string; category?: string; reason?: string; now?: number }): Promise<void> {
  const requestId = input.requestId.trim();
  const vendorId = input.vendorId.trim();
  const category = input.category?.trim().slice(0, 100) || undefined;
  const reason = input.reason?.trim().slice(0, 500) || "admin_dispatch";
  const now = input.now ?? Date.now();
  if (!requestId || !vendorId) throw new Error("Request and vendor are required");
  if (!postgresEnabled()) throw new Error("Admin Ask Local routing requires the production database");

  const vendor = await getPublicVendorDirectoryEntry(vendorId);
  if (!vendor || vendor.directoryStatus !== "partner" || !vendor.adviser) throw new Error("Ο vendor δεν είναι ενεργός σύμβουλος");
  if (category && !vendor.categoryCodes.some((code) => categoryCodeMatches(code, category))) throw new Error("Ο vendor δεν είναι επιλέξιμος για αυτή την κατηγορία");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT cr.id::text AS id,cr.status::text,cr.source_metadata,cr.canonical_variant_id::text AS canonical_uuid FROM counteroffer_requests cr WHERE cr.public_id=$1 FOR UPDATE`, [requestId]);
    if (!found.rowCount) throw new Error("Ask Local request not found");
    if (TERMINAL_STATUSES.has(String(found.rows[0].status))) throw new Error("Το αίτημα έχει ήδη ολοκληρωθεί");
    const activeVendor = await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_businesses WHERE public_id=$1 AND status='active'", [vendorId]);
    if (!activeVendor.rowCount) throw new Error("Ο vendor δεν είναι πλέον ενεργός");
    const vendorUuid = String(activeVendor.rows[0].id);
    let offerUuid: string | undefined;
    if (found.rows[0].canonical_uuid) {
      const offer = await tx.query<SqlRow>(`SELECT vo.id::text AS id FROM vendor_offers vo JOIN vendor_locations vl ON vl.id=vo.location_id WHERE vo.vendor_id=$1::uuid AND vo.canonical_variant_id=$2::uuid AND vo.status='approved' AND vl.active=true ORDER BY vo.updated_at DESC,vo.id LIMIT 1`, [vendorUuid, String(found.rows[0].canonical_uuid)]);
      if (offer.rowCount) offerUuid = String(offer.rows[0].id);
    }
    const metadata = (found.rows[0].source_metadata ?? {}) as Record<string, unknown>;
    const next = withRouting(metadata, { at: now, owner: "vendor", reason, vendorId, adviser: vendor.adviser, category: category ?? (typeof metadata.category === "string" ? metadata.category : undefined), event: "admin_assigned_vendor" });
    const dueAt = new Date(now + VENDOR_RESPONSE_MS);
    await tx.query(`UPDATE counteroffer_requests SET status='awaiting_vendor',assigned_vendor_id=$2,assigned_offer_id=$3,expires_at=$4,source_metadata=$5::jsonb,updated_at=$6 WHERE id=$1`, [String(found.rows[0].id), vendorUuid, offerUuid ?? null, dueAt, JSON.stringify(next), new Date(now)]);
    await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3,'in_app','transactional','counteroffer.requested','ask-local-v2','el','Ask Local · ανάθεση από την πλατφόρμα',$4,$5::jsonb,'queued',$6,$7) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [randomUUID(), `notification_${randomUUID()}`, vendorUuid, typeof metadata.need === "string" ? metadata.need.slice(0, 240) : "Νέο ιδιωτικό αίτημα", JSON.stringify({ requestId, category: category ?? metadata.category, responseDueAt: dueAt.getTime() }), `ask-local-admin-route:${requestId}:${vendorId}:${now}`, new Date(now)]);
  }, { isolation: "serializable" });
}

export async function vendorReturnAskLocalToAdmin(principal: SessionPrincipal, input: { requestId: string; reason: string; now?: number }): Promise<void> {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId) throw new Error("Vendor scope required");
  const requestId = input.requestId.trim();
  const reason = input.reason.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!requestId || reason.length < 3) throw new Error("Χρειάζεται σύντομος λόγος επιστροφής στην πλατφόρμα");
  if (!postgresEnabled()) throw new Error("Vendor Ask Local routing requires the production database");
  const now = input.now ?? Date.now();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT cr.id::text AS id,cr.status::text,cr.source_metadata FROM counteroffer_requests cr WHERE cr.public_id=$1 AND cr.assigned_vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) FOR UPDATE`, [requestId, vendorId]);
    if (!found.rowCount) throw new Error("Το αίτημα δεν είναι ανατεθειμένο στο κατάστημά σου");
    if (TERMINAL_STATUSES.has(String(found.rows[0].status))) throw new Error("Το αίτημα έχει ήδη ολοκληρωθεί");
    const metadata = (found.rows[0].source_metadata ?? {}) as Record<string, unknown>;
    const next = withRouting(metadata, { at: now, owner: "admin", reason: `vendor_returned:${reason}`, category: typeof metadata.category === "string" ? metadata.category : undefined, event: "returned_to_admin" });
    await tx.query(`UPDATE counteroffer_requests SET status='submitted',assigned_vendor_id=NULL,assigned_offer_id=NULL,expires_at=NULL,source_metadata=$2::jsonb,updated_at=$3 WHERE id=$1`, [String(found.rows[0].id), JSON.stringify(next), new Date(now)]);
  }, { isolation: "serializable" });
}

async function submitMemory(principal: SessionPrincipal, input: ReturnType<typeof validate>): Promise<AskLocalRequestView> {
  let assignedVendorId: string | undefined;
  let assignedVendorName: string | undefined;
  let assignedAdviser: string | undefined;
  let routingReason = "search_requires_admin_review";
  if (input.entryMode === "product" && input.canonicalVariantId) {
    const card = await getCatalogCard(input.canonicalVariantId, `ask-local:${principal.userId}`, input.postcode);
    assignedVendorId = card?.vendorId;
    assignedVendorName = card?.vendorName;
    routingReason = assignedVendorId ? "product_fair_assignment" : "product_has_no_eligible_vendor";
  } else if (input.entryMode === "vendor" && input.preferredVendorId) {
    const vendor = await getPublicVendorDirectoryEntry(input.preferredVendorId);
    if (vendor?.directoryStatus === "partner") {
      assignedVendorId = vendor.id; assignedVendorName = vendor.name; assignedAdviser = vendor.adviser; routingReason = "customer_selected_vendor";
    }
  }
  const request: AskLocalRequestView = { id: `cor_${randomUUID()}`, status: assignedVendorId ? "awaiting_vendor" : "submitted", need: input.need, quantity: input.quantity, postcode: input.postcode, entryMode: input.entryMode, category: input.category, routingOwner: assignedVendorId ? "vendor" : "admin", routingReason, canonicalVariantId: input.canonicalVariantId, assignedVendorId, assignedVendorName, assignedAdviser, responseDueAt: assignedVendorId ? input.now + VENDOR_RESPONSE_MS : undefined, createdAt: input.now, privateOffers: [] };
  const items = memoryStore().get(principal.userId) ?? []; items.push(request); memoryStore().set(principal.userId, items); return request;
}

function validate(input: AskLocalSubmitInput) {
  const need = input.need.trim().replace(/\s+/g, " "); if (need.length < 10 || need.length > 2000) throw new Error("Η περιγραφή πρέπει να έχει από 10 έως 2.000 χαρακτήρες");
  const postcode = input.postcode.trim(); if (!/^\d{5}$/.test(postcode)) throw new Error("Χρειάζεται έγκυρος πενταψήφιος ΤΚ");
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) throw new Error("Η ποσότητα πρέπει να είναι από 1 έως 99");
  let sourceUrl: string | undefined; if (input.sourceUrl?.trim()) { const parsed = new URL(input.sourceUrl.trim()); if (!['http:','https:'].includes(parsed.protocol)) throw new Error("Ο σύνδεσμος πρέπει να χρησιμοποιεί HTTP ή HTTPS"); sourceUrl = parsed.toString().slice(0, 2000); }
  const normalized: AskLocalSubmitInput = { ...input, sourceUrl };
  return { need, postcode, quantity: input.quantity, sourceUrl, canonicalVariantId: input.canonicalVariantId?.trim() || undefined, preferredVendorId: input.preferredVendorId?.trim() || undefined, category: input.category?.trim().slice(0, 100) || undefined, entryMode: normalizeEntryMode(normalized), now: input.now ?? Date.now() };
}

function toView(row: SqlRow): AskLocalRequestView {
  const metadata = (row.source_metadata ?? {}) as Record<string, unknown>;
  const entryMode = ["search", "category", "product", "vendor"].includes(String(metadata.entryMode)) ? String(metadata.entryMode) as AskLocalEntryMode : "search";
  const routingOwner = metadata.routingOwner === "vendor" && row.vendor_public_id ? "vendor" : "admin";
  return { id: String(row.public_id), status: String(row.status), need: typeof metadata.need === "string" ? metadata.need : "Local request", quantity: Number(row.requested_quantity), postcode: String(row.postcode), entryMode, category: typeof metadata.category === "string" ? metadata.category : undefined, routingOwner, routingReason: typeof metadata.routingReason === "string" ? metadata.routingReason : undefined, canonicalVariantId: typeof row.canonical_public_id === "string" ? row.canonical_public_id : undefined, assignedVendorId: typeof row.vendor_public_id === "string" ? row.vendor_public_id : undefined, assignedVendorName: typeof row.trading_name === "string" ? row.trading_name : undefined, assignedAdviser: typeof metadata.assignedAdviser === "string" ? metadata.assignedAdviser : undefined, responseDueAt: row.expires_at ? new Date(String(row.expires_at)).getTime() : undefined, createdAt: new Date(String(row.created_at)).getTime(), privateOffers: Array.isArray(row.private_offers) ? row.private_offers as AskLocalRequestView["privateOffers"] : [] };
}
