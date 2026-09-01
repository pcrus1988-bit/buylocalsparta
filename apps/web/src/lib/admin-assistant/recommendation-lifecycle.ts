import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { postgresAdminRuntimeEnabled } from "../admin-runtime";
import { getProductionPostgresRuntime } from "../postgres-runtime";
import type { AdminAssistantFinding, AdminAssistantRecommendation, AdminAssistantRecommendationState, AdminAssistantSnapshot } from "./types";

type StoredState = Readonly<{
  recommendationKey: string;
  fingerprint: string;
  state: AdminAssistantRecommendationState;
  snoozedUntil?: number;
  stateUpdatedAt: number;
}>;

type MemoryState = StoredState & Readonly<{ adminUserId: string }>;
const memoryKey = "__kontamouAdminAssistantRecommendationStates" as const;
type Globals = typeof globalThis & { [memoryKey]?: Map<string, MemoryState> };
const globals = globalThis as Globals;
function memory(): Map<string, MemoryState> { return globals[memoryKey] ?? (globals[memoryKey] = new Map()); }
function memoryId(adminUserId: string, recommendationKey: string): string { return `${adminUserId}:${recommendationKey}`; }

function findingForRecommendation(snapshot: AdminAssistantSnapshot, recommendation: AdminAssistantRecommendation): AdminAssistantFinding | undefined {
  const findingId = recommendation.id.startsWith("rec:") ? recommendation.id.slice(4) : recommendation.id;
  return snapshot.findings.find((finding) => finding.id === findingId);
}

function entityIdentity(recommendation: AdminAssistantRecommendation): readonly Readonly<{ type: string; id: string }>[] {
  return recommendation.affectedEntities
    .map((entity) => ({ type: entity.type, id: entity.id }))
    .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}

export function recommendationEvidenceFingerprint(snapshot: AdminAssistantSnapshot, recommendation: AdminAssistantRecommendation): string {
  const finding = findingForRecommendation(snapshot, recommendation);
  const material = {
    recommendationKey: recommendation.id,
    title: recommendation.title,
    explanation: recommendation.explanation,
    evidenceIds: [...recommendation.evidenceIds].sort(),
    entities: entityIdentity(recommendation),
    finding: finding ? {
      ruleId: finding.ruleId,
      severity: finding.severity,
      detail: finding.detail,
      evidence: [...finding.evidence],
      affectedCount: finding.affectedCount,
      affectedEntities: (finding.affectedEntities ?? []).map((entity) => ({ type: entity.type, id: entity.id })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))
    } : undefined
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

function visible(state: StoredState, now: number): boolean {
  if (state.state === "dismissed" || state.state === "resolved" || state.state === "intentional") return false;
  if (state.state === "snoozed" && (state.snoozedUntil ?? Number.MAX_SAFE_INTEGER) > now) return false;
  return true;
}

function decorate(recommendation: AdminAssistantRecommendation, state: StoredState): AdminAssistantRecommendation {
  return {
    ...recommendation,
    lifecycleState: state.state === "snoozed" && state.snoozedUntil !== undefined && state.snoozedUntil <= Date.now() ? "active" : state.state,
    evidenceFingerprint: state.fingerprint,
    stateUpdatedAt: state.stateUpdatedAt,
    snoozedUntil: state.snoozedUntil
  };
}

function findingMeta(snapshot: AdminAssistantSnapshot, recommendation: AdminAssistantRecommendation) {
  const finding = findingForRecommendation(snapshot, recommendation);
  const entity = recommendation.affectedEntities[0] ?? finding?.affectedEntities?.[0];
  return { ruleId: finding?.ruleId, entityType: entity?.type ?? snapshot.context.entityType, entityId: entity?.id ?? snapshot.context.entityId };
}

async function syncMemory(principal: SessionPrincipal, snapshot: AdminAssistantSnapshot, now: number): Promise<AdminAssistantSnapshot> {
  const recommendations = snapshot.recommendations ?? [];
  const output: AdminAssistantRecommendation[] = [];
  for (const recommendation of recommendations) {
    const key = memoryId(principal.userId, recommendation.id);
    const fingerprint = recommendationEvidenceFingerprint(snapshot, recommendation);
    const prior = memory().get(key);
    let state: MemoryState;
    if (!prior || prior.fingerprint !== fingerprint) {
      state = { adminUserId: principal.userId, recommendationKey: recommendation.id, fingerprint, state: "active", stateUpdatedAt: now };
    } else if (prior.state === "snoozed" && prior.snoozedUntil !== undefined && prior.snoozedUntil <= now) {
      state = { ...prior, state: "active", snoozedUntil: undefined, stateUpdatedAt: now };
    } else state = prior;
    memory().set(key, state);
    if (visible(state, now)) output.push(decorate(recommendation, state));
  }
  return { ...snapshot, recommendations: output };
}

function rowState(row: SqlRow): StoredState {
  return {
    recommendationKey: String(row.recommendation_key ?? ""),
    fingerprint: String(row.evidence_fingerprint ?? ""),
    state: String(row.state ?? "active") as AdminAssistantRecommendationState,
    snoozedUntil: row.snoozed_until == null ? undefined : Number(row.snoozed_until),
    stateUpdatedAt: Number(row.state_updated_at ?? 0)
  };
}

export async function applyRecommendationLifecycle(
  principal: SessionPrincipal,
  snapshot: AdminAssistantSnapshot,
  now = Date.now()
): Promise<AdminAssistantSnapshot> {
  const recommendations = snapshot.recommendations ?? [];
  if (!recommendations.length) return snapshot;
  if (!postgresAdminRuntimeEnabled()) return syncMemory(principal, snapshot, now);

  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  const states = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const output = new Map<string, StoredState>();
    for (const recommendation of recommendations) {
      const fingerprint = recommendationEvidenceFingerprint(snapshot, recommendation);
      const meta = findingMeta(snapshot, recommendation);
      const existing = await tx.query<SqlRow>(`
        SELECT recommendation_key,evidence_fingerprint,state,snoozed_until,state_updated_at
        FROM admin_assistant_recommendation_states
        WHERE admin_user_id=$1 AND recommendation_key=$2
        FOR UPDATE
      `, [principal.userId, recommendation.id]);
      const prior = existing.rows[0] ? rowState(existing.rows[0]) : undefined;

      if (!prior) {
        await tx.query(`
          INSERT INTO admin_assistant_recommendation_states(
            id,admin_user_id,recommendation_key,rule_id,entity_type,entity_id,context_route,title,
            evidence_fingerprint,state,snoozed_until,state_reason,first_seen_at,last_seen_at,state_updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NULL,NULL,$10,$10,$10)
        `, [randomUUID(), principal.userId, recommendation.id, meta.ruleId ?? null, meta.entityType ?? null, meta.entityId ?? null, snapshot.context.route, recommendation.title, fingerprint, now]);
        output.set(recommendation.id, { recommendationKey: recommendation.id, fingerprint, state: "active", stateUpdatedAt: now });
        continue;
      }

      if (prior.fingerprint !== fingerprint) {
        await tx.query(`
          UPDATE admin_assistant_recommendation_states
          SET rule_id=$3,entity_type=$4,entity_id=$5,context_route=$6,title=$7,evidence_fingerprint=$8,
              state='active',snoozed_until=NULL,state_reason=NULL,last_seen_at=$9,state_updated_at=$9
          WHERE admin_user_id=$1 AND recommendation_key=$2
        `, [principal.userId, recommendation.id, meta.ruleId ?? null, meta.entityType ?? null, meta.entityId ?? null, snapshot.context.route, recommendation.title, fingerprint, now]);
        output.set(recommendation.id, { recommendationKey: recommendation.id, fingerprint, state: "active", stateUpdatedAt: now });
        continue;
      }

      const expiredSnooze = prior.state === "snoozed" && prior.snoozedUntil !== undefined && prior.snoozedUntil <= now;
      await tx.query(`
        UPDATE admin_assistant_recommendation_states
        SET rule_id=$3,entity_type=$4,entity_id=$5,context_route=$6,title=$7,last_seen_at=$8,
            state=CASE WHEN state='snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= $8 THEN 'active' ELSE state END,
            snoozed_until=CASE WHEN state='snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= $8 THEN NULL ELSE snoozed_until END,
            state_updated_at=CASE WHEN state='snoozed' AND snoozed_until IS NOT NULL AND snoozed_until <= $8 THEN $8 ELSE state_updated_at END
        WHERE admin_user_id=$1 AND recommendation_key=$2
      `, [principal.userId, recommendation.id, meta.ruleId ?? null, meta.entityType ?? null, meta.entityId ?? null, snapshot.context.route, recommendation.title, now]);
      output.set(recommendation.id, expiredSnooze ? { ...prior, state: "active", snoozedUntil: undefined, stateUpdatedAt: now } : prior);
    }
    return output;
  });

  const visibleRecommendations = recommendations.flatMap((recommendation) => {
    const state = states.get(recommendation.id);
    if (!state || !visible(state, now)) return [];
    return [decorate(recommendation, state)];
  });
  return { ...snapshot, recommendations: visibleRecommendations };
}

export async function setRecommendationLifecycleState(
  principal: SessionPrincipal,
  input: { recommendationKey: string; state: AdminAssistantRecommendationState; snoozedUntil?: number; reason?: string },
  now = Date.now()
): Promise<StoredState> {
  const recommendationKey = input.recommendationKey.trim().slice(0, 240);
  if (!recommendationKey) throw new Error("Recommendation key is required");
  const allowed = new Set<AdminAssistantRecommendationState>(["active", "accepted", "dismissed", "snoozed", "resolved", "intentional"]);
  if (!allowed.has(input.state)) throw new Error("Invalid recommendation state");
  const reason = input.reason?.trim().slice(0, 500) || undefined;
  let snoozedUntil: number | undefined;
  if (input.state === "snoozed") {
    snoozedUntil = Number(input.snoozedUntil);
    const max = now + 90 * 24 * 60 * 60 * 1_000;
    if (!Number.isSafeInteger(snoozedUntil) || snoozedUntil <= now || snoozedUntil > max) throw new Error("Snooze must end within the next 90 days");
  }

  if (!postgresAdminRuntimeEnabled()) {
    const key = memoryId(principal.userId, recommendationKey);
    const prior = memory().get(key);
    if (!prior) throw new Error("ASSISTANT_RECOMMENDATION_NOT_FOUND");
    const updated: MemoryState = { ...prior, state: input.state, snoozedUntil, stateUpdatedAt: now };
    memory().set(key, updated);
    return updated;
  }

  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      UPDATE admin_assistant_recommendation_states
      SET state=$3,snoozed_until=$4,state_reason=$5,state_updated_at=$6,last_seen_at=GREATEST(last_seen_at,$6)
      WHERE admin_user_id=$1 AND recommendation_key=$2
      RETURNING recommendation_key,evidence_fingerprint,state,snoozed_until,state_updated_at
    `, [principal.userId, recommendationKey, input.state, snoozedUntil ?? null, reason ?? null, now]);
    if (!result.rows[0]) throw new Error("ASSISTANT_RECOMMENDATION_NOT_FOUND");
    return rowState(result.rows[0]);
  });
}
