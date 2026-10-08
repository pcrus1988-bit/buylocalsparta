import { createHash } from "node:crypto";

export class HubResearchRewardError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "HubResearchRewardError";
  }
}

/** Identical format to the existing survey worker HMAC-issued KM26 code. */
export function normalizedResearchCode(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new HubResearchRewardError("reward_invalid", "Ο κωδικός δεν είναι έγκυρος.");
  const code = value.trim().toUpperCase();
  if (!/^(KM26|QA26)-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code)) {
    throw new HubResearchRewardError("reward_invalid", "Ο κωδικός δεν είναι έγκυρος.");
  }
  return code;
}

export function rewardHash(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function halfSetupFee(originalFeeCents: number): number {
  if (!Number.isSafeInteger(originalFeeCents) || originalFeeCents <= 0 || originalFeeCents % 2 !== 0) {
    throw new HubResearchRewardError("reward_not_applicable", "Ο κωδικός ισχύει μόνο για πλάνο με εφάπαξ κόστος ένταξης.");
  }
  return originalFeeCents / 2;
}
