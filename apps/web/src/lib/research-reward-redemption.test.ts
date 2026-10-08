import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "@buy-local-sparta/core";
import {
  finalizeHubResearchReward, halfSetupFee,
  HubResearchRewardError, lockHubResearchRewardForApplication,
  normalizedResearchCode, previewHubResearchReward, rewardHash
} from "./research-reward-redemption.ts";

const example = "KM26-ABCD-1234-FFFF";
const makeTx = (queries: string[], rowCount = 1): SqlExecutor => ({
  query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("SELECT re.id::text")) {
      return { rowCount: 1, rows: [{ entitlement_id: "entitlement-1", study_id: "study-1" }] };
    }
    return { rowCount, rows: [] };
  }
}) as unknown as SqlExecutor;

test("research voucher syntax rejects garbage and normalizes case", () => {
  assert.equal(normalizedResearchCode("  km26-abcd-1234-ffff "), example);
  assert.equal(normalizedResearchCode(undefined), undefined);
  assert.throws(() => normalizedResearchCode("WELCOME50"), HubResearchRewardError);
  assert.equal(rewardHash(example).length, 64);
});

test("all HUB paid plans receive only 50% off their one-time setup fee", () => {
  for (const [original, expected] of [[4900,2450],[14900,7450],[29900,14950],[49900,24950]]) {
    assert.equal(halfSetupFee(original), expected);
  }
  assert.throws(() => halfSetupFee(0), /εφάπαξ/);
});

test("mere reward preview does not update entitlement or create redemption", async () => {
  const statements: string[] = [];
  const offer = await previewHubResearchReward(makeTx(statements), example, 14900);
  assert.equal(offer.payableFeeCents, 7450);
  assert.equal(statements.length, 1);
  assert.ok(!statements[0].includes("FOR UPDATE"));
});

test("application locks reward before consuming; one ledger row on finalization", async () => {
  const statements: string[] = [];
  const tx = makeTx(statements);
  const offer = await lockHubResearchRewardForApplication(tx, example, 14900);
  assert.ok(statements[0].includes("FOR UPDATE OF re"));
  assert.equal(statements.length, 1, "code entry must never redeem");
  await finalizeHubResearchReward(tx, offer, "prospect-1");
  assert.ok(statements[1].includes("UPDATE research_reward_entitlements"));
  assert.ok(statements[2].includes("INSERT INTO research_reward_redemptions"));
  assert.equal(statements.length, 3);
});

test("already consumed reward cannot be marked redeemed again", async () => {
  const offer = await previewHubResearchReward(makeTx([]), example, 4900);
  await assert.rejects(
    () => finalizeHubResearchReward(makeTx([], 0), offer, "prospect-2"),
    /χρησιμοποιήθηκε/
  );
});
