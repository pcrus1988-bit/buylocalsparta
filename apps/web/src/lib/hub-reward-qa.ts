import { randomBytes, randomUUID } from "node:crypto";
import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";
import { HubResearchRewardError, halfSetupFee, rewardHash } from "./research-reward-code";

const QA_EXPIRY_HOURS = 48;

export function isQaHubRewardCode(code: string): boolean {
  return code.startsWith("QA26-");
}

function assertQaFormat(code: string): void {
  if (!/^QA26-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code)) {
    throw new HubResearchRewardError("reward_invalid", "Ο κωδικός δεν είναι έγκυρος.");
  }
}

export async function previewQaHubReward(tx: SqlExecutor, code: string, originalFeeCents: number) {
  assertQaFormat(code);
  const discountCents = halfSetupFee(originalFeeCents);
  const result = await tx.query<SqlRow>(
    "SELECT id FROM hub_reward_qa_codes WHERE code_hash=$1 AND status='issued' AND expires_at > now() LIMIT 1",
    [rewardHash(code)]
  );
  if (!result.rowCount) throw new HubResearchRewardError("reward_unavailable", "Ο δοκιμαστικός κωδικός έχει λήξει ή χρησιμοποιηθεί.");
  return { originalFeeCents, discountCents, payableFeeCents: originalFeeCents - discountCents };
}

export async function redeemQaHubReward(tx: SqlExecutor, code: string, originalFeeCents: number) {
  assertQaFormat(code);
  const discountCents = halfSetupFee(originalFeeCents);
  // PostgreSQL row lock makes two simultaneous submissions unable to redeem one code twice.
  const row = await tx.query<SqlRow>(
    "SELECT id FROM hub_reward_qa_codes WHERE code_hash=$1 AND status='issued' AND expires_at > now() FOR UPDATE",
    [rewardHash(code)]
  );
  if (!row.rowCount) throw new HubResearchRewardError("reward_unavailable", "Ο δοκιμαστικός κωδικός έχει λήξει ή χρησιμοποιηθεί.");
  const qaReference = "QA-HUB-" + randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const updated = await tx.query(
    "UPDATE hub_reward_qa_codes SET status='redeemed', redeemed_at=now(), qa_reference=$2, setup_fee_original_cents=$3, setup_discount_cents=$4, setup_fee_payable_cents=$5 WHERE id=$1 AND status='issued'",
    [row.rows[0]!.id, qaReference, originalFeeCents, discountCents, originalFeeCents - discountCents]
  );
  if (updated.rowCount !== 1) throw new HubResearchRewardError("reward_unavailable", "Ο κωδικός χρησιμοποιήθηκε ήδη.");
  return { qaReference, originalFeeCents, discountCents, payableFeeCents: originalFeeCents - discountCents };
}

export async function issueQaHubReward(tx: SqlExecutor, actorId: string) {
  const volume = await tx.query<SqlRow>(
    "SELECT count(*)::integer AS issued FROM hub_reward_qa_codes WHERE created_by=$1 AND created_at > now() - interval '24 hours'",
    [actorId]
  );
  if (Number(volume.rows[0]?.issued ?? 0) >= 20) {
    throw new HubResearchRewardError("qa_generation_limit", "Έχει συμπληρωθεί το όριο 20 δοκιμαστικών κωδικών ανά 24ωρο.", 429);
  }
  for (let i = 0; i < 3; i++) {
    const raw = randomBytes(6).toString("hex").toUpperCase();
    const code = "QA26-" + raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 12);
    const inserted = await tx.query<SqlRow>(
      "INSERT INTO hub_reward_qa_codes(code_hash, created_by, expires_at) VALUES($1,$2,now() + interval '48 hours') ON CONFLICT (code_hash) DO NOTHING RETURNING id::text AS id, expires_at",
      [rewardHash(code), actorId]
    );
    if (inserted.rowCount) return { id: String(inserted.rows[0]!.id), code, expiresAt: String(inserted.rows[0]!.expires_at), expiryHours: QA_EXPIRY_HOURS };
  }
  throw new Error("QA_CODE_GENERATION_FAILED");
}

export async function listQaHubRewards(tx: SqlExecutor) {
  const result = await tx.query<SqlRow>(
    "SELECT id::text AS id, status, created_at, expires_at, redeemed_at, qa_reference, setup_fee_original_cents, setup_fee_payable_cents FROM hub_reward_qa_codes ORDER BY created_at DESC LIMIT 25"
  );
  return result.rows;
}

export async function revokeQaHubReward(tx: SqlExecutor, id: string) {
  const result = await tx.query(
    "UPDATE hub_reward_qa_codes SET status='revoked' WHERE id=$1::uuid AND status='issued'",
    [id]
  );
  return result.rowCount === 1;
}
