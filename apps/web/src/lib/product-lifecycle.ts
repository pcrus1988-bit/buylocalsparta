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

async function audit(client: any, principal: SessionPrincipal, action: string, entityId: string, reason: string, beforeState: unknown, afterState: unknown) {
  const user = await actor(client, principal);
  await client.query(`
    INSERT INTO public.audit_events(
      id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at
    ) VALUES(
      $1,$2,(SELECT id FROM public.markets WHERE code='sparta' LIMIT 1),$3,$4,$5,$6,'vendor_product_submission',$7,$8,$9::jsonb,$10::jsonb,now()
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
    JSON.stringify(afterState ?? null)
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
        requestedAt: new Date(latest.requested_at).getTime(),
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
          (SELECT count(*)::int FROM public.counteroffer_requests WHERE assigned_offer_id=$1::uuid) AS counteroffers
      `, [row.offer_uuid]);
      const h = history.rows[0] ?? {};
      const protectedCount = Number(h.order_lines ?? 0) + Number(h.return_replacements ?? 0) + Number(h.substitutions ?? 0) + Number(h.counteroffers ?? 0);
      if (protectedCount > 0) throw new Error("This product has protected order/return/counteroffer history and cannot be permanently deleted. Archive it instead.");

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
      SELECT o.id::text AS offer_uuid,o.public_id,o.vendor_id::text AS vendor_uuid,o.status::text,
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
    if (String(row.status) !== "archived") throw new Error("Only archived products can request activation");

    const existing = await client.query(`
      SELECT public_id FROM public.vendor_product_activation_requests
      WHERE offer_id=$1::uuid AND status='pending' LIMIT 1
    `, [row.offer_uuid]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return { ok: true, requestId: String(existing.rows[0].public_id), status: "pending" };
    }

    const requestId = `vpar_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await client.query(`
      INSERT INTO public.vendor_product_activation_requests(
        id,public_id,vendor_id,offer_id,submission_id,status,requested_by,requested_at,created_at,updated_at
      ) VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,'pending',$6::uuid,now(),now(),now())
    `, [randomUUID(), requestId, row.vendor_uuid, row.offer_uuid, row.submission_uuid ?? null, user.id]);
    await client.query("COMMIT");
    return { ok: true, requestId, status: "pending" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
