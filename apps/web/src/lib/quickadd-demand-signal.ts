import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { quickAddActorHash, quickAddLookupFingerprint } from "./quickadd-demand-fingerprint";

const DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 180;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function recordQuickAddDemandSignal(
  principal: SessionPrincipal,
  input: Readonly<{
    source: "daily" | "admin";
    vendorId?: string;
    gtin?: string;
    q?: string;
    matched: boolean;
    canonicalVariantId?: string;
    categoryCode?: string;
  }>
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  const lookup = quickAddLookupFingerprint(input);
  const shopActor = clean(principal.vendorId) || clean(input.vendorId);
  if (!lookup || !shopActor) return;

  const actorHash = quickAddActorHash(shopActor);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const eventName = input.matched ? "quickadd.lookup_resolved" : "quickadd.lookup_missed";
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 3_000 });

  try {
    await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const refs = await tx.query<SqlRow>(`
        SELECT m.id::text AS market_uuid,
               vb.id::text AS vendor_uuid,
               cv.id::text AS canonical_uuid
        FROM public.markets m
        LEFT JOIN public.vendor_businesses vb ON vb.market_id=m.id AND (vb.public_id=$1 OR vb.id::text=$1)
        LEFT JOIN public.canonical_variants cv ON cv.market_id=m.id AND cv.public_id=$2
        WHERE m.code='sparta'
        LIMIT 1
      `, [shopActor, clean(input.canonicalVariantId) || null]);
      if (!refs.rowCount || !refs.rows[0].vendor_uuid) return;
      const ref = refs.rows[0];
      const dedupeKey = `quickadd-demand:${eventName}:${actorHash}:${lookup.fingerprint}:${day}`;
      await tx.query(`
        INSERT INTO public.analytics_events(
          id,public_id,market_id,event_name,occurred_at,visitor_hash,customer_id,vendor_id,canonical_variant_id,
          order_id,search_event_public_id,value_minor,quantity,metadata,dedupe_key,retention_until
        ) VALUES(
          $1,$2,$3::uuid,$4,$5,$6,NULL,$7::uuid,$8::uuid,NULL,NULL,NULL,NULL,$9::jsonb,$10,$11
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `, [
        randomUUID(),
        `an_${randomUUID().replaceAll("-", "")}`,
        String(ref.market_uuid),
        eventName,
        now,
        actorHash,
        String(ref.vendor_uuid),
        ref.canonical_uuid ? String(ref.canonical_uuid) : null,
        JSON.stringify({
          source: input.source,
          lookupFingerprint: lookup.fingerprint,
          lookupKind: lookup.kind,
          categoryCode: clean(input.categoryCode) || undefined
        }),
        dedupeKey,
        new Date(now.getTime() + RETENTION_DAYS * DAY)
      ]);
    });
  } catch (error) {
    console.warn("quickadd_demand_signal_failed", error instanceof Error ? error.message : String(error));
  }
}
