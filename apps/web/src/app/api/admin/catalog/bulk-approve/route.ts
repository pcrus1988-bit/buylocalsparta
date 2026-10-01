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

type CandidateRow = {
  id: string;
  status: string;
  canonicalVariantId?: string;
  actionableCandidateId?: string;
  actionableCandidateCount: number;
};

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as { submissionIds?: unknown; reason?: unknown };
    const ids = Array.isArray(body.submissionIds)
      ? [...new Set(body.submissionIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))]
      : [];
    if (!ids.length) throw new Error("Select at least one submission.");
    if (ids.length > 100) throw new Error("Bulk approval is limited to 100 submissions per action.");
    const reason = typeof body.reason === "string" && body.reason.trim().length >= 3
      ? body.reason.trim().slice(0, 1000)
      : "Bulk approval by Admin";

    const rows = await loadRows(principal, ids);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const results: Array<{ id: string; status: "approved" | "skipped" | "failed"; detail?: string }> = [];

    for (const id of ids) {
      const row = rowById.get(id);
      if (!row) {
        results.push({ id, status: "skipped", detail: "Submission not found." });
        continue;
      }
      try {
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

    const approved = results.filter((item) => item.status === "approved").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const failed = results.filter((item) => item.status === "failed").length;
    return Response.json({
      approved,
      skipped,
      failed,
      details: results.filter((item) => item.status !== "approved").slice(0, 30)
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_bulk_approve_failed" }, { status: 400 });
  }
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
