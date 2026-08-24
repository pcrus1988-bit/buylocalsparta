import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SqlPool, type SqlRow } from "@buy-local-sparta/core";

type CandidateRow = SqlRow & {
  cart_id: string;
  user_id: string;
  cart_updated_at: Date | string;
  item_count: number | string;
  available_item_count: number | string;
};

export type CartRecoveryRunResult = Readonly<{
  scanned: number;
  queued: number;
}>;

export class PostgresCartRecoveryService {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  }

  async runOnce(input: { now?: number; limit?: number; idleMinutes?: number; cooldownHours?: number } = {}): Promise<CartRecoveryRunResult> {
    const now = input.now ?? Date.now();
    const limit = boundedInteger(input.limit ?? 25, 1, 100, "limit");
    const idleMinutes = boundedInteger(input.idleMinutes ?? 180, 30, 10080, "idleMinutes");
    const cooldownHours = boundedInteger(input.cooldownHours ?? 72, 1, 720, "cooldownHours");
    const idleCutoff = new Date(now - idleMinutes * 60_000);
    const cooldownCutoff = new Date(now - cooldownHours * 3_600_000);
    const nowDate = new Date(now);

    return this.#uow.withTransaction({ platformAccess: true, requestId: `cart-recovery:${randomUUID()}` }, async (tx) => {
      const candidates = await tx.query<CandidateRow>(`
        WITH candidate_carts AS (
          SELECT c.id, c.user_id, c.updated_at
            FROM carts c
           WHERE c.user_id IS NOT NULL
             AND c.updated_at <= $1
             AND (c.expires_at IS NULL OR c.expires_at > $3)
             AND EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cart_id=c.id)
             AND COALESCE(
               (SELECT np.enabled FROM notification_preferences np
                 WHERE np.user_id=c.user_id AND np.channel='email' AND np.event_type='cart_recovery'
                 ORDER BY np.updated_at DESC LIMIT 1),
               (SELECT np.enabled FROM notification_preferences np
                 WHERE np.user_id=c.user_id AND np.channel='email' AND np.event_type='*'
                 ORDER BY np.updated_at DESC LIMIT 1),
               false
             ) = true
             AND NOT EXISTS (
               SELECT 1 FROM cart_recovery_attempts cra
                WHERE cra.cart_id=c.id AND cra.cart_updated_at=c.updated_at
             )
             AND NOT EXISTS (
               SELECT 1 FROM cart_recovery_attempts cra
                WHERE cra.user_id=c.user_id AND cra.created_at > $2
             )
             AND NOT EXISTS (
               SELECT 1 FROM customer_orders o
                WHERE o.user_id=c.user_id AND o.created_at >= c.updated_at
             )
           ORDER BY c.updated_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $4
        )
        SELECT c.id::text AS cart_id,
               c.user_id::text AS user_id,
               c.updated_at AS cart_updated_at,
               count(*)::integer AS item_count,
               count(*) FILTER (WHERE
                 cv.active=true AND cv.suppressed=false AND cv.recalled=false
                 AND EXISTS (
                   SELECT 1
                     FROM vendor_offers vo
                     JOIN vendor_businesses vb ON vb.id=vo.vendor_id AND vb.status='active'
                     JOIN vendor_locations vl ON vl.id=vo.location_id AND vl.active=true
                     JOIN inventory_balances ib ON ib.offer_id=vo.id
                    WHERE vo.canonical_variant_id=ci.canonical_variant_id
                      AND vo.status='approved'
                      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= ci.quantity
                      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
                 )
               )::integer AS available_item_count
          FROM candidate_carts c
          JOIN cart_items ci ON ci.cart_id=c.id
          JOIN canonical_variants cv ON cv.id=ci.canonical_variant_id
         GROUP BY c.id,c.user_id,c.updated_at
        HAVING count(*) FILTER (WHERE
                 cv.active=true AND cv.suppressed=false AND cv.recalled=false
                 AND EXISTS (
                   SELECT 1
                     FROM vendor_offers vo
                     JOIN vendor_businesses vb ON vb.id=vo.vendor_id AND vb.status='active'
                     JOIN vendor_locations vl ON vl.id=vo.location_id AND vl.active=true
                     JOIN inventory_balances ib ON ib.offer_id=vo.id
                    WHERE vo.canonical_variant_id=ci.canonical_variant_id
                      AND vo.status='approved'
                      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= ci.quantity
                      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
                 )
               ) > 0
         ORDER BY c.updated_at ASC
      `, [idleCutoff, cooldownCutoff, nowDate, limit]);

      let queued = 0;
      for (const row of candidates.rows) {
        const cartId = requiredText(row.cart_id, "cart_id");
        const userId = requiredText(row.user_id, "user_id");
        const cartUpdatedAt = toDate(row.cart_updated_at, "cart_updated_at");
        const itemCount = positiveNumber(row.item_count, "item_count");
        const availableItemCount = positiveNumber(row.available_item_count, "available_item_count");
        const notificationUuid = randomUUID();
        const notificationPublicId = `notification_${randomUUID().replaceAll("-", "")}`;
        const attemptId = randomUUID();
        const dedupeKey = `cart-recovery:${cartId}:${cartUpdatedAt.toISOString()}`;

        const attempt = await tx.query<SqlRow>(`
          INSERT INTO cart_recovery_attempts(
            id,cart_id,user_id,cart_updated_at,notification_id,item_count,available_item_count,idle_minutes,cooldown_hours,created_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (cart_id,cart_updated_at) DO NOTHING
          RETURNING id::text AS id
        `, [attemptId, cartId, userId, cartUpdatedAt, notificationUuid, itemCount, availableItemCount, idleMinutes, cooldownHours, nowDate]);
        if (!attempt.rowCount) continue;

        await tx.query(`
          INSERT INTO notifications(
            id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,
            title,body,payload,status,dedupe_key,next_attempt_at,created_at
          ) VALUES(
            $1,$2,$3,NULL,'email','marketing','cart_recovery','cart-recovery-v1','el',
            $4,$5,$6,'queued',$7,$8,$8
          )
        `, [
          notificationUuid,
          notificationPublicId,
          userId,
          "Το τοπικό σου καλάθι σε περιμένει",
          availableItemCount === itemCount
            ? `Τα ${itemCount} προϊόντα του καλαθιού σου παραμένουν διαθέσιμα τοπικά. Μπορείς να συνεχίσεις όποτε θέλεις.`
            : `${availableItemCount} από τα ${itemCount} προϊόντα του καλαθιού σου παραμένουν διαθέσιμα τοπικά. Έλεγξε το καλάθι σου πριν αλλάξει η διαθεσιμότητα.`,
          { contextType: "cart", contextReference: cartId, itemCount: String(itemCount), availableItemCount: String(availableItemCount) },
          dedupeKey,
          nowDate
        ]);
        queued += 1;
      }

      return { scanned: candidates.rowCount, queued };
    });
  }
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label} from PostgreSQL`);
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label} from PostgreSQL`);
  return parsed;
}

function toDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label} from PostgreSQL`);
  return date;
}
