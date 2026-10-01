import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminCatalogAction,
  adminMatchingWorkspace,
  postgresAdminRuntimeEnabled
} from "../../../../../lib/admin-runtime";
import { adminCreateCanonicalIdentity } from "../../../../../lib/admin-canonical-identity-runtime";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BULK_BATCH_SIZE = 50;

type CandidateRow = {
  id: string;
  status: string;
  canonicalVariantId?: string;
  actionableCandidateId?: string;
  actionableCandidateCount: number;
};

type ApprovalResult = {
  id: string;
  status: "approved" | "skipped" | "failed";
  detail?: string;
};

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as {
      submissionIds?: unknown;
      scope?: unknown;
      q?: unknown;
      status?: unknown;
      cursor?: unknown;
      reason?: unknown;
    };
    const reason = typeof body.reason === "string" && body.reason.trim().length >= 3
      ? body.reason.trim().slice(0, 1000)
      : "Bulk approval by Admin";

    if (body.scope === "all") {
      const query = typeof body.q === "string" ? body.q.trim().slice(0, 120) || undefined : undefined;
      const status = typeof body.status === "string" ? body.status.trim().slice(0, 60) || undefined : undefined;
      const cursor = typeof body.cursor === "string" ? body.cursor.trim() || undefined : undefined;
      const rows = await loadFilteredRows(principal, { query, status, cursor, limit: BULK_BATCH_SIZE + 1 });
      const hasMore = rows.length > BULK_BATCH_SIZE;
      const batchRows = rows.slice(0, BULK_BATCH_SIZE);
      const results = await approveRows(principal, batchRows, reason);
      const summary = summarize(results);

      return Response.json({
        ...summary,
        scanned: batchRows.length,
        hasMore,
        nextCursor: hasMore ? batchRows.at(-1)?.id : undefined,
        details: results.filter((item) => item.status !== "approved").slice(0, 30)
      });
    }

    const ids = Array.isArray(body.submissionIds)
      ? [...new Set(body.submissionIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))]
      : [];
    if (!ids.length) throw new Error("Select at least one submission.");
    if (ids.length > 100) throw new Error("Bulk approval is limited to 100 submissions per action.");

    const rows = await loadRows(principal, ids);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = ids.map((id) => rowById.get(id) ?? {
      id,
      status: "missing",
      actionableCandidateCount: 0
    });
    const results = await approveRows(principal, orderedRows, reason);
    const summary = summarize(results);

    return Response.json({
      ...summary,
      scanned: orderedRows.length,
      hasMore: false,
      details: results.filter((item) => item.status !== "approved").slice(0, 30)
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_bulk_approve_failed" }, { status: 400 });
  }
}

async function approveRows(
  principal: Awaited<ReturnType<typeof requireAdminSession>>,
  rows: readonly CandidateRow[],
  reason: string
): Promise<ApprovalResult[]> {
  const results: ApprovalResult[] = [];

  for (const row of rows) {
    const id = row.id;
    try {
      if (row.status === "missing") {
        results.push({ id, status: "skipped", detail: "Submission not found." });
        continue;
      }
      if (row.status === "approved") {
        results.push({ id, status: "skipped", detail: "Already approved." });
        continue;
      }
      if (!["submitted", "needs_review", "linked"].includes(row.status)) {
        results.push({ id, status: "skipped", detail: `Status ${row.status} is not bulk-approvable.` });
        continue;
      }

      if (!row.canonicalVariantId) {
        if (row.actionableCandidateCount > 1) {
          results.push({ id, status: "skipped", detail: "Multiple matching candidates require an Admin decision." });
          continue;
        }
        if (row.actionableCandidateCount === 1 && row.actionableCandidateId) {
          if (!["needs_review", "linked"].includes(row.status)) {
            results.push({ id, status: "skipped", detail: "Matching has not reached review state yet." });
            continue;
          }
          await adminCatalogAction(principal, {
            kind: "approve_match",
            id: row.actionableCandidateId,
            reason
          });
        } else {
          await adminCreateCanonicalIdentity(principal, { submissionId: id, reason });
        }
      }

      await adminCatalogAction(principal, { kind: "approve_offer", id, reason });
      results.push({ id, status: "approved" });
    } catch (error) {
      results.push({ id, status: "failed", detail: error instanceof Error ? error.message : "Approval failed." });
    }
  }

  return results;
}

function summarize(results: readonly ApprovalResult[]) {
  return {
    approved: results.filter((item) => item.status === "approved").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length
  };
}

async function loadFilteredRows(
  principal: Awaited<ReturnType<typeof requireAdminSession>>,
  input: Readonly<{ query?: string; status?: string; cursor?: string; limit: number }>
): Promise<CandidateRow[]> {
  if (!postgresAdminRuntimeEnabled()) {
    const workspace = await adminMatchingWorkspace(principal, { q: input.query, status: input.status });
    return workspace.submissions
      .filter((item) => ["submitted", "needs_review", "linked"].includes(item.status))
      .filter((item) => !input.cursor || item.id > input.cursor)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, input.limit)
      .map((item) => {
        const actionable = item.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status));
        return {
          id: item.id,
          status: item.status,
          canonicalVariantId: item.canonicalVariantId,
          actionableCandidateId: actionable.length === 1 ? actionable[0]?.id : undefined,
          actionableCandidateCount: actionable.length
        };
      });
  }

  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT
       s.public_id,
       s.status::text AS status,
       cv.public_id AS canonical_public_id,
       COUNT(pmc.id) FILTER (WHERE pmc.status IN ('pending','auto_linked'))::int AS actionable_count,
       MIN(pmc.public_id) FILTER (WHERE pmc.status IN ('pending','auto_linked')) AS actionable_candidate_id
     FROM vendor_product_submissions s
     JOIN vendor_businesses v ON v.id=s.vendor_id
     JOIN categories c ON c.id=s.category_id
     LEFT JOIN canonical_variants cv ON cv.id=s.canonical_variant_id
     LEFT JOIN product_merge_candidates pmc ON pmc.submission_id=s.id
     WHERE s.market_id=(SELECT id FROM markets WHERE code='sparta')
       AND s.status IN ('submitted','needs_review','linked')
       AND ($1::text IS NULL OR s.status::text=$1)
       AND ($2::text IS NULL OR
         s.public_id ILIKE '%'||$2||'%'
         OR v.public_id ILIKE '%'||$2||'%'
         OR c.code ILIKE '%'||$2||'%'
         OR COALESCE(s.source_identity->>'title','') ILIKE '%'||$2||'%'
         OR COALESCE(cv.public_id,'') ILIKE '%'||$2||'%'
         OR EXISTS (
           SELECT 1
           FROM product_merge_candidates pmc_q
           LEFT JOIN canonical_variants cv_q ON cv_q.id=pmc_q.candidate_variant_id
           WHERE pmc_q.submission_id=s.id
             AND COALESCE(cv_q.public_id,'') ILIKE '%'||$2||'%'
         )
       )
       AND ($3::text IS NULL OR s.public_id>$3)
     GROUP BY s.id,s.public_id,s.status,cv.public_id
     ORDER BY s.public_id ASC
     LIMIT $4`,
    [input.status ?? null, input.query ?? null, input.cursor ?? null, input.limit]
  );

  return result.rows.map((row) => ({
    id: String(row.public_id),
    status: String(row.status),
    canonicalVariantId: row.canonical_public_id ? String(row.canonical_public_id) : undefined,
    actionableCandidateId: row.actionable_candidate_id ? String(row.actionable_candidate_id) : undefined,
    actionableCandidateCount: Number(row.actionable_count ?? 0)
  }));
}

async function loadRows(
  principal: Awaited<ReturnType<typeof requireAdminSession>>,
  ids: readonly string[]
): Promise<CandidateRow[]> {
  if (!postgresAdminRuntimeEnabled()) {
    const workspace = await adminMatchingWorkspace(principal);
    return workspace.submissions.filter((item) => ids.includes(item.id)).map((item) => {
      const actionable = item.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status));
      return {
        id: item.id,
        status: item.status,
        canonicalVariantId: item.canonicalVariantId,
        actionableCandidateId: actionable.length === 1 ? actionable[0]?.id : undefined,
        actionableCandidateCount: actionable.length
      };
    });
  }

  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT
       s.public_id,
       s.status::text AS status,
       cv.public_id AS canonical_public_id,
       COUNT(pmc.id) FILTER (WHERE pmc.status IN ('pending','auto_linked'))::int AS actionable_count,
       MIN(pmc.public_id) FILTER (WHERE pmc.status IN ('pending','auto_linked')) AS actionable_candidate_id
     FROM vendor_product_submissions s
     LEFT JOIN canonical_variants cv ON cv.id=s.canonical_variant_id
     LEFT JOIN product_merge_candidates pmc ON pmc.submission_id=s.id
     WHERE s.public_id=ANY($1::text[])
     GROUP BY s.id,s.public_id,s.status,cv.public_id`,
    [ids]
  );

  return result.rows.map((row) => ({
    id: String(row.public_id),
    status: String(row.status),
    canonicalVariantId: row.canonical_public_id ? String(row.canonical_public_id) : undefined,
    actionableCandidateId: row.actionable_candidate_id ? String(row.actionable_candidate_id) : undefined,
    actionableCandidateCount: Number(row.actionable_count ?? 0)
  }));
}
