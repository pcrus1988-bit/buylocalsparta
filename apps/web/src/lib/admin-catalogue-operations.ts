import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueOperationsQueueKey =
  | "identity"
  | "intelligence"
  | "attribute"
  | "controlled_value"
  | "matching";

export type CatalogueOperationsQueue = Readonly<{
  key: CatalogueOperationsQueueKey;
  label: string;
  count: number;
  affected: number;
  href: string;
  stage: string;
  why: string;
}>;

export type CatalogueOperationsWorkItem = Readonly<{
  id: string;
  key: CatalogueOperationsQueueKey;
  title: string;
  context: string;
  detail: string;
  affected: number;
  href: string;
  priority: number;
}>;

export type CatalogueOperationsWorkspace = Readonly<{
  csrfToken: string;
  humanDecisionCount: number;
  affectedObservations: number;
  automation: Readonly<{
    intelligenceRefreshPending: number;
    canonicalizationRowsPending: number;
  }>;
  queues: readonly CatalogueOperationsQueue[];
  nextWork: readonly CatalogueOperationsWorkItem[];
}>;

type CountedRows = Readonly<{
  rows: readonly SqlRow[];
  total: number;
  affected: number;
}>;

export async function adminCatalogueOperationsWorkspace(
  principal: SessionPrincipal
): Promise<CatalogueOperationsWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      humanDecisionCount: 0,
      affectedObservations: 0,
      automation: { intelligenceRefreshPending: 0, canonicalizationRowsPending: 0 },
      queues: emptyQueues(),
      nextWork: []
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 2_000 });

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [identity, intelligence, attributes, controlled, matching, automation] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT
          r.id::text AS id,
          csp.title,
          csp.source_product_key,
          cs.name AS source_name,
          r.reason_code,
          r.created_at,
          count(*) OVER()::integer AS total_open
        FROM public.catalog_canonicalization_reviews r
        JOIN public.markets m ON m.id=r.market_id AND m.code='sparta'
        JOIN public.catalog_source_products csp ON csp.id=r.source_product_id
        JOIN public.catalog_sources cs ON cs.id=r.source_id
        WHERE r.status='open'
          AND r.reason_code IN ('canonical_identity_ambiguous','material_variant_conflict')
        ORDER BY r.created_at ASC,r.id
        LIMIT 8
      `),
      tx.query<SqlRow>(`
        SELECT
          p.id::text AS id,
          p.source_id::text AS source_id,
          s.name AS source_name,
          p.proposal_kind,
          p.source_key,
          p.source_label,
          p.source_attribute_key,
          p.occurrence_count,
          p.last_seen_at,
          count(*) OVER()::integer AS total_open,
          sum(p.occurrence_count) OVER()::integer AS affected_total
        FROM public.catalog_intelligence_proposals p
        JOIN public.catalog_sources s ON s.id=p.source_id
        WHERE p.status='open'
          AND p.proposal_kind LIKE 'category_%'
        ORDER BY
          CASE
            WHEN p.proposal_kind IN ('category_ambiguous','attribute_ambiguous') THEN 0
            WHEN p.proposal_kind='attribute_contract_missing' THEN 1
            ELSE 2
          END,
          p.occurrence_count DESC,
          p.last_seen_at ASC,
          p.id
        LIMIT 8
      `),
      tx.query<SqlRow>(`
        WITH grouped AS (
          SELECT
            s.id::text AS source_id,
            s.name AS source_name,
            a.source_attribute_key,
            CASE
              WHEN sp.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node'
              WHEN COALESCE(
                NULLIF(btrim(sp.source_identity->>'categoryId'),''),
                NULLIF(btrim(sp.source_identity->>'category_id'),''),
                NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
              ) IS NOT NULL THEN 'source_category'
              ELSE 'unscoped'
            END AS scope_kind,
            CASE
              WHEN sp.source_taxonomy_node_id IS NOT NULL THEN sp.source_taxonomy_node_id::text
              ELSE COALESCE(
                NULLIF(btrim(sp.source_identity->>'categoryId'),''),
                NULLIF(btrim(sp.source_identity->>'category_id'),''),
                NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
              )
            END AS scope_key,
            min(sp.id::text) AS representative_product_id,
            min(sp.title) AS sample_title,
            count(*)::integer AS observation_count,
            count(DISTINCT sp.id)::integer AS product_count
          FROM public.catalog_source_attribute_observations a
          JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
          JOIN public.catalog_sources s ON s.id=sp.source_id
          WHERE a.mapping_status='unmapped'
            AND a.attribute_id IS NULL
          GROUP BY
            s.id,s.name,a.source_attribute_key,
            CASE
              WHEN sp.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node'
              WHEN COALESCE(
                NULLIF(btrim(sp.source_identity->>'categoryId'),''),
                NULLIF(btrim(sp.source_identity->>'category_id'),''),
                NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
              ) IS NOT NULL THEN 'source_category'
              ELSE 'unscoped'
            END,
            CASE
              WHEN sp.source_taxonomy_node_id IS NOT NULL THEN sp.source_taxonomy_node_id::text
              ELSE COALESCE(
                NULLIF(btrim(sp.source_identity->>'categoryId'),''),
                NULLIF(btrim(sp.source_identity->>'category_id'),''),
                NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
              )
            END
        )
        SELECT
          *,
          count(*) OVER()::integer AS total_groups,
          sum(observation_count) OVER()::integer AS affected_total
        FROM grouped
        ORDER BY observation_count DESC,product_count DESC,source_name,source_attribute_key
        LIMIT 8
      `),
      tx.query<SqlRow>(`
        WITH pending AS (
          SELECT
            sp.id AS source_product_id,
            s.name AS source_name,
            a.source_attribute_key,
            bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value) AS source_value,
            r.id AS mapping_rule_id,
            r.product_type_id,
            pt.code AS product_type_code,
            a.attribute_id,
            ad.code AS attribute_code
          FROM public.catalog_source_attribute_observations a
          JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
          JOIN public.catalog_sources s ON s.id=sp.source_id
          JOIN public.attribute_definitions ad
            ON ad.id=a.attribute_id AND ad.active=true AND ad.data_type='enum'
          JOIN public.catalog_source_attribute_mapping_rules r
            ON r.source_id=sp.source_id
           AND r.source_attribute_key=a.source_attribute_key
           AND r.attribute_id=a.attribute_id
           AND r.status='approved'
           AND (
             (r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
             OR
             (r.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
               NULLIF(btrim(sp.source_identity->>'categoryId'),''),
               NULLIF(btrim(sp.source_identity->>'category_id'),''),
               NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
             )=r.scope_key)
           )
          JOIN public.product_types pt ON pt.id=r.product_type_id AND pt.status='active'
          WHERE a.mapping_status='review_required'
            AND a.attribute_value_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.attribute_values av
              WHERE av.attribute_id=a.attribute_id
                AND av.active=true
                AND (
                  NOT EXISTS (
                    SELECT 1
                    FROM public.product_type_attribute_allowed_values allowed
                    WHERE allowed.product_type_id=r.product_type_id
                      AND allowed.attribute_id=a.attribute_id
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.product_type_attribute_allowed_values allowed
                    WHERE allowed.product_type_id=r.product_type_id
                      AND allowed.attribute_id=a.attribute_id
                      AND allowed.attribute_value_id=av.id
                  )
                )
            )
        ), grouped AS (
          SELECT
            mapping_rule_id::text AS mapping_rule_id,
            min(source_name) AS source_name,
            source_attribute_key,
            min(source_value) AS source_value,
            min(product_type_code) AS product_type_code,
            min(attribute_code) AS attribute_code,
            count(*)::integer AS occurrences
          FROM pending
          WHERE source_value IS NOT NULL
          GROUP BY mapping_rule_id,source_attribute_key,
                   bls_private.catalog_source_controlled_value_key(source_value)
        )
        SELECT
          *,
          count(*) OVER()::integer AS total_groups,
          sum(occurrences) OVER()::integer AS affected_total
        FROM grouped
        ORDER BY occurrences DESC,source_name,source_attribute_key
        LIMIT 8
      `),
      tx.query<SqlRow>(`
        WITH candidate_counts AS (
          SELECT
            pmc.submission_id,
            count(*) FILTER (WHERE pmc.status IN ('pending','auto_linked'))::integer AS actionable_candidates
          FROM public.product_merge_candidates pmc
          WHERE pmc.market_id=(SELECT id FROM public.markets WHERE code='sparta')
          GROUP BY pmc.submission_id
        ), review AS (
          SELECT
            s.public_id,
            v.public_id AS vendor_public_id,
            COALESCE(NULLIF(s.source_identity->>'title',''),'Untitled') AS title,
            s.status::text AS status,
            s.updated_at,
            COALESCE(cc.actionable_candidates,0)::integer AS actionable_candidates
          FROM public.vendor_product_submissions s
          JOIN public.vendor_businesses v ON v.id=s.vendor_id
          LEFT JOIN candidate_counts cc ON cc.submission_id=s.id
          WHERE s.market_id=(SELECT id FROM public.markets WHERE code='sparta')
            AND (
              s.status IN ('submitted','needs_review')
              OR COALESCE(cc.actionable_candidates,0)>0
            )
        )
        SELECT
          *,
          count(*) OVER()::integer AS total_review,
          sum(actionable_candidates) OVER()::integer AS candidate_total
        FROM review
        ORDER BY
          CASE status WHEN 'needs_review' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
          actionable_candidates DESC,
          updated_at ASC,
          public_id
        LIMIT 8
      `),
      tx.query<SqlRow>(`
        SELECT
          (SELECT count(*)::integer
           FROM public.catalog_intelligence_refresh_queue) AS intelligence_refresh_pending,
          (SELECT count(*)::integer
           FROM public.vendor_catalog_assortments vca
           JOIN public.catalog_source_products sp ON sp.id=vca.source_product_id
           LEFT JOIN public.catalog_source_product_links approved_link
             ON approved_link.source_product_id=sp.id
            AND approved_link.link_status='approved'
           WHERE vca.assortment_status NOT IN ('rejected','discontinued')
             AND vca.metadata->>'assignment'='bulk_snapshot_v1'
             AND (
               vca.canonical_variant_id IS NULL
               OR approved_link.canonical_variant_id IS NULL
             )
             AND NOT EXISTS (
               SELECT 1
               FROM public.catalog_canonicalization_reviews review
               WHERE review.source_product_id=sp.id
                 AND review.status='open'
                 AND review.reason_code IN ('canonical_identity_ambiguous','material_variant_conflict')
             )) AS canonicalization_pending
      `)
    ]);

    const identityData = counted(identity.rows, "total_open", "total_open");
    const intelligenceData = counted(intelligence.rows, "total_open", "affected_total");
    const attributeData = counted(attributes.rows, "total_groups", "affected_total");
    const controlledData = counted(controlled.rows, "total_groups", "affected_total");
    const matchingData = counted(matching.rows, "total_review", "candidate_total");
    const automationRow = automation.rows[0] ?? {};

    const queues: CatalogueOperationsQueue[] = [
      {
        key: "identity",
        label: "Identity exceptions",
        count: identityData.total,
        affected: identityData.total,
        href: "/admin/catalogue/exceptions",
        stage: "Canonical identity",
        why: "Strong identifiers conflict or remain ambiguous. Automation stops here deliberately."
      },
      {
        key: "intelligence",
        label: "Taxonomy intelligence",
        count: intelligenceData.total,
        affected: intelligenceData.affected,
        href: "/admin/catalogue-intake/intelligence?kind=category_new",
        stage: "Supplier taxonomy",
        why: "New or unresolved supplier categories need one governed mapping into the KONTAMOU taxonomy. Attribute contracts are owned by Attribute Matching instead of being counted twice."
      },
      {
        key: "attribute",
        label: "Attribute meaning",
        count: attributeData.total,
        affected: attributeData.affected,
        href: "/admin/catalogue/attribute-matching",
        stage: "Attribute mapping",
        why: "Supplier field meaning is still unknown for this exact source context."
      },
      {
        key: "controlled_value",
        label: "Controlled values",
        count: controlledData.total,
        affected: controlledData.affected,
        href: "/admin/catalogue-intake/values",
        stage: "Enum normalization",
        why: "Attribute meaning is known, but an external enum value needs canonical normalization."
      },
      {
        key: "matching",
        label: "Vendor matching",
        count: matchingData.total,
        affected: matchingData.affected,
        href: "/admin/matching",
        stage: "Commercial matching",
        why: "Legacy/vendor submissions still need a canonical match or explicit candidate decision."
      }
    ];

    const nextWork: CatalogueOperationsWorkItem[] = [
      ...identity.rows.map((row) => ({
        id: required(row.id),
        key: "identity" as const,
        title: optional(row.title) ?? required(row.source_product_key),
        context: optional(row.source_name) ?? "Supplier source",
        detail: reasonLabel(required(row.reason_code)),
        affected: 1,
        href: `/admin/catalogue/exceptions?exception=${encodeURIComponent(required(row.id))}`,
        priority: 100
      })),
      ...intelligence.rows.map((row) => ({
        id: required(row.id),
        key: "intelligence" as const,
        title: optional(row.source_attribute_key) ?? optional(row.source_label) ?? optional(row.source_key) ?? "Source structure",
        context: optional(row.source_name) ?? "Supplier source",
        detail: intelligenceLabel(required(row.proposal_kind)),
        affected: number(row.occurrence_count),
        href: intelligenceHref(row),
        priority: ["category_ambiguous","attribute_ambiguous"].includes(required(row.proposal_kind)) ? 90 : 82
      })),
      ...matching.rows.map((row) => ({
        id: required(row.public_id),
        key: "matching" as const,
        title: optional(row.title) ?? "Vendor product",
        context: optional(row.vendor_public_id) ?? "Vendor submission",
        detail: number(row.actionable_candidates) > 0
          ? `${number(row.actionable_candidates)} candidate decision${number(row.actionable_candidates) === 1 ? "" : "s"}`
          : `Submission ${required(row.status).replaceAll("_"," ")}`,
        affected: Math.max(1, number(row.actionable_candidates)),
        href: `/admin/matching?submission=${encodeURIComponent(required(row.public_id))}`,
        priority: 76
      })),
      ...attributes.rows.map((row) => ({
        id: `attribute:${required(row.source_id)}:${required(row.source_attribute_key)}:${optional(row.scope_key) ?? "unscoped"}`,
        key: "attribute" as const,
        title: required(row.source_attribute_key),
        context: `${optional(row.source_name) ?? "Supplier source"} · ${optional(row.sample_title) ?? "product evidence"}`,
        detail: `${number(row.product_count)} products · ${number(row.observation_count)} observations`,
        affected: number(row.observation_count),
        href: "/admin/catalogue/attribute-matching",
        priority: 68
      })),
      ...controlled.rows.map((row) => ({
        id: `controlled:${required(row.mapping_rule_id)}:${required(row.source_attribute_key)}:${optional(row.source_value) ?? ""}`,
        key: "controlled_value" as const,
        title: `${required(row.attribute_code)} ← ${optional(row.source_value) ?? "unknown value"}`,
        context: `${optional(row.source_name) ?? "Supplier source"} · ${optional(row.product_type_code) ?? "Product Type"}`,
        detail: `${number(row.occurrences)} matching observations`,
        affected: number(row.occurrences),
        href: "/admin/catalogue-intake/values",
        priority: 60
      }))
    ]
      .sort((a, b) => b.priority - a.priority || b.affected - a.affected || a.title.localeCompare(b.title))
      .slice(0, 20);

    return {
      csrfToken: principal.csrfToken,
      humanDecisionCount: queues.reduce((sum, queue) => sum + queue.count, 0),
      affectedObservations: queues.reduce((sum, queue) => sum + Math.max(queue.count, queue.affected), 0),
      automation: {
        intelligenceRefreshPending: number(automationRow.intelligence_refresh_pending),
        canonicalizationRowsPending: number(automationRow.canonicalization_pending)
      },
      queues,
      nextWork
    };
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

function counted(rows: readonly SqlRow[], totalField: string, affectedField: string): CountedRows {
  const first = rows[0];
  return {
    rows,
    total: first ? number(first[totalField]) : 0,
    affected: first ? number(first[affectedField]) : 0
  };
}

function emptyQueues(): CatalogueOperationsQueue[] {
  return [
    { key: "identity", label: "Identity exceptions", count: 0, affected: 0, href: "/admin/catalogue/exceptions", stage: "Canonical identity", why: "Strong identifiers conflict or remain ambiguous." },
    { key: "intelligence", label: "Taxonomy intelligence", count: 0, affected: 0, href: "/admin/catalogue-intake/intelligence?kind=category_new", stage: "Supplier taxonomy", why: "New or unresolved supplier categories." },
    { key: "attribute", label: "Attribute meaning", count: 0, affected: 0, href: "/admin/catalogue/attribute-matching", stage: "Attribute mapping", why: "Supplier field meaning is unresolved." },
    { key: "controlled_value", label: "Controlled values", count: 0, affected: 0, href: "/admin/catalogue-intake/values", stage: "Enum normalization", why: "External enum values need governed normalization." },
    { key: "matching", label: "Vendor matching", count: 0, affected: 0, href: "/admin/matching", stage: "Commercial matching", why: "Vendor submissions need a canonical decision." }
  ];
}

function intelligenceHref(row: SqlRow): string {
  const search = new URLSearchParams();
  const source = optional(row.source_id);
  const kind = optional(row.proposal_kind);
  if (source) search.set("source", source);
  if (kind) search.set("kind", kind);
  return `/admin/catalogue-intake/intelligence?${search.toString()}`;
}

function reasonLabel(value: string): string {
  if (value === "canonical_identity_ambiguous") return "Strong identity is ambiguous";
  if (value === "material_variant_conflict") return "Material variant conflict";
  return value.replaceAll("_"," ");
}

function intelligenceLabel(value: string): string {
  const labels: Record<string,string> = {
    category_new: "New category structure",
    category_ambiguous: "Ambiguous category",
    attribute_new: "New attribute structure",
    attribute_ambiguous: "Ambiguous attribute",
    attribute_contract_missing: "Product Type contract missing"
  };
  return labels[value] ?? value.replaceAll("_"," ");
}

function required(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("Catalogue operations result is missing a required value");
  return text;
}

function optional(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}
