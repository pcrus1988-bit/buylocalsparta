import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const db = () => getProductionPostgresRuntime().sqlPool;

async function actor(client: any, principal: SessionPrincipal) {
  const result = await client.query(
    `SELECT id::text AS id,public_id FROM public.users WHERE id::text=$1 OR public_id=$1 LIMIT 1`,
    [principal.userId]
  );
  if (!result.rowCount) throw new Error("User account could not be resolved");
  return { id: String(result.rows[0].id), publicId: String(result.rows[0].public_id) };
}

async function product(client: any, submissionId: string, lock = false) {
  const result = await client.query(`
    SELECT s.id::text AS submission_uuid,s.public_id,s.vendor_id::text AS vendor_uuid,
           v.public_id AS vendor_public_id,s.canonical_variant_id::text AS canonical_uuid,
           s.vendor_sku,s.status::text AS submission_status,
           o.id::text AS offer_uuid,o.public_id AS offer_public_id,o.status::text AS offer_status
    FROM public.vendor_product_submissions s
    JOIN public.vendor_businesses v ON v.id=s.vendor_id
    LEFT JOIN LATERAL (
      SELECT vo.id,vo.public_id,vo.status,vo.vendor_sku,vo.updated_at
      FROM public.vendor_offers vo
      WHERE vo.vendor_id=s.vendor_id
        AND s.canonical_variant_id IS NOT NULL
        AND vo.canonical_variant_id=s.canonical_variant_id
        AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR vo.vendor_sku=s.vendor_sku OR vo.vendor_sku IS NULL)
      ORDER BY (vo.vendor_sku=s.vendor_sku) DESC NULLS LAST,vo.updated_at DESC
      LIMIT 1
    ) o ON true
    WHERE s.public_id=$1 OR s.id::text=$1
    ${lock ? "FOR UPDATE OF s" : ""}
  `, [submissionId]);
  if (!result.rowCount) throw new Error("Catalog product not found");
  return result.rows[0] as Record<string, unknown>;
}

async function audit(client: any, principal: SessionPrincipal, action: string, entityId: string, reason: string, beforeState: unknown, afterState: unknown, entityType = "vendor_product_submission") {
  const user = await actor(client, principal);
  await client.query(`
    INSERT INTO public.audit_events(
      id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at
    ) VALUES(
      $1,$2,(SELECT id FROM public.markets WHERE code='sparta' LIMIT 1),$3,$4,$5,$6,$11,$7,$8,$9::jsonb,$10::jsonb,now()
    )
  `, [
    randomUUID(),
    `audit_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    user.id,
    user.publicId,
    principal.roles[0] ?? "admin",
    action,
    entityId,
    reason,
    JSON.stringify(beforeState ?? null),
    JSON.stringify(afterState ?? null),
    entityType
  ]);
}

export async function adminProductLifecycleState(_principal: SessionPrincipal, submissionId: string) {
  const client = await db().connect();
  try {
    const row = await product(client, submissionId);
    const request = row.offer_uuid ? await client.query(`
      SELECT public_id,status,requested_at,resolution_note
      FROM public.vendor_product_activation_requests
      WHERE offer_id=$1::uuid
      ORDER BY (status='pending') DESC,requested_at DESC
      LIMIT 1
    `, [row.offer_uuid]) : { rows: [] as any[] };
    const latest = request.rows[0];
    return {
      submissionId: String(row.public_id),
      submissionStatus: String(row.submission_status),
      offerId: row.offer_public_id ? String(row.offer_public_id) : undefined,
      offerStatus: row.offer_status ? String(row.offer_status) : undefined,
      archived: row.submission_status === "archived" || row.offer_status === "archived",
      activationRequest: latest ? {
        id: String(latest.public_id),
        status: String(latest.status),
        requestedAt: new Date(String(latest.requested_at)).getTime(),
        resolutionNote: latest.resolution_note ? String(latest.resolution_note) : undefined
      } : undefined
    };
  } finally {
    client.release();
  }
}

export async function archiveAdminProduct(principal: SessionPrincipal, submissionId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Archive reason must contain at least 3 characters");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const row = await product(client, submissionId, true);
    const before = { submissionStatus: row.submission_status, offerStatus: row.offer_status };
    await client.query(`UPDATE public.vendor_product_submissions SET status='archived',updated_at=now() WHERE id=$1::uuid`, [row.submission_uuid]);
    if (row.offer_uuid) {
      await client.query(`UPDATE public.vendor_offers SET status='archived',updated_at=now() WHERE id=$1::uuid`, [row.offer_uuid]);
      await client.query(`
        UPDATE public.vendor_product_activation_requests
        SET status='cancelled',resolved_at=now(),resolution_note='Product archived by admin',updated_at=now()
        WHERE offer_id=$1::uuid AND status='pending'
      `, [row.offer_uuid]);
    }
    await audit(client, principal, "catalog.product_archived", String(row.public_id), why, before, { submissionStatus: "archived", offerStatus: row.offer_uuid ? "archived" : undefined });
    await client.query("COMMIT");
    return { ok: true, status: "archived" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reactivateAdminProduct(principal: SessionPrincipal, submissionId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Activation reason must contain at least 3 characters");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const row = await product(client, submissionId, true);
    if (row.submission_status !== "archived" && row.offer_status !== "archived") throw new Error("Product is not archived");
    const nextStatus = row.offer_uuid ? "approved" : row.canonical_uuid ? "linked" : "needs_review";
    if (row.offer_uuid && row.canonical_uuid) {
      const publishable = await client.query(`
        SELECT 1 AS ok FROM public.canonical_variants
        WHERE id=$1::uuid AND active=true AND suppressed=false AND recalled=false
        LIMIT 1
      `, [row.canonical_uuid]);
      if (!publishable.rowCount) throw new Error("Archived product cannot be reactivated because its canonical product is not currently publishable");
    }
    if (row.offer_uuid) await client.query(`UPDATE public.vendor_offers SET status='approved',updated_at=now() WHERE id=$1::uuid`, [row.offer_uuid]);
    await client.query(`UPDATE public.vendor_product_submissions SET status=$2,updated_at=now() WHERE id=$1::uuid`, [row.submission_uuid, nextStatus]);
    if (row.offer_uuid) {
      const user = await actor(client, principal);
      await client.query(`
        UPDATE public.vendor_product_activation_requests
        SET status='approved',resolved_by=$2::uuid,resolved_at=now(),resolution_note=$3,updated_at=now()
        WHERE offer_id=$1::uuid AND status='pending'
      `, [row.offer_uuid, user.id, why]);
    }
    await audit(client, principal, "catalog.product_reactivated", String(row.public_id), why,
      { submissionStatus: row.submission_status, offerStatus: row.offer_status },
      { submissionStatus: nextStatus, offerStatus: row.offer_uuid ? "approved" : undefined });
    await client.query("COMMIT");
    return { ok: true, status: nextStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function permanentlyDeleteAdminProduct(principal: SessionPrincipal, submissionId: string, reason: string, acknowledged: boolean) {
  if (!acknowledged) throw new Error("Permanent deletion must be explicitly acknowledged");
  const why = reason.trim();
  if (why.length < 3) throw new Error("Deletion reason must contain at least 3 characters");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const row = await product(client, submissionId, true);

    if (row.offer_uuid) {
      const history = await client.query(`
        SELECT
          (SELECT count(*)::int FROM public.order_lines WHERE assigned_offer_id=$1::uuid) AS order_lines,
          (SELECT count(*)::int FROM public.return_replacements WHERE offer_id=$1::uuid) AS return_replacements,
          (SELECT count(*)::int FROM public.order_substitution_requests WHERE proposed_offer_id=$1::uuid) AS substitutions,
          (SELECT count(*)::int FROM public.counteroffer_requests WHERE assigned_offer_id=$1::uuid) AS counteroffers,
          (SELECT count(*)::int FROM public.vendor_offer_price_history WHERE offer_id=$1::uuid) AS price_history
      `, [row.offer_uuid]);
      const h = history.rows[0] ?? {};
      const protectedCount = Number(h.order_lines ?? 0) + Number(h.return_replacements ?? 0) + Number(h.substitutions ?? 0) + Number(h.counteroffers ?? 0) + Number(h.price_history ?? 0);
      if (protectedCount > 0) throw new Error("This product has protected order/return/counteroffer/price history and cannot be permanently deleted. Archive it instead.");

      await client.query(`DELETE FROM public.cart_items WHERE assigned_offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.stock_reservations WHERE offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.inventory_movements WHERE offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.fairness_assignment_events WHERE selected_offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.sticky_assignments WHERE offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.product_tax_profiles WHERE vendor_offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.inventory_balances WHERE offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.vendor_product_activation_requests WHERE offer_id=$1::uuid`, [row.offer_uuid]);
      await client.query(`DELETE FROM public.vendor_offers WHERE id=$1::uuid`, [row.offer_uuid]);
    }

    await client.query(`DELETE FROM public.catalog_workflow_events WHERE submission_id=$1::uuid`, [row.submission_uuid]);
    await client.query(`UPDATE public.product_import_rows SET submission_id=NULL WHERE submission_id=$1::uuid`, [row.submission_uuid]);
    await client.query(`DELETE FROM public.product_merge_candidates WHERE submission_id=$1::uuid`, [row.submission_uuid]);
    await audit(client, principal, "catalog.product_deleted", String(row.public_id), why,
      { submissionStatus: row.submission_status, offerStatus: row.offer_status, vendorId: row.vendor_public_id, canonicalVariantId: row.canonical_uuid },
      { deleted: true });
    await client.query(`DELETE FROM public.vendor_product_submissions WHERE id=$1::uuid`, [row.submission_uuid]);
    await client.query("COMMIT");
    return { ok: true, deleted: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requestVendorProductActivation(principal: SessionPrincipal, offerId: string) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const user = await actor(client, principal);
    const result = await client.query(`
      SELECT o.id::text AS offer_uuid,o.public_id,o.vendor_id::text AS vendor_uuid,o.location_id::text AS location_uuid,
             o.canonical_variant_id::text AS canonical_uuid,o.status::text,
             s.id::text AS submission_uuid
      FROM public.vendor_offers o
      JOIN public.vendor_businesses v ON v.id=o.vendor_id
      LEFT JOIN LATERAL (
        SELECT s.id
        FROM public.vendor_product_submissions s
        WHERE s.vendor_id=o.vendor_id AND s.canonical_variant_id=o.canonical_variant_id
          AND ((s.vendor_sku IS NULL AND o.vendor_sku IS NULL) OR s.vendor_sku=o.vendor_sku OR s.vendor_sku IS NULL)
        ORDER BY (s.vendor_sku=o.vendor_sku) DESC NULLS LAST,s.updated_at DESC
        LIMIT 1
      ) s ON true
      WHERE (o.public_id=$1 OR o.id::text=$1) AND (v.public_id=$2 OR v.id::text=$2)
      FOR UPDATE OF o
    `, [offerId, principal.vendorId]);
    if (!result.rowCount) throw new Error("Product not found in this vendor catalogue");
    const row = result.rows[0];

    const existing = await client.query(`
      SELECT public_id FROM public.vendor_product_activation_requests
      WHERE offer_id=$1::uuid AND status='pending' LIMIT 1
    `, [row.offer_uuid]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return { ok: true, requestId: String(existing.rows[0].public_id), status: "pending" };
    }

    const offerStatus = String(row.status);
    if (!["draft", "archived"].includes(offerStatus)) {
      throw new Error(offerStatus === "pending_review" ? "This product is already waiting for activation review" : "Only draft or archived products can request activation");
    }

    if (offerStatus === "draft") {
      const readiness = await client.query(`
        SELECT 1 AS ready
        FROM public.vendor_catalog_assortments vca
        JOIN public.inventory_balances ib ON ib.offer_id=$1::uuid
        JOIN public.canonical_variants cv ON cv.id=$2::uuid
        WHERE vca.vendor_id=$3::uuid
          AND vca.location_id=$4::uuid
          AND vca.canonical_variant_id=$2::uuid
          AND vca.assortment_status='confirmed'
          AND vca.price_check_status='confirmed'
          AND vca.stock_check_status='confirmed'
          AND COALESCE(vca.verified_stock_on_hand,0)>0
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        LIMIT 1
      `, [row.offer_uuid,row.canonical_uuid,row.vendor_uuid,row.location_uuid]);
      if (!readiness.rowCount) {
        throw new Error("Confirm a real supplier price and current physical stock before requesting activation");
      }
    }

    const requestId = `vpar_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await client.query(`
      INSERT INTO public.vendor_product_activation_requests(
        id,public_id,vendor_id,offer_id,submission_id,status,requested_by,requested_at,created_at,updated_at
      ) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,'pending',$6::uuid,now(),now(),now())
    `, [randomUUID(), requestId, row.vendor_uuid, row.offer_uuid, row.submission_uuid ?? null, user.id]);
    if (offerStatus === "draft") {
      await client.query(`UPDATE public.vendor_offers SET status='pending_review',updated_at=now() WHERE id=$1::uuid`, [row.offer_uuid]);
    }
    await client.query("COMMIT");
    return { ok: true, requestId, status: "pending" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveAssignedCatalogueActivationRequest(
  principal: SessionPrincipal,
  requestId: string,
  decision: "approve" | "reject",
  reason: string
) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Activation review reason must contain at least 3 characters");
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT
        r.id::text AS request_uuid,r.public_id AS request_public_id,r.status AS request_status,
        o.id::text AS offer_uuid,o.public_id AS offer_public_id,o.status::text AS offer_status,
        o.vendor_id::text AS vendor_uuid,o.location_id::text AS location_uuid,o.canonical_variant_id::text AS canonical_uuid,
        o.customer_price_minor,o.supplier_unit_price_minor,
        v.status::text AS vendor_status,v.demo_mode,
        cv.active,cv.suppressed,cv.recalled,
        ib.on_hand,ib.active_reservations,ib.safety_stock,ib.blocked,ib.stock_confirmed_at,ib.freshness_ttl_seconds,
        vca.id::text AS assortment_uuid,vca.price_check_status,vca.stock_check_status,vca.verified_stock_on_hand
      FROM public.vendor_product_activation_requests r
      JOIN public.vendor_offers o ON o.id=r.offer_id
      JOIN public.vendor_businesses v ON v.id=o.vendor_id
      JOIN public.canonical_variants cv ON cv.id=o.canonical_variant_id
      LEFT JOIN public.inventory_balances ib ON ib.offer_id=o.id
      LEFT JOIN LATERAL (
        SELECT vca.*
        FROM public.vendor_catalog_assortments vca
        WHERE vca.vendor_id=o.vendor_id
          AND vca.location_id=o.location_id
          AND vca.canonical_variant_id=o.canonical_variant_id
          AND vca.assortment_status NOT IN ('rejected','discontinued')
        ORDER BY vca.updated_at DESC
        LIMIT 1
      ) vca ON true
      WHERE r.public_id=$1 OR r.id::text=$1
      FOR UPDATE OF r,o
    `, [requestId]);
    if (!result.rowCount) throw new Error("Activation request not found");
    const row = result.rows[0];
    if (String(row.request_status) !== "pending") throw new Error("Activation request is no longer pending");
    const user = await actor(client, principal);

    if (decision === "approve") {
      const available = Math.max(0,
        Number(row.on_hand ?? 0)
        - Number(row.active_reservations ?? 0)
        - Number(row.safety_stock ?? 0)
        - Number(row.blocked ?? 0)
      );
      const stockFresh = row.stock_confirmed_at
        && new Date(String(row.stock_confirmed_at)).getTime() + Number(row.freshness_ttl_seconds ?? 0) * 1000 > Date.now();
      if (row.vendor_status !== "active" || row.demo_mode === true) throw new Error("Vendor is not currently commerce eligible");
      if (row.active !== true || row.suppressed === true || row.recalled === true) throw new Error("Canonical product is not currently publishable");
      if (Number(row.customer_price_minor ?? 0) <= 0 || Number(row.supplier_unit_price_minor ?? 0) < 0) throw new Error("Offer pricing is incomplete");
      if (!stockFresh || available <= 0) throw new Error("Fresh physical stock is required before activation");
      if (!row.assortment_uuid || row.price_check_status !== "confirmed" || row.stock_check_status !== "confirmed" || Number(row.verified_stock_on_hand ?? 0) <= 0) {
        throw new Error("Assigned-catalogue commercial evidence is incomplete");
      }

      await client.query(`UPDATE public.vendor_offers SET status='approved',merchant_visible=true,merchant_pause_active=false,updated_at=now() WHERE id=$1::uuid`, [row.offer_uuid]);
      await client.query(`
        UPDATE public.vendor_catalog_assortments
        SET assortment_status='confirmed',availability_mode='in_stock',confirmation_source='vendor',confirmed_at=COALESCE(confirmed_at,now()),
            metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('activationApprovedAt',now(),'activationRequestId',$2),
            updated_at=now()
        WHERE id=$1::uuid
      `, [row.assortment_uuid,row.request_public_id]);
      await client.query(`
        UPDATE public.vendor_product_activation_requests
        SET status='approved',resolved_by=$2::uuid,resolved_at=now(),resolution_note=$3,updated_at=now()
        WHERE id=$1::uuid
      `, [row.request_uuid,user.id,why]);
      await audit(client, principal, "catalog.assigned_product_activation.approved", String(row.offer_public_id), why,
        { offerStatus: row.offer_status, requestStatus: row.request_status },
        { offerStatus: "approved", requestStatus: "approved" },
        "vendor_offer");
    } else {
      if (String(row.offer_status) === "pending_review") {
        await client.query(`UPDATE public.vendor_offers SET status='draft',updated_at=now() WHERE id=$1::uuid`, [row.offer_uuid]);
      }
      await client.query(`
        UPDATE public.vendor_product_activation_requests
        SET status='rejected',resolved_by=$2::uuid,resolved_at=now(),resolution_note=$3,updated_at=now()
        WHERE id=$1::uuid
      `, [row.request_uuid,user.id,why]);
      await audit(client, principal, "catalog.assigned_product_activation.rejected", String(row.offer_public_id), why,
        { offerStatus: row.offer_status, requestStatus: row.request_status },
        { offerStatus: String(row.offer_status) === "pending_review" ? "draft" : row.offer_status, requestStatus: "rejected" },
        "vendor_offer");
    }

    await client.query("COMMIT");
    return { ok: true, status: decision === "approve" ? "approved" : "rejected", offerId: String(row.offer_public_id) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
