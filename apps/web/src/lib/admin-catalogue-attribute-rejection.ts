import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { resolveAdminDatabaseUserId } from "./admin-database-identity";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueSourceAttributeRejectionResult = Readonly<{
  ruleId: string;
  sourceName: string;
  sourceAttributeKey: string;
  scopeKind: "taxonomy_node" | "source_category";
  scopeKey: string;
  rejectedObservations: number;
}>;

export async function rejectCatalogueSourceAttribute(
  principal: SessionPrincipal,
  input: {
    sourceProductId: string;
    sourceAttributeKey: string;
    reason?: string;
  }
): Promise<CatalogueSourceAttributeRejectionResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const reason = input.reason?.trim() || "Rejected in Attribute Matching as not a product attribute";
  if (!sourceProductId || !sourceAttributeKey) {
    throw new Error("Source product and source attribute are required");
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actorUserId = await resolveAdminDatabaseUserId(tx, principal.userId);
    const contextResult = await tx.query<SqlRow>(`
      SELECT sp.source_id::text AS source_id,
             s.name AS source_name,
             sp.source_taxonomy_node_id::text AS source_taxonomy_node_id,
             COALESCE(
               NULLIF(btrim(sp.source_identity->>'categoryId'),''),
               NULLIF(btrim(sp.source_identity->>'category_id'),''),
               NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
             ) AS provider_category,
             count(a.id)::integer AS observations,
             count(a.id) FILTER (
               WHERE a.mapping_status='unmapped' AND a.attribute_id IS NULL
             )::integer AS unresolved
      FROM public.catalog_source_products sp
      JOIN public.catalog_sources s ON s.id=sp.source_id
      JOIN public.catalog_source_attribute_observations a
        ON a.source_product_id=sp.id
       AND a.source_attribute_key=$2::text
      WHERE sp.id=$1::uuid
      GROUP BY sp.source_id,s.name,sp.source_taxonomy_node_id,sp.source_identity,sp.normalized_payload
      LIMIT 1
    `, [sourceProductId, sourceAttributeKey]);
    const context = contextResult.rows[0];
    if (!context) throw new Error("The selected source attribute observation was not found");

    const sourceId = required(context.source_id, "source.id");
    const taxonomyNodeId = optional(context.source_taxonomy_node_id);
    const providerCategory = optional(context.provider_category);
    const scopeKind: "taxonomy_node" | "source_category" = taxonomyNodeId ? "taxonomy_node" : "source_category";
    const scopeKey = taxonomyNodeId ?? providerCategory;
    if (!scopeKey) {
      throw new Error("This source row has no stable taxonomy/category context, so a reusable rejection cannot be learned safely.");
    }

    const existingResult = await tx.query<SqlRow>(`
      SELECT id::text AS id,status
      FROM public.catalog_source_attribute_mapping_rules
      WHERE source_id=$1::uuid
        AND source_attribute_key=$2
        AND scope_kind=$3
        AND scope_key=$4
        AND status IN ('approved','rejected')
      ORDER BY reviewed_at DESC,id DESC
      FOR UPDATE
    `, [sourceId, sourceAttributeKey, scopeKind, scopeKey]);
    const approved = existingResult.rows.find((row) => row.status === "approved");
    if (approved) {
      throw new Error("This exact source context already has an approved canonical mapping. Review or supersede that mapping before marking it as not an attribute.");
    }

    let ruleId = optional(existingResult.rows.find((row) => row.status === "rejected")?.id);
    if (!ruleId) {
      const ruleResult = await tx.query<SqlRow>(`
        INSERT INTO public.catalog_source_attribute_mapping_rules(
          source_id,source_attribute_key,scope_kind,scope_key,
          product_type_id,attribute_id,status,mapping_method,reason,
          reviewed_by,reviewed_at,metadata,created_at,updated_at
        ) VALUES (
          $1::uuid,$2,$3,$4,
          NULL,NULL,'rejected','admin_exact_context',$5,
          $6::uuid,now(),
          jsonb_build_object(
            'mappingVersion','source_attribute_context_v2',
            'decision','not_attribute',
            'createdFromSourceProductId',$7::text,
            'rawEvidencePreserved',true
          ),
          now(),now()
        )
        RETURNING id::text AS id
      `, [sourceId, sourceAttributeKey, scopeKind, scopeKey, reason, actorUserId, sourceProductId]);
      ruleId = required(ruleResult.rows[0]?.id, "rejection rule.id");
    }

    const rejectedResult = await tx.query<SqlRow>(`
      WITH changed AS (
        UPDATE public.catalog_source_attribute_observations a
           SET mapping_status='rejected',
               confidence=1,
               metadata=COALESCE(a.metadata,'{}'::jsonb) || jsonb_build_object(
                 'rejectionRuleId',$5::text,
                 'mappingMethod','admin_exact_context_rejection',
                 'mappingScopeKind',$3::text,
                 'mappingScopeKey',$4::text,
                 'autoRejected',false,
                 'rejectedAt',now(),
                 'rawEvidencePreserved',true
               )
        FROM public.catalog_source_products sp
        WHERE sp.id=a.source_product_id
          AND sp.source_id=$1::uuid
          AND a.source_attribute_key=$2
          AND a.mapping_status='unmapped'
          AND a.attribute_id IS NULL
          AND (
            ($3='taxonomy_node' AND sp.source_taxonomy_node_id::text=$4)
            OR
            ($3='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
              NULLIF(btrim(sp.source_identity->>'categoryId'),''),
              NULLIF(btrim(sp.source_identity->>'category_id'),''),
              NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
            )=$4)
          )
        RETURNING a.id
      )
      SELECT count(*)::integer AS changed FROM changed
    `, [sourceId, sourceAttributeKey, scopeKind, scopeKey, ruleId]);

    return {
      ruleId,
      sourceName: required(context.source_name, "source.name"),
      sourceAttributeKey,
      scopeKind,
      scopeKey,
      rejectedObservations: numberValue(rejectedResult.rows[0]?.changed)
    } satisfies CatalogueSourceAttributeRejectionResult;
  }, { statementTimeoutMs: 20_000 });

  await recordAdminAudit(
    principal,
    "catalogue.source_attribute_mapping.rejected",
    "catalog_source_attribute_mapping_rule",
    result.ruleId,
    reason,
    {
      sourceName: result.sourceName,
      sourceAttributeKey: result.sourceAttributeKey,
      scopeKind: result.scopeKind,
      scopeKey: result.scopeKey,
      rejectedObservations: result.rejectedObservations,
      rawEvidencePreserved: true
    }
  );
  return result;
}

function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function optional(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
