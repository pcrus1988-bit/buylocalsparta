import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";
import { HubResearchRewardError, halfSetupFee, rewardHash } from "./research-reward-code.ts";

const RESEARCH_STUDY_SLUG = "greek-retail-2026";
const REWARD_KIND = "thank_you_code";

export type HubRewardQuote = Readonly<{
  entitlementId: string;
  studyId: string;
  originalFeeCents: number;
  discountCents: number;
  payableFeeCents: number;
  discountPercent: 50;
}>;


async function readEligibleReward(tx: SqlExecutor, code: string, lock: boolean): Promise<{ entitlementId: string; studyId: string }> {
  const result = await tx.query<SqlRow>(`
    SELECT re.id::text AS entitlement_id, rs.id::text AS study_id
    FROM research_reward_entitlements re
    JOIN research_responses rr ON rr.id = re.response_id
    JOIN research_studies rs ON rs.id = rr.study_id
    WHERE re.code_hash = $1
      AND re.reward_kind = $2
      AND re.status = 'issued'
      AND rr.status = 'completed'
      AND rs.slug = $3
      AND (re.expires_at IS NULL OR re.expires_at > now())
    LIMIT 1
    ${lock ? "FOR UPDATE OF re" : ""}
  `, [rewardHash(code), REWARD_KIND, RESEARCH_STUDY_SLUG]);
  const row = result.rows[0];
  if (!row) throw new HubResearchRewardError("reward_unavailable", "Ο κωδικός έχει λήξει, έχει χρησιμοποιηθεί ή δεν είναι έγκυρος.");
  return { entitlementId: String(row.entitlement_id), studyId: String(row.study_id) };
}

function quote(entitlementId: string, studyId: string, originalFeeCents: number): HubRewardQuote {
  const discountCents = halfSetupFee(originalFeeCents);
  return {
    entitlementId, studyId, originalFeeCents, discountCents,
    payableFeeCents: originalFeeCents - discountCents, discountPercent: 50
  };
}

export async function previewHubResearchReward(tx: SqlExecutor, code: string, originalFeeCents: number): Promise<HubRewardQuote> {
  const reward = await readEligibleReward(tx, code, false);
  return quote(reward.entitlementId, reward.studyId, originalFeeCents);
}

export async function lockHubResearchRewardForApplication(
  tx: SqlExecutor, code: string, originalFeeCents: number
): Promise<HubRewardQuote> {
  const reward = await readEligibleReward(tx, code, true);
  return quote(reward.entitlementId, reward.studyId, originalFeeCents);
}

export async function finalizeHubResearchReward(
  tx: SqlExecutor,
  reward: HubRewardQuote,
  prospectId: string
): Promise<void> {
  const redeemed = await tx.query(`
    UPDATE research_reward_entitlements
    SET status='redeemed',redeemed_at=now(),
        metadata=metadata || jsonb_build_object('redemption','business_onboarding_50','prospectId',$2::text)
    WHERE id=$1 AND status='issued'
  `, [reward.entitlementId, prospectId]);
  if (redeemed.rowCount !== 1) throw new HubResearchRewardError("reward_unavailable", "Ο κωδικός χρησιμοποιήθηκε ήδη.");
  await tx.query(`
    INSERT INTO research_reward_redemptions (
      entitlement_id,prospect_id,study_id,discount_kind,
      setup_fee_original_cents,setup_discount_cents,setup_fee_payable_cents
    ) VALUES ($1,$2,$3,'business_onboarding_50',$4,$5,$6)
  `, [
    reward.entitlementId, prospectId, reward.studyId,
    reward.originalFeeCents, reward.discountCents, reward.payableFeeCents
  ]);
}
