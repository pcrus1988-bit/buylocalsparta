import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { resolveAdminDatabaseUserId } from "./admin-database-identity";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AttributeTrainerCategoryOption = Readonly<{
  id: string;
  code: string;
  name: string;
  productTypeIds: readonly string[];
}>;

export type AttributeTrainerContextResolution = Readonly<{
  mappingId: string;
  categoryId: string;
  categoryCode: string;
  productTypeId?: string;
  createdProductTypeBinding: boolean;
}>;

export async function adminCatalogueAttributeTrainerCategoryOptions(
  principal: SessionPrincipal
): Promise<readonly AttributeTrainerCategoryOption[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT c.id::text AS id,
             c.code,
             COALESCE(NULLIF(ct.name,''),c.code) AS name,
             COALESCE(
               array_agg(cpt.product_type_id::text ORDER BY cpt.sort_order,cpt.product_type_id::text)
                 FILTER (WHERE cpt.product_type_id IS NOT NULL),
               ARRAY[]::text[]
             ) AS product_type_ids
      FROM public.categories c
      LEFT JOIN public.category_translations ct
        ON ct.category_id=c.id AND upper(ct.locale)='EL'
      LEFT JOIN public.category_product_types cpt
        ON cpt.category_id=c.id
      WHERE c.active=true AND c.assignable=true
      GROUP BY c.id,c.code,ct.name
      ORDER BY COALESCE(NULLIF(ct.name,''),c.code),c.code,c.id
      LIMIT 3000
    `);
    return result.rows.map((row) => ({
      id: required(row.id, "category.id"),
      code: required(row.code, "category.code"),
      name: required(row.name, "category.name"),
      productTypeIds: stringArray(row.product_type_ids)
    }));
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function resolveAttributeTrainerTaxonomyContext(
  principal: SessionPrincipal,
  input: {
    sourceProductId: string;
    categoryId: string;
    productTypeId?: string;
  }
): Promise<AttributeTrainerContextResolution> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const categoryId = input.categoryId.trim();
  const productTypeId = input.productTypeId?.trim() || undefined;
  if (!sourceProductId || !categoryId) throw new Error("Source product and KONTAMOU category are required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actorUserId = await resolveAdminDatabaseUserId(tx, principal.userId);
    const sourceResult = await tx.query<SqlRow>(`
      SELECT sp.source_taxonomy_node_id::text AS taxonomy_node_id,
             cs.market_id::text AS market_id
      FROM public.catalog_source_products sp
      JOIN public.catalog_sources cs ON cs.id=sp.source_id
      WHERE sp.id=$1::uuid
      LIMIT 1
    `, [sourceProductId]);
    const source = sourceResult.rows[0];
    if (!source) throw new Error("The source product was not found");
    const taxonomyNodeId = optional(source.taxonomy_node_id);
    if (!taxonomyNodeId) {
      throw new Error("This source row has no supplier taxonomy node. It cannot be assigned a reusable category context from the trainer.");
    }
    const marketId = required(source.market_id, "source.market_id");

    const categoryResult = await tx.query<SqlRow>(`
      SELECT c.id::text AS category_id,c.code AS category_code
      FROM public.categories c
      WHERE c.id=$1::uuid
        AND c.active=true
        AND c.assignable=true
        AND (c.market_id IS NULL OR c.market_id=$2::uuid)
      LIMIT 1
    `, [categoryId, marketId]);
    const category = categoryResult.rows[0];
    if (!category) throw new Error("Choose an active assignable KONTAMOU category for this market");
    const categoryCode = required(category.category_code, "category.code");

    const conflict = await tx.query<SqlRow>(`
      SELECT m.id::text AS mapping_id,m.category_id::text AS category_id,c.code AS category_code
      FROM public.catalog_source_category_mappings m
      JOIN public.categories c ON c.id=m.category_id
      WHERE m.source_taxonomy_node_id=$1::uuid
        AND m.mapping_status='approved'
      LIMIT 1
      FOR UPDATE OF m
    `, [taxonomyNodeId]);
    const existing = conflict.rows[0];
    if (existing && required(existing.category_id, "mapping.category_id") !== categoryId) {
      throw new Error(`This supplier taxonomy node is already approved for ${required(existing.category_code, "mapping.category_code")}. Change that mapping explicitly before assigning a different category.`);
    }

    const mappingResult = await tx.query<SqlRow>(`
      INSERT INTO public.catalog_source_category_mappings(
        source_taxonomy_node_id,category_id,mapping_status,mapping_method,
        confidence,reason,reviewed_by,reviewed_at,metadata,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,'approved','manual',1,
        'Resolved from Attribute Matching trainer',$3::uuid,now(),
        jsonb_build_object('resolvedBy','attribute_trainer_inline'),now(),now()
      )
      ON CONFLICT (source_taxonomy_node_id) WHERE mapping_status='approved'
      DO UPDATE SET
        reviewed_by=EXCLUDED.reviewed_by,
        reviewed_at=EXCLUDED.reviewed_at,
        reason=EXCLUDED.reason,
        metadata=public.catalog_source_category_mappings.metadata || EXCLUDED.metadata,
        updated_at=now()
      RETURNING id::text AS mapping_id
    `, [taxonomyNodeId, categoryId, actorUserId]);
    const mappingId = required(mappingResult.rows[0]?.mapping_id, "category mapping.id");

    let createdProductTypeBinding = false;
    if (productTypeId) {
      const productTypeResult = await tx.query<SqlRow>(`
        SELECT id::text AS id,code
        FROM public.product_types
        WHERE id=$1::uuid AND status='active'
        LIMIT 1
      `, [productTypeId]);
      if (!productTypeResult.rowCount) throw new Error("The selected Product Type is not active");

      const inserted = await tx.query<SqlRow>(`
        INSERT INTO public.category_product_types(category_id,product_type_id,is_default,sort_order)
        SELECT $1::uuid,$2::uuid,false,COALESCE(MAX(sort_order),-10)+10
        FROM public.category_product_types
        WHERE category_id=$1::uuid
        ON CONFLICT (category_id,product_type_id) DO NOTHING
        RETURNING product_type_id::text AS product_type_id
      `, [categoryId, productTypeId]);
      createdProductTypeBinding = inserted.rowCount > 0;
    }

    return { mappingId, categoryId, categoryCode, productTypeId, createdProductTypeBinding };
  }, { isolation: "serializable", statementTimeoutMs: 20_000 });

  await recordAdminAudit(
    principal,
    "catalogue.attribute_trainer.context_resolved",
    "catalog_source_category_mapping",
    result.mappingId,
    "Resolved taxonomy/Product Type context from Attribute Matching trainer",
    {
      sourceProductId,
      categoryId: result.categoryId,
      categoryCode: result.categoryCode,
      productTypeId: result.productTypeId,
      createdProductTypeBinding: result.createdProductTypeBinding
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}
