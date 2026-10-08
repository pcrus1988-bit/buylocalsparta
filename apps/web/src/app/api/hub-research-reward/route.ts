import { PostgresUnitOfWork } from "@buy-local-sparta/core";
import { getHubExpansionPlan } from "../../../lib/hub-expansion-plans";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../lib/postgres-runtime";
import {
  consumeHubRewardLookupRateLimit,
  HubResearchRewardError, normalizedResearchCode, previewHubResearchReward
} from "../../../lib/research-reward-redemption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json({ error: "Η επαλήθευση δεν είναι προσωρινά διαθέσιμη." }, { status: 503, headers: noStore });
  }
  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ error: "Ανανέωσε τη σελίδα πριν από τον έλεγχο." }, { status: 400, headers: noStore });
  }
  try {
    const limit = await consumeHubRewardLookupRateLimit(visitorKey, Date.now());
    if (!limit.allowed) {
      return Response.json({ error: "Πολλές προσπάθειες. Δοκίμασε ξανά αργότερα." }, { status: 429, headers: noStore });
    }
    const body = await request.json() as Record<string, unknown>;
    const code = normalizedResearchCode(body.code);
    const plan = getHubExpansionPlan(typeof body.planCode === "string" ? body.planCode : undefined);
    if (!code) throw new HubResearchRewardError("reward_invalid", "Συμπλήρωσε τον κωδικό.");
    if (!plan) throw new HubResearchRewardError("plan_invalid", "Επίλεξε πρόγραμμα.");
    const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
    const quote = await uow.withTransaction(
      { platformAccess: true, marketId: "sparta", requestId: "public-hub-reward-quote" },
      (tx) => previewHubResearchReward(tx, code, plan.setupFeeCents)
    );
    // Never expose entitlement, response or study identifiers to a public caller.
    return Response.json({
      valid: true, discountPercent: 50, planCode: plan.code,
      originalFeeCents: quote.originalFeeCents,
      discountCents: quote.discountCents,
      setupFeeCents: quote.payableFeeCents
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof HubResearchRewardError) {
      return Response.json({ valid: false, code: error.code, error: error.message }, { status: error.status, headers: noStore });
    }
    console.error(JSON.stringify({ event: "hub_reward.preview_failed", error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ valid: false, error: "Η επαλήθευση δεν ήταν δυνατή. Δοκίμασε ξανά." }, { status: 503, headers: noStore });
  }
}
