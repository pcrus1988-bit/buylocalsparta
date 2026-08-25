import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildLocalDemandIntelligence,
  LOCAL_DEMAND_MIN_ACTORS,
  LOCAL_DEMAND_SOURCE_COVERAGE,
  LOCAL_DEMAND_WINDOW_DAYS,
  type DemandOpportunity,
  type DemandSignalRow
} from "./local-demand-intelligence";

export type LocalDemandWorkspace = Readonly<{
  generatedAt: number;
  windowDays: number;
  minimumActors: number;
  sourceCoverage: typeof LOCAL_DEMAND_SOURCE_COVERAGE;
  opportunities: readonly DemandOpportunity[];
  metrics: Readonly<{
    qualifiedOpportunities: number;
    unmetVariants: number;
    strongSignals: number;
    activeSources: number;
  }>;
}>;

function demandScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, marketId: "sparta", platformAccess: true } as const;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function activeSourceCount() {
  return Object.values(LOCAL_DEMAND_SOURCE_COVERAGE).filter((state) => state === "active").length;
}

function demandMetrics(opportunities: readonly DemandOpportunity[]) {
  return {
    qualifiedOpportunities: opportunities.length,
    unmetVariants: opportunities.filter((item) => item.kind === "variant" && item.availableLocal === false).length,
    strongSignals: opportunities.filter((item) => item.confidence !== "qualified").length,
    activeSources: activeSourceCount()
  };
}

function emptyWorkspace(now: number): LocalDemandWorkspace {
  return {
    generatedAt: now,
    windowDays: LOCAL_DEMAND_WINDOW_DAYS,
    minimumActors: LOCAL_DEMAND_MIN_ACTORS,
    sourceCoverage: LOCAL_DEMAND_SOURCE_COVERAGE,
    opportunities: [],
    metrics: { qualifiedOpportunities: 0, unmetVariants: 0, strongSignals: 0, activeSources: activeSourceCount() }
  };
}

async function loadSignalRows(principal: SessionPrincipal, now: number): Promise<readonly DemandSignalRow[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const since = new Date(now - LOCAL_DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return uow.withTransaction(demandScope(principal), async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH market AS (
        SELECT id FROM markets WHERE code='sparta' LIMIT 1
      ), variant_context AS (
        SELECT cv.id,cv.public_id,c.code AS category_code,
               COALESCE(ptel.title,pten.title,cv.model,cv.mpn,cv.slug) AS title,
               COALESCE(ctel.name,cten.name,c.code) AS category_name,
               EXISTS(
                 SELECT 1
                 FROM vendor_offers vo
                 JOIN vendor_businesses vb ON vb.id=vo.vendor_id
                 JOIN vendor_locations vl ON vl.id=vo.location_id
                 JOIN inventory_balances ib ON ib.offer_id=vo.id
                 WHERE vo.canonical_variant_id=cv.id
                   AND vo.status='approved' AND vb.status='active' AND vl.active=true
                   AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
                   AND COALESCE(ib.stock_confirmed_at,ib.updated_at) + make_interval(secs=>ib.freshness_ttl_seconds) > now()
               ) AS available_local
        FROM canonical_variants cv
        JOIN categories c ON c.id=cv.category_id
        LEFT JOIN product_translations ptel ON ptel.canonical_variant_id=cv.id AND ptel.locale='el'
        LEFT JOIN product_translations pten ON pten.canonical_variant_id=cv.id AND pten.locale='en'
        LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
        WHERE cv.market_id=(SELECT id FROM market)
      ), signals AS (
        SELECT 'user:'||sap.user_id::text AS actor_key,'localWatch'::text AS source,
               vc.public_id AS canonical_variant_id,vc.category_code,vc.title,vc.category_name,vc.available_local
        FROM saved_product_alert_preferences sap
        JOIN variant_context vc ON vc.id=sap.canonical_variant_id
        WHERE sap.back_in_stock_enabled=true AND sap.updated_at >= $1

        UNION ALL

        SELECT COALESCE('user:'||ae.customer_id::text,'visitor:'||ae.visitor_hash) AS actor_key,'askLocal'::text AS source,
               vc.public_id AS canonical_variant_id,vc.category_code,vc.title,vc.category_name,vc.available_local
        FROM analytics_events ae
        JOIN variant_context vc ON vc.id=ae.canonical_variant_id
        WHERE ae.market_id=(SELECT id FROM market)
          AND ae.event_name='counteroffer.requested'
          AND ae.occurred_at >= $1
          AND (ae.customer_id IS NOT NULL OR NULLIF(ae.visitor_hash,'') IS NOT NULL)

        UNION ALL

        SELECT COALESCE('user:'||ae.customer_id::text,'visitor:'||ae.visitor_hash) AS actor_key,'zeroResultSearch'::text AS source,
               NULL::text AS canonical_variant_id,cat.category_code,NULL::text AS title,cat.category_name,NULL::boolean AS available_local
        FROM analytics_events ae
        JOIN LATERAL (
          SELECT c.code AS category_code,COALESCE(ctel.name,cten.name,c.code) AS category_name
          FROM categories c
          LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
          LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
          WHERE c.code=COALESCE(NULLIF(ae.metadata->>'categoryCode',''),NULLIF(ae.metadata#>>'{filters,categoryCode}',''))
            AND (c.market_id IS NULL OR c.market_id=(SELECT id FROM market))
          ORDER BY (c.market_id=(SELECT id FROM market)) DESC NULLS LAST,c.id
          LIMIT 1
        ) cat ON true
        WHERE ae.market_id=(SELECT id FROM market)
          AND ae.event_name='search.performed'
          AND ae.occurred_at >= $1
          AND (ae.customer_id IS NOT NULL OR NULLIF(ae.visitor_hash,'') IS NOT NULL)
          AND ae.metadata ? 'resultCount'
          AND (ae.metadata->>'resultCount') ~ '^\\d+$'
          AND (ae.metadata->>'resultCount')::integer=0

        UNION ALL

        SELECT 'user:'||ss.user_id::text AS actor_key,'savedSearch'::text AS source,
               NULL::text AS canonical_variant_id,cat.category_code,NULL::text AS title,cat.category_name,NULL::boolean AS available_local
        FROM saved_searches ss
        JOIN LATERAL (
          SELECT c.code AS category_code,COALESCE(ctel.name,cten.name,c.code) AS category_name
          FROM categories c
          LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
          LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
          WHERE c.code=NULLIF(ss.query->>'categoryCode','')
            AND (c.market_id IS NULL OR c.market_id=ss.market_id)
          ORDER BY (c.market_id=ss.market_id) DESC NULLS LAST,c.id
          LIMIT 1
        ) cat ON true
        WHERE ss.market_id=(SELECT id FROM market)
          AND ss.alerts_enabled=true
          AND ss.updated_at >= $1
      )
      SELECT actor_key,source,canonical_variant_id,category_code,title,category_name,available_local
      FROM signals
      WHERE actor_key IS NOT NULL AND category_code IS NOT NULL
    `, [since]);

    return result.rows.flatMap((row): DemandSignalRow[] => {
      const actorKey = text(row.actor_key);
      const source = text(row.source);
      const categoryCode = text(row.category_code);
      if (!actorKey || !categoryCode || !["localWatch", "askLocal", "savedSearch", "zeroResultSearch"].includes(source ?? "")) return [];
      return [{
        actorKey,
        source: source as DemandSignalRow["source"],
        canonicalVariantId: text(row.canonical_variant_id),
        categoryCode,
        title: text(row.title),
        categoryName: text(row.category_name),
        availableLocal: typeof row.available_local === "boolean" ? row.available_local : undefined
      }];
    });
  }, { readOnly: true });
}

export async function adminLocalDemandWorkspace(principal: SessionPrincipal, now = Date.now()): Promise<LocalDemandWorkspace> {
  if (!process.env.DATABASE_URL?.trim()) return emptyWorkspace(now);
  const opportunities = buildLocalDemandIntelligence(await loadSignalRows(principal, now));
  return {
    generatedAt: now,
    windowDays: LOCAL_DEMAND_WINDOW_DAYS,
    minimumActors: LOCAL_DEMAND_MIN_ACTORS,
    sourceCoverage: LOCAL_DEMAND_SOURCE_COVERAGE,
    opportunities,
    metrics: demandMetrics(opportunities)
  };
}

export async function vendorLocalDemandWorkspace(principal: SessionPrincipal, now = Date.now()): Promise<LocalDemandWorkspace> {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  if (!process.env.DATABASE_URL?.trim()) return emptyWorkspace(now);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const relevance = await uow.withTransaction(demandScope(principal), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT DISTINCT c.code AS category_code,cv.public_id AS canonical_variant_id
      FROM vendor_businesses vb
      JOIN vendor_offers vo ON vo.vendor_id=vb.id AND vo.status='approved'
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      WHERE (vb.public_id=$1 OR vb.id::text=$1) AND vb.status='active'
    `, [principal.vendorId]);
    return {
      categoryCodes: new Set(result.rows.map((row) => text(row.category_code)).filter((value): value is string => Boolean(value))),
      canonicalVariantIds: new Set(result.rows.map((row) => text(row.canonical_variant_id)).filter((value): value is string => Boolean(value)))
    };
  }, { readOnly: true });
  const opportunities = buildLocalDemandIntelligence(await loadSignalRows(principal, now), {
    vendorCategoryCodes: relevance.categoryCodes,
    vendorCanonicalVariantIds: relevance.canonicalVariantIds
  });
  return {
    generatedAt: now,
    windowDays: LOCAL_DEMAND_WINDOW_DAYS,
    minimumActors: LOCAL_DEMAND_MIN_ACTORS,
    sourceCoverage: LOCAL_DEMAND_SOURCE_COVERAGE,
    opportunities,
    metrics: demandMetrics(opportunities)
  };
}
