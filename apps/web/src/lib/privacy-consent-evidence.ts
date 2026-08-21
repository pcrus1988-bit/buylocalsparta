import { randomUUID } from "node:crypto";
import {
  PRIVACY_CONSENT_EVIDENCE_RETENTION_SECONDS,
  PRIVACY_CONSENT_MAX_AGE_SECONDS,
  PRIVACY_CONSENT_VERSION,
  PRIVACY_POLICY_VERSION
} from "./privacy-consent";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type ConsentDecisionSource = "banner" | "settings";
export type ConsentDecisionAction = "accept_all" | "reject_optional" | "custom";

export async function persistPrivacyConsentReceipt(input: {
  receiptId: string;
  previousReceiptId?: string;
  source: ConsentDecisionSource;
  action: ConsentDecisionAction;
  personalisation: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: number;
}): Promise<{ expiresAt: number; retentionUntil: number }> {
  const expiresAt = input.decidedAt + PRIVACY_CONSENT_MAX_AGE_SECONDS * 1000;
  const retentionUntil = input.decidedAt + PRIVACY_CONSENT_EVIDENCE_RETENTION_SECONDS * 1000;
  if (!productionDatabaseConfigured()) return { expiresAt, retentionUntil };

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM privacy_consent_receipts WHERE retention_until <= $1", [new Date(input.decidedAt)]);
    if (input.previousReceiptId) {
      await client.query(
        "UPDATE privacy_consent_receipts SET superseded_at=COALESCE(superseded_at,$2) WHERE public_id=$1 AND superseded_at IS NULL",
        [input.previousReceiptId, new Date(input.decidedAt)]
      );
    }
    await client.query(`
      INSERT INTO privacy_consent_receipts(
        id,public_id,previous_public_id,consent_version,policy_version,source,action,
        personalisation,analytics,marketing,decided_at,expires_at,retention_until,created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11)
    `, [
      randomUUID(), input.receiptId, input.previousReceiptId ?? null,
      PRIVACY_CONSENT_VERSION, PRIVACY_POLICY_VERSION, input.source, input.action,
      input.personalisation, input.analytics, input.marketing,
      new Date(input.decidedAt), new Date(expiresAt), new Date(retentionUntil)
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return { expiresAt, retentionUntil };
}
