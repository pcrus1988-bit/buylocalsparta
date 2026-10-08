import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
export { HubResearchRewardError, normalizedResearchCode, halfSetupFee, rewardHash } from "./research-reward-code";
export { previewHubResearchReward, lockHubResearchRewardForApplication, finalizeHubResearchReward } from "./research-reward-redemption-operations";
export type { HubRewardQuote } from "./research-reward-redemption-operations";

const globals = globalThis as typeof globalThis & {
  __hubRewardCheckLimiter?: PostgresFixedWindowRateLimiter;
};

export async function consumeHubRewardLookupRateLimit(visitorKey: string, now: number) {
  const limiter = globals.__hubRewardCheckLimiter ??= new PostgresFixedWindowRateLimiter(getProductionPostgresRuntime().sqlPool);
  return limiter.consume({ route: "research-onboarding-reward-check", key: visitorKey, limit: 10, windowMs: 60 * 60 * 1000, now });
}
