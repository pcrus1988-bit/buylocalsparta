import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getAdminPostgresRuntime } from "./postgres-runtime";
import { hasAdminPermission } from "./admin-runtime";

export type MunicipalityReviewInput = Readonly<{
  municipalityId: string;
  sourceId: string;
  decision: string;
  reason: string;
  attestation: string;
}>;

export function validateMunicipalityReviewInput(input: MunicipalityReviewInput) {
  const municipalityId = input.municipalityId.trim();
  const sourceId = input.sourceId.trim();
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!/^[1-9][0-9]{3,5}$/.test(municipalityId)) throw new Error("INVALID_MUNICIPALITY_ID");
  if (!/^GR[0-9]{4}M[0-9]{3}$/.test(sourceId)) throw new Error("INVALID_GAZETTEER_ID");
  if (input.decision !== "reviewed" && input.decision !== "rejected") {
    throw new Error("INVALID_REVIEW_DECISION");
  }
  if (reason.length < 20 || reason.length > 600) throw new Error("REVIEW_REASON_REQUIRED");
  if (input.attestation !== "municipality_only") throw new Error("MUNICIPALITY_SCOPE_ACK_REQUIRED");
  return { municipalityId, sourceId, reason, decision: input.decision };
}

/** Human check of administrative NAME correspondence only, never a public listing approval. */
export async function reviewGemiMunicipalityCorrespondence(
  principal: SessionPrincipal, submitted: MunicipalityReviewInput
): Promise<void> {
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) {
    throw new Error("ADMIN_PERMISSION_REQUIRED");
  }
  const { municipalityId, sourceId, reason, decision } = validateMunicipalityReviewInput(submitted);
  const client = await getAdminPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    // Optimistic one-way decision. Source ID is checked to prevent acting on a
    // replacement suggestion after a stale admin page has been opened.
    const result = await client.query<{ registry_municipality_id: string }>(
      "UPDATE research_private.hub_gemi_municipality_matches SET " +
      "review_status=$2,checked_at=now() " +
      "WHERE registry_municipality_id=$1 AND gazetteer_source_id=$3 " +
      "AND review_status='proposed' RETURNING registry_municipality_id",
      [municipalityId, decision, sourceId]
    );
    if (result.rows.length !== 1) throw new Error("MUNICIPALITY_REVIEW_STALE");
    await client.query(
      "INSERT INTO research_private.hub_gemi_municipality_review_events " +
      "(registry_municipality_id,gazetteer_source_id,actor_user_id,previous_status,decision,reason) " +
      "VALUES ($1,$2,$3,'proposed',$4,$5)",
      [municipalityId, sourceId, principal.userId, decision, reason]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
