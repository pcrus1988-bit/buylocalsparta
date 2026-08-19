import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getCatalogCard } from "./catalog-view";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";
import { getPublicVendorDirectoryEntry } from "./public-vendor-directory";

export type AskLocalRequestView = Readonly<{ id: string; status: string; need: string; quantity: number; postcode: string; canonicalVariantId?: string; assignedVendorId?: string; assignedVendorName?: string; workflowOwnerKind: "admin" | "vendor"; assignmentReason?: string; responseDueAt?: number; createdAt: number; privateOffers: readonly Readonly<{ id: string; status: string; priceMinor: number; currency: string; fulfilmentPromise?: string; expiresAt: number }>[] }>;
export type AskLocalSubmitInput = Readonly<{ need: string; postcode: string; quantity: number; sourceUrl?: string; canonicalVariantId?: string; preferredVendorId?: string; category?: string; now?: number }>;

const globalKey = "__blsAskLocalMemory" as const;
const globals = globalThis as typeof globalThis & { [globalKey]?: Map<string, AskLocalRequestView[]> };

function memoryStore() { return globals[globalKey] ??= new Map(); }
function postgresEnabled() { return Boolean(process.env.DATABASE_URL?.trim()); }

export async function submitAskLocal(principal: SessionPrincipal, raw: AskLocalSubmitInput): Promise<AskLocalRequestView> {
  const input = validate(raw);
  if (!postgresEnabled()) return submitMemory(principal, input);
  const runtime = getProductionPostgresRuntime();
  let assignedVendorId = input.preferredVendorId;
  let assignmentReason = input.preferredVendorId ? "customer_preferred_vendor" : "admin_triage";
  if (input.canonicalVariantId) {
    const assignment = await runtime.customerCommerce.publicAssignedCanonical({ canonicalVariantId: input.canonicalVariantId, visitorKey: `ask-local:${principal.userId}`, postcode: input.postcode, reason: "product_view" });
    assignedVendorId = assignment?.vendorId;
    assignmentReason = assignment ? "fair_assignment" : "no_eligible_local_vendor";
  }
  const publicId = `cor_${randomUUID()}`;
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const user = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1", [principal.userId]);
    if (!user.rowCount) throw new Error("Customer account was not found");
    const canonical = input.canonicalVariantId ? await tx.query<SqlRow>(`SELECT cv.id::text AS id,c.counteroffer_allowed FROM canonical_variants cv JOIN categories c ON c.id=cv.category_id WHERE cv.public_id=$1 AND cv.active=true AND cv.suppressed=false AND cv.recalled=false`, [input.canonicalVariantId]) : undefined;
    if (input.canonicalVariantId && !canonical?.rowCount) throw new Error("Canonical product is not publicly available");
    if (canonical?.rows[0]?.counteroffer_allowed === false) throw new Error("Ask Local is not allowed for this category");
    const vendor = assignedVendorId ? await tx.query<SqlRow>(`SELECT v.id::text AS id,v.trading_name
      FROM vendor_businesses v
      WHERE (v.public_id=$1 OR v.id::text=$1)
        AND v.status='active'
        AND v.public_directory_visible=true
        AND EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.vendor_id=v.id AND vl.active=true)
      LIMIT 1`, [assignedVendorId]) : undefined;
    const assigned = Boolean(vendor?.rowCount);
    if (assignedVendorId && !assigned) assignmentReason = input.canonicalVariantId ? "fair_assignment_ineligible" : "preferred_vendor_ineligible";
    const offer = assigned && canonical?.rows[0]?.id ? await tx.query<SqlRow>(`SELECT vo.id::text AS id FROM vendor_offers vo JOIN vendor_locations vl ON vl.id=vo.location_id WHERE vo.vendor_id=$1::uuid AND vo.canonical_variant_id=$2::uuid AND vo.status='approved' AND vl.active=true ORDER BY vo.updated_at DESC,vo.id LIMIT 1`, [vendor!.rows[0].id, canonical.rows[0].id]) : undefined;
    const dueAt = assigned ? new Date(input.now + 24 * 60 * 60 * 1000) : null;
    const sourceUrl = input.sourceUrl ?? `${publicOrigin()}/ask-local`;
    await tx.query(`INSERT INTO counteroffer_requests(id,public_id,market_id,customer_user_id,visitor_hash,source_url,source_url_hash,source_metadata,canonical_variant_id,requested_quantity,postcode,priorities,status,assigned_vendor_id,assigned_offer_id,expires_at,workflow_owner_kind,assignment_reason,workflow_updated_at,created_at,updated_at)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$19)`, [randomUUID(), publicId, user.rows[0].id, createHash("sha256").update(`ask-local:${principal.userId}`).digest("hex"), sourceUrl, createHash("sha256").update(sourceUrl).digest("hex"), JSON.stringify({ need: input.need, category: input.category, source: "customer_web" }), canonical?.rows[0]?.id ?? null, input.quantity, input.postcode, JSON.stringify({ category: input.category }), assigned ? "awaiting_vendor" : "submitted", assigned ? vendor!.rows[0].id : null, assigned ? offer?.rows[0]?.id ?? null : null, dueAt, assigned ? "vendor" : "admin", assignmentReason, new Date(input.now), new Date(input.now)]);
    await tx.query(`INSERT INTO analytics_events(id,public_id,market_id,event_name,occurred_at,visitor_hash,customer_id,vendor_id,canonical_variant_id,quantity,metadata,dedupe_key,retention_until)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),'counteroffer.requested',$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`, [randomUUID(), `analytics_${randomUUID()}`, new Date(input.now), createHash("sha256").update(`ask-local:${principal.userId}`).digest("hex"), user.rows[0].id, assigned ? vendor!.rows[0].id : null, canonical?.rows[0]?.id ?? null, input.quantity, JSON.stringify({ assigned, assignmentReason, workflowOwnerKind: assigned ? "vendor" : "admin", category: input.category, requestId: publicId }), `ask-local:${publicId}`, new Date(input.now + 400 * 24 * 60 * 60 * 1000)]);
    if (assigned) await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3,'in_app','transactional','counteroffer.requested','ask-local-v2','el','Νέο ιδιωτικό Ask Local αίτημα',$4,$5::jsonb,'queued',$6,$7) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [randomUUID(), `notification_${randomUUID()}`, vendor!.rows[0].id, input.need.slice(0, 240), JSON.stringify({ requestId: publicId, canonicalVariantId: input.canonicalVariantId, responseDueAt: dueAt?.getTime(), assignmentReason }), `ask-local-vendor:${publicId}`, new Date(input.now)]);
    await tx.query(`WITH recipients AS (
      SELECT DISTINCT u.id AS user_id,u.public_id
      FROM platform_user_roles pur
      JOIN users u ON u.id=pur.user_id
      WHERE pur.role IN ('super_admin','customer_support')
        AND u.status='active'
    )
    INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
    SELECT gen_random_uuid(),'notification_' || gen_random_uuid()::text,r.user_id,'in_app','transactional','ask_local.requested','ask-local-admin-v1','el','Νέο Ask Local αίτημα',$1,$2::jsonb,'queued','ask-local-admin:' || $3 || ':' || r.public_id,$4
    FROM recipients r
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [input.need.slice(0, 240), JSON.stringify({ requestId: publicId, workflowOwnerKind: assigned ? "vendor" : "admin", assignedVendorId: assigned ? assignedVendorId : undefined, assignmentReason }), publicId, new Date(input.now)]);
  }, { isolation: "serializable" });
  return (await customerAskLocalRequests(principal)).find((request) => request.id === publicId)!;
}

export async function customerAskLocalRequests(principal: SessionPrincipal): Promise<readonly AskLocalRequestView[]> {
  if (!postgresEnabled()) return [...(memoryStore().get(principal.userId) ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const rows = await tx.query<SqlRow>(`SELECT cr.public_id,cr.status::text,cr.source_metadata,cr.requested_quantity,cr.postcode,cr.expires_at,cr.created_at,cr.workflow_owner_kind,cr.assignment_reason,cv.public_id AS canonical_public_id,v.public_id AS vendor_public_id,v.trading_name,
      COALESCE(jsonb_agg(jsonb_build_object('id',po.public_id,'status',po.status,'priceMinor',po.price_minor,'currency',po.currency,'fulfilmentPromise',po.fulfilment_promise->>'text','expiresAt',extract(epoch from po.expires_at)*1000) ORDER BY po.created_at) FILTER(WHERE po.id IS NOT NULL),'[]'::jsonb) AS private_offers
      FROM counteroffer_requests cr JOIN users u ON u.id=cr.customer_user_id LEFT JOIN canonical_variants cv ON cv.id=cr.canonical_variant_id LEFT JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id LEFT JOIN private_offers po ON po.counteroffer_request_id=cr.id
      WHERE u.public_id=$1 GROUP BY cr.id,cv.public_id,v.public_id,v.trading_name ORDER BY cr.created_at DESC`, [principal.userId]);
    return rows.rows.map(toView);
  }, { readOnly: true });
}

async function submitMemory(principal: SessionPrincipal, input: ReturnType<typeof validate>): Promise<AskLocalRequestView> {
  let assignedVendorId = input.preferredVendorId;
  let assignmentReason = input.preferredVendorId ? "customer_preferred_vendor" : "admin_triage";
  if (input.canonicalVariantId) {
    assignedVendorId = (await getCatalogCard(input.canonicalVariantId, `ask-local:${principal.userId}`, input.postcode))?.vendorId;
    assignmentReason = assignedVendorId ? "fair_assignment" : "no_eligible_local_vendor";
  }
  const vendor = assignedVendorId ? await getPublicVendorDirectoryEntry(assignedVendorId) : undefined;
  if (assignedVendorId && (!vendor || vendor.directoryStatus !== "partner")) assignmentReason = input.canonicalVariantId ? "fair_assignment_ineligible" : "preferred_vendor_ineligible";
  const eligibleVendor = vendor?.directoryStatus === "partner" ? vendor : undefined;
  const request: AskLocalRequestView = { id: `cor_${randomUUID()}`, status: eligibleVendor ? "awaiting_vendor" : "submitted", need: input.need, quantity: input.quantity, postcode: input.postcode, canonicalVariantId: input.canonicalVariantId, assignedVendorId: eligibleVendor?.id, assignedVendorName: eligibleVendor?.name, workflowOwnerKind: eligibleVendor ? "vendor" : "admin", assignmentReason, responseDueAt: eligibleVendor ? input.now + 24 * 60 * 60 * 1000 : undefined, createdAt: input.now, privateOffers: [] };
  const items = memoryStore().get(principal.userId) ?? []; items.push(request); memoryStore().set(principal.userId, items); return request;
}

function validate(input: AskLocalSubmitInput) {
  const need = input.need.trim().replace(/\s+/g, " "); if (need.length < 10 || need.length > 2000) throw new Error("Η περιγραφή πρέπει να έχει από 10 έως 2.000 χαρακτήρες");
  const postcode = input.postcode.trim(); if (!/^\d{5}$/.test(postcode)) throw new Error("Χρειάζεται έγκυρος πενταψήφιος ΤΚ");
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) throw new Error("Η ποσότητα πρέπει να είναι από 1 έως 99");
  let sourceUrl: string | undefined; if (input.sourceUrl?.trim()) { const parsed = new URL(input.sourceUrl.trim()); if (!["http:","https:"].includes(parsed.protocol)) throw new Error("Ο σύνδεσμος πρέπει να χρησιμοποιεί HTTP ή HTTPS"); sourceUrl = parsed.toString().slice(0, 2000); }
  return { need, postcode, quantity: input.quantity, sourceUrl, canonicalVariantId: input.canonicalVariantId?.trim() || undefined, preferredVendorId: input.preferredVendorId?.trim() || undefined, category: input.category?.trim().slice(0, 100) || undefined, now: input.now ?? Date.now() };
}

function toView(row: SqlRow): AskLocalRequestView { const metadata = (row.source_metadata ?? {}) as Record<string, unknown>; const owner = row.workflow_owner_kind === "vendor" ? "vendor" : "admin"; return { id: String(row.public_id), status: String(row.status), need: typeof metadata.need === "string" ? metadata.need : "Local request", quantity: Number(row.requested_quantity), postcode: String(row.postcode), canonicalVariantId: typeof row.canonical_public_id === "string" ? row.canonical_public_id : undefined, assignedVendorId: typeof row.vendor_public_id === "string" ? row.vendor_public_id : undefined, assignedVendorName: typeof row.trading_name === "string" ? row.trading_name : undefined, workflowOwnerKind: owner, assignmentReason: typeof row.assignment_reason === "string" ? row.assignment_reason : undefined, responseDueAt: row.expires_at ? new Date(String(row.expires_at)).getTime() : undefined, createdAt: new Date(String(row.created_at)).getTime(), privateOffers: Array.isArray(row.private_offers) ? row.private_offers as AskLocalRequestView["privateOffers"] : [] }; }
