import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlRow,
  type VendorCapability
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
function publicId(prefix: string): string {
  return prefix + "_" + randomUUID().replaceAll("-", "");
}
async function scope(
  principal: SessionPrincipal,
  capability: VendorCapability,
  work: (tx: SqlExecutor, context: Awaited<ReturnType<typeof contextFor>>) => Promise<unknown>
) {
  const context = await contextFor(principal);
  assertVendorCapability(context, capability);
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction(
    { actorUserId: principal.userId, vendorId: context.vendorId, marketId: context.marketId },
    (tx) => work(tx, context)
  );
}
async function contextFor(principal: SessionPrincipal) {
  const assignment = await resolveVendorOperatingAssignment(principal);
  return buildVendorOperatingContextFromSession(principal, assignment);
}
function vendorWhere(alias = "v") {
  return `(${alias}.public_id=$1 OR ${alias}.id::text=$1)`;
}

export async function vendorLocalDeliveryWorkspace(principal: SessionPrincipal) {
  return scope(principal, "local_delivery.manage", async (tx, context) => {
    const location = await tx.query<SqlRow>(`
      SELECT COALESCE(l.public_id,l.id::text) location_id,l.is_primary,l.active,
             COALESCE(z.public_id,'') zone_id,COALESCE(z.postcode_prefixes,'{}'::text[]) postcode_prefixes,
             COALESCE(z.active,false) zone_active,z.updated_at
      FROM vendor_businesses v
      JOIN vendor_locations l ON l.vendor_id=v.id AND l.active=true
      LEFT JOIN fulfilment_service_zones z
        ON z.vendor_id=v.id AND z.location_id=l.id AND z.mode='local_delivery'
       AND z.public_id NOT LIKE 'market_default_local_delivery_%'
      WHERE ${vendorWhere("v")}
      ORDER BY l.is_primary DESC,l.created_at,l.id,z.priority DESC,z.created_at DESC
      LIMIT 1
    `, [context.vendorId]);
    const row = location.rows[0];
    return {
      marketId: context.marketId,
      hubId: context.hubId,
      locationId: text(row?.location_id) ?? context.locationId,
      active: row?.zone_active === true,
      postcodePrefixes: Array.isArray(row?.postcode_prefixes) ? row.postcode_prefixes.map(String) : [],
      updatedAt: row?.updated_at ? new Date(String(row.updated_at)).getTime() : undefined
    };
  }) as Promise<{
    marketId: string; hubId?: string; locationId?: string; active: boolean; postcodePrefixes: string[]; updatedAt?: number;
  }>;
}

export async function updateVendorLocalDelivery(
  principal: SessionPrincipal,
  input: { active: boolean; postcodePrefixes: readonly string[] }
) {
  return scope(principal, "local_delivery.manage", async (tx, context) => {
    const prefixes = [...new Set(input.postcodePrefixes.map((value) => value.trim()).filter(Boolean))];
    if (prefixes.some((value) => !/^\d{2,5}$/.test(value))) throw new Error("Οι ΤΚ πρέπει να περιέχουν 2–5 ψηφία.");
    if (input.active && prefixes.length === 0) throw new Error("Χρειάζεται τουλάχιστον ένας ΤΚ για ενεργή τοπική παράδοση.");
    const resolved = await tx.query<SqlRow>(`
      SELECT v.id::text vendor_uuid,m.id::text market_uuid,l.id::text location_uuid,COALESCE(l.public_id,l.id::text) location_public_id
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id
      JOIN vendor_locations l ON l.vendor_id=v.id AND l.active=true
      WHERE ${vendorWhere("v")}
      ORDER BY l.is_primary DESC,l.created_at,l.id
      LIMIT 1
    `, [context.vendorId]);
    if (resolved.rowCount !== 1) throw new Error("Δεν βρέθηκε ενεργή τοποθεσία καταστήματος.");
    const row = resolved.rows[0];
    const zoneId = "vendor_local_delivery_" + String(row.location_public_id);
    await tx.query(`
      INSERT INTO fulfilment_service_zones(
        id,public_id,market_id,vendor_id,location_id,mode,postcode_prefixes,
        active,priority,starts_at,created_at,updated_at
      ) VALUES(
        gen_random_uuid(),$1,$2::uuid,$3::uuid,$4::uuid,'local_delivery',$5::text[],
        $6,100,now()-interval '1 minute',now(),now()
      )
      ON CONFLICT(public_id) DO UPDATE SET
        postcode_prefixes=EXCLUDED.postcode_prefixes,
        active=EXCLUDED.active,
        priority=EXCLUDED.priority,
        ends_at=NULL,
        updated_at=now()
    `, [zoneId, String(row.market_uuid), String(row.vendor_uuid), String(row.location_uuid), prefixes, input.active]);
    return { ok: true };
  });
}

export async function vendorPromotionsWorkspace(principal: SessionPrincipal) {
  return scope(principal, "promotions.manage", async (tx, context) => {
    const [offers, requests] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT vo.public_id offer_id,COALESCE(el.title,en.title,cv.model,cv.slug) title,vo.customer_price_minor
        FROM vendor_offers vo
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE ${vendorWhere("v")} AND vo.status='approved'
        ORDER BY title,vo.public_id
        LIMIT 500
      `, [context.vendorId]),
      tx.query<SqlRow>(`
        SELECT r.public_id,vo.public_id offer_id,COALESCE(el.title,en.title,cv.model,cv.slug) title,
               r.name,r.current_price_snapshot_minor,r.promotional_price_minor,r.starts_at,r.ends_at,
               r.reason,r.status,r.review_note,r.created_at
        FROM vendor_promotion_requests r
        JOIN vendor_businesses v ON v.id=r.vendor_id
        JOIN vendor_offers vo ON vo.id=r.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE ${vendorWhere("v")}
        ORDER BY r.created_at DESC
        LIMIT 100
      `, [context.vendorId])
    ]);
    return {
      offers: offers.rows.map((row) => ({
        offerId: String(row.offer_id), title: String(row.title), priceMinor: integer(row.customer_price_minor)
      })),
      requests: requests.rows.map((row) => ({
        id: String(row.public_id), offerId: String(row.offer_id), title: String(row.title), name: String(row.name),
        currentPriceMinor: integer(row.current_price_snapshot_minor), promotionalPriceMinor: integer(row.promotional_price_minor),
        startsAt: new Date(String(row.starts_at)).getTime(), endsAt: new Date(String(row.ends_at)).getTime(),
        reason: String(row.reason), status: String(row.status), reviewNote: text(row.review_note),
        createdAt: new Date(String(row.created_at)).getTime()
      }))
    };
  }) as Promise<{
    offers: Array<{ offerId: string; title: string; priceMinor: number }>;
    requests: Array<{ id: string; offerId: string; title: string; name: string; currentPriceMinor: number; promotionalPriceMinor: number; startsAt: number; endsAt: number; reason: string; status: string; reviewNote?: string; createdAt: number }>;
  }>;
}

export async function requestVendorPromotion(
  principal: SessionPrincipal,
  input: { offerId: string; name: string; promotionalPriceMinor: number; startsAt: number; endsAt: number; reason: string }
) {
  return scope(principal, "promotions.manage", async (tx, context) => {
    if (!input.offerId.trim()) throw new Error("Επίλεξε προϊόν.");
    if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("Η ονομασία προσφοράς πρέπει να έχει 2–120 χαρακτήρες.");
    if (!Number.isSafeInteger(input.promotionalPriceMinor) || input.promotionalPriceMinor < 0) throw new Error("Η τιμή προσφοράς δεν είναι έγκυρη.");
    if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt) || input.endsAt <= input.startsAt) throw new Error("Οι ημερομηνίες προσφοράς δεν είναι έγκυρες.");
    if (input.reason.trim().length < 2 || input.reason.trim().length > 1000) throw new Error("Συμπλήρωσε σύντομη αιτιολογία.");
    const offer = await tx.query<SqlRow>(`
      SELECT vo.id::text offer_uuid,vo.canonical_variant_id::text canonical_uuid,vo.customer_price_minor,
             v.id::text vendor_uuid,v.market_id::text market_uuid
      FROM vendor_offers vo JOIN vendor_businesses v ON v.id=vo.vendor_id
      WHERE vo.public_id=$2 AND ${vendorWhere("v")} AND vo.status='approved'
      LIMIT 1
    `, [context.vendorId, input.offerId.trim()]);
    if (offer.rowCount !== 1) throw new Error("Το προϊόν δεν ανήκει στο κατάστημά σου.");
    const row = offer.rows[0];
    const currentPrice = integer(row.customer_price_minor);
    if (input.promotionalPriceMinor >= currentPrice) throw new Error("Η τιμή προσφοράς πρέπει να είναι χαμηλότερη από την τρέχουσα τιμή.");
    await tx.query(`
      INSERT INTO vendor_promotion_requests(
        id,public_id,market_id,vendor_id,vendor_offer_id,canonical_variant_id,name,currency,
        current_price_snapshot_minor,promotional_price_minor,starts_at,ends_at,reason,status,requested_by,created_at,updated_at
      ) VALUES(
        gen_random_uuid(),$1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'EUR',$7,$8,$9,$10,$11,'pending',
        NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now()
      )
    `, [
      publicId("vpromo"), String(row.market_uuid), String(row.vendor_uuid), String(row.offer_uuid), String(row.canonical_uuid),
      input.name.trim(), currentPrice, input.promotionalPriceMinor, new Date(input.startsAt), new Date(input.endsAt), input.reason.trim()
    ]);
    return { ok: true };
  });
}

export async function vendorAadeWorkspace(principal: SessionPrincipal) {
  return scope(principal, "aade.manage", async (tx, context) => {
    const [docs, requests] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT d.public_id,d.document_number,d.type,d.aade_mark,d.aade_uid,d.transmission_status,d.last_transmission_at,
               d.last_error,d.gross_minor,d.created_at
        FROM tax_documents d JOIN vendor_businesses v ON v.id=d.vendor_id
        WHERE ${vendorWhere("v")}
        ORDER BY d.created_at DESC
        LIMIT 100
      `, [context.vendorId]),
      tx.query<SqlRow>(`
        SELECT r.public_id,d.public_id document_id,d.document_number,r.action,r.note,r.status,r.resolution_note,r.created_at
        FROM vendor_aade_action_requests r
        JOIN vendor_businesses v ON v.id=r.vendor_id
        JOIN tax_documents d ON d.id=r.tax_document_id
        WHERE ${vendorWhere("v")}
        ORDER BY r.created_at DESC
        LIMIT 100
      `, [context.vendorId])
    ]);
    return {
      documents: docs.rows.map((row) => ({
        id: String(row.public_id), number: text(row.document_number), type: String(row.type),
        mark: text(row.aade_mark), uid: text(row.aade_uid), transmissionStatus: String(row.transmission_status),
        lastTransmissionAt: row.last_transmission_at ? new Date(String(row.last_transmission_at)).getTime() : undefined,
        lastError: text(row.last_error), grossMinor: integer(row.gross_minor), createdAt: new Date(String(row.created_at)).getTime()
      })),
      requests: requests.rows.map((row) => ({
        id: String(row.public_id), documentId: String(row.document_id), documentNumber: text(row.document_number),
        action: String(row.action), note: text(row.note), status: String(row.status), resolutionNote: text(row.resolution_note),
        createdAt: new Date(String(row.created_at)).getTime()
      }))
    };
  }) as Promise<{
    documents: Array<{ id: string; number?: string; type: string; mark?: string; uid?: string; transmissionStatus: string; lastTransmissionAt?: number; lastError?: string; grossMinor: number; createdAt: number }>;
    requests: Array<{ id: string; documentId: string; documentNumber?: string; action: string; note?: string; status: string; resolutionNote?: string; createdAt: number }>;
  }>;
}

export async function requestVendorAadeAction(
  principal: SessionPrincipal,
  input: { documentId: string; action: "review" | "retry" | "reconcile"; note?: string }
) {
  return scope(principal, "aade.manage", async (tx, context) => {
    if (!["review","retry","reconcile"].includes(input.action)) throw new Error("Μη έγκυρη ενέργεια AADE.");
    const note = input.note?.trim() || undefined;
    if (note && note.length > 1000) throw new Error("Η σημείωση είναι πολύ μεγάλη.");
    const doc = await tx.query<SqlRow>(`
      SELECT d.id::text document_uuid,v.id::text vendor_uuid,v.market_id::text market_uuid
      FROM tax_documents d JOIN vendor_businesses v ON v.id=d.vendor_id
      WHERE d.public_id=$2 AND ${vendorWhere("v")}
      LIMIT 1
    `, [context.vendorId, input.documentId.trim()]);
    if (doc.rowCount !== 1) throw new Error("Το παραστατικό δεν ανήκει στο κατάστημά σου.");
    const row = doc.rows[0];
    await tx.query(`
      INSERT INTO vendor_aade_action_requests(
        id,public_id,market_id,vendor_id,tax_document_id,action,note,status,requested_by,created_at,updated_at
      ) VALUES(
        gen_random_uuid(),$1,$2::uuid,$3::uuid,$4::uuid,$5,$6,'pending',
        NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now()
      )
    `, [publicId("vaade"), String(row.market_uuid), String(row.vendor_uuid), String(row.document_uuid), input.action, note ?? null]);
    return { ok: true };
  });
}

export async function vendorSubscriptionWorkspace(principal: SessionPrincipal) {
  return scope(principal, "subscription.manage", async (tx, context) => {
    const [plans, current, requests] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT p.id::text plan_uuid,p.code,p.name,p.monthly_price_minor,p.annual_price_minor,p.term_price_minor,
               p.term_months,p.sales_fee_bps,p.listing_fee_minor
        FROM vendor_plans p JOIN markets m ON m.id=p.market_id
        WHERE (m.code=$1 OR m.id::text=$1) AND p.status='active'
        ORDER BY COALESCE(p.monthly_price_minor,p.annual_price_minor,p.term_price_minor,0),p.name
      `, [context.marketId]),
      tx.query<SqlRow>(`
        SELECT s.public_id,p.code,p.name,s.status,s.starts_at,s.ends_at,s.sales_fee_bps_snapshot
        FROM vendor_subscriptions s
        JOIN vendor_businesses v ON v.id=s.vendor_id
        JOIN vendor_plans p ON p.id=s.plan_id
        WHERE ${vendorWhere("v")}
        ORDER BY COALESCE(s.starts_at,s.created_at) DESC
        LIMIT 1
      `, [context.vendorId]),
      tx.query<SqlRow>(`
        SELECT r.public_id,p.code,p.name,r.note,r.status,r.resolution_note,r.created_at
        FROM vendor_subscription_change_requests r
        JOIN vendor_businesses v ON v.id=r.vendor_id
        JOIN vendor_plans p ON p.id=r.requested_plan_id
        WHERE ${vendorWhere("v")}
        ORDER BY r.created_at DESC
        LIMIT 100
      `, [context.vendorId])
    ]);
    return {
      plans: plans.rows.map((row) => ({
        id: String(row.plan_uuid), code: String(row.code), name: String(row.name),
        monthlyPriceMinor: row.monthly_price_minor == null ? undefined : integer(row.monthly_price_minor),
        annualPriceMinor: row.annual_price_minor == null ? undefined : integer(row.annual_price_minor),
        termPriceMinor: row.term_price_minor == null ? undefined : integer(row.term_price_minor),
        termMonths: row.term_months == null ? undefined : integer(row.term_months),
        salesFeeBps: integer(row.sales_fee_bps), listingFeeMinor: integer(row.listing_fee_minor)
      })),
      current: current.rowCount ? {
        id: String(current.rows[0].public_id), code: String(current.rows[0].code), name: String(current.rows[0].name),
        status: String(current.rows[0].status), startsAt: current.rows[0].starts_at ? new Date(String(current.rows[0].starts_at)).getTime() : undefined,
        endsAt: current.rows[0].ends_at ? new Date(String(current.rows[0].ends_at)).getTime() : undefined,
        salesFeeBps: integer(current.rows[0].sales_fee_bps_snapshot)
      } : undefined,
      requests: requests.rows.map((row) => ({
        id: String(row.public_id), code: String(row.code), name: String(row.name), note: text(row.note),
        status: String(row.status), resolutionNote: text(row.resolution_note), createdAt: new Date(String(row.created_at)).getTime()
      }))
    };
  }) as Promise<{
    plans: Array<{ id: string; code: string; name: string; monthlyPriceMinor?: number; annualPriceMinor?: number; termPriceMinor?: number; termMonths?: number; salesFeeBps: number; listingFeeMinor: number }>;
    current?: { id: string; code: string; name: string; status: string; startsAt?: number; endsAt?: number; salesFeeBps: number };
    requests: Array<{ id: string; code: string; name: string; note?: string; status: string; resolutionNote?: string; createdAt: number }>;
  }>;
}

export async function requestVendorSubscriptionChange(
  principal: SessionPrincipal,
  input: { planId: string; note?: string }
) {
  return scope(principal, "subscription.manage", async (tx, context) => {
    const note = input.note?.trim() || undefined;
    if (note && note.length > 1000) throw new Error("Η σημείωση είναι πολύ μεγάλη.");
    const resolved = await tx.query<SqlRow>(`
      SELECT p.id::text plan_uuid,v.id::text vendor_uuid,v.market_id::text market_uuid,
             (SELECT s.id::text FROM vendor_subscriptions s WHERE s.vendor_id=v.id ORDER BY COALESCE(s.starts_at,s.created_at) DESC LIMIT 1) current_subscription_uuid
      FROM vendor_businesses v
      JOIN vendor_plans p ON p.id::text=$2 AND p.market_id=v.market_id AND p.status='active'
      WHERE ${vendorWhere("v")}
      LIMIT 1
    `, [context.vendorId, input.planId.trim()]);
    if (resolved.rowCount !== 1) throw new Error("Το πρόγραμμα δεν είναι διαθέσιμο για το HUB σου.");
    const row = resolved.rows[0];
    await tx.query(`
      INSERT INTO vendor_subscription_change_requests(
        id,public_id,market_id,vendor_id,current_subscription_id,requested_plan_id,note,status,requested_by,created_at,updated_at
      ) VALUES(
        gen_random_uuid(),$1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'pending',
        NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now()
      )
    `, [
      publicId("vsubchg"), String(row.market_uuid), String(row.vendor_uuid),
      row.current_subscription_uuid ? String(row.current_subscription_uuid) : null, String(row.plan_uuid), note ?? null
    ]);
    return { ok: true };
  });
}
