import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { adminCatalogueOverviewWorkspace } from "./admin-catalogue-overview-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export const STRUCTURE_TAXONOMY_ROLES = [
  "department",
  "navigation_group",
  "category",
  "subcategory",
  "product_class",
  "merchant_legacy"
] as const;

export const STRUCTURE_ATTRIBUTE_DATA_TYPES = [
  "boolean",
  "dimension",
  "enum",
  "multienum",
  "number",
  "text"
] as const;

export const STRUCTURE_ATTRIBUTE_VALUE_MODES = ["controlled", "free"] as const;

export type StructureTaxonomyRole = typeof STRUCTURE_TAXONOMY_ROLES[number];
export type StructureAttributeDataType = typeof STRUCTURE_ATTRIBUTE_DATA_TYPES[number];
export type StructureAttributeValueMode = typeof STRUCTURE_ATTRIBUTE_VALUE_MODES[number];

export type CatalogueStructureCategory = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string;
  taxonomyRole: string;
  assignable: boolean;
  discoverable: boolean;
  active: boolean;
  sortOrder: number;
  depth: number;
  pathLabels: readonly string[];
  directProducts: number;
  directLiveProducts: number;
  subtreeProducts: number;
  subtreeLiveProducts: number;
  childCount: number;
  configuredAttributeCount: number;
  productTypeCount: number;
}>;

export type CatalogueStructureAttributeProductSample = Readonly<{
  publicId: string;
  title: string;
}>;

export type CatalogueStructureAttribute = Readonly<{
  code: string;
  labelEl: string;
  dataType: string;
  unit?: string;
  valueMode: string;
  groupCode?: string;
  active: boolean;
  filterable: boolean;
  variantIdentity: boolean;
  required: boolean;
  sortOrder: number;
  sources: readonly string[];
  productTypes: readonly string[];
  productsWithValue: number;
  productSamples: readonly CatalogueStructureAttributeProductSample[];
}>;

export type CatalogueStructureProduct = Readonly<{
  publicId: string;
  title: string;
  slug: string;
  gtin?: string;
  mpn?: string;
  model?: string;
  active: boolean;
  suppressed: boolean;
  recalled: boolean;
  productTypeCode?: string;
  productTypeName?: string;
  attributeCodes: readonly string[];
}>;

export type CatalogueStructureProductType = Readonly<{
  code: string;
  labelEl: string;
  isDefault: boolean;
  productCount: number;
}>;

export type CatalogueStructureCategoryDetails = Readonly<{
  categoryCode: string;
  attributes: readonly CatalogueStructureAttribute[];
  productTypes: readonly CatalogueStructureProductType[];
  products: readonly CatalogueStructureProduct[];
  productsTotal: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}>;

export type CatalogueStructureWorkspace = Readonly<{
  csrfToken: string;
  categories: readonly CatalogueStructureCategory[];
  metrics: Readonly<{
    totalCategories: number;
    activeCategories: number;
    rootCategories: number;
    taxonomyLevels: number;
    totalProducts: number;
    liveProducts: number;
    configuredAttributes: number;
  }>;
}>;

type SourceCategory = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string;
  taxonomyRole: string;
  assignable: boolean;
  discoverable: boolean;
  active: boolean;
  sortOrder: number;
  directProducts: number;
  directLiveProducts: number;
  configuredAttributeCount: number;
  productTypeCount: number;
}>;

function text(row: SqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalText(row: SqlRow, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Database field ${field} is not a non-negative safe integer`);
  return value;
}

function signedInteger(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value)) throw new Error(`Database field ${field} is not a safe integer`);
  return value;
}

function booleanValue(row: SqlRow, field: string): boolean {
  return row[field] === true;
}

function stringArray(row: SqlRow, field: string): readonly string[] {
  const value = row[field];
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function samples(row: SqlRow, field: string): readonly CatalogueStructureAttributeProductSample[] {
  const value = row[field];
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const publicId = typeof record.publicId === "string" ? record.publicId : "";
    const title = typeof record.title === "string" ? record.title : "";
    return publicId && title ? [{ publicId, title }] : [];
  });
}

function compareSourceCategories(a: SourceCategory, b: SourceCategory): number {
  return a.sortOrder - b.sortOrder
    || a.labelEl.localeCompare(b.labelEl, "el", { sensitivity: "base" })
    || a.categoryCode.localeCompare(b.categoryCode);
}

function normalizedParents(source: readonly SourceCategory[]): Map<string, string | undefined> {
  const knownCodes = new Set(source.map((category) => category.categoryCode));
  const parents = new Map<string, string | undefined>();
  for (const category of source) {
    const parent = category.parentCategoryCode;
    parents.set(category.categoryCode, parent && parent !== category.categoryCode && knownCodes.has(parent) ? parent : undefined);
  }

  for (const category of source) {
    const seen = new Set<string>();
    let cursor: string | undefined = category.categoryCode;
    let cyclic = false;
    while (cursor) {
      if (seen.has(cursor)) { cyclic = true; break; }
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
    if (cyclic) parents.set(category.categoryCode, undefined);
  }
  return parents;
}

function buildWorkspace(csrfToken: string, source: readonly SourceCategory[], configuredAttributes: number): CatalogueStructureWorkspace {
  const byCode = new Map(source.map((category) => [category.categoryCode, category] as const));
  const parents = normalizedParents(source);
  const children = new Map<string | undefined, SourceCategory[]>();

  for (const category of source) {
    const parent = parents.get(category.categoryCode);
    const bucket = children.get(parent) ?? [];
    bucket.push(category);
    children.set(parent, bucket);
  }
  for (const bucket of children.values()) bucket.sort(compareSourceCategories);

  const aggregateMemo = new Map<string, { products: number; liveProducts: number }>();
  function aggregate(categoryCode: string): { products: number; liveProducts: number } {
    const cached = aggregateMemo.get(categoryCode);
    if (cached) return cached;
    const category = byCode.get(categoryCode);
    if (!category) return { products: 0, liveProducts: 0 };
    let products = category.directProducts;
    let liveProducts = category.directLiveProducts;
    for (const child of children.get(categoryCode) ?? []) {
      const subtotal = aggregate(child.categoryCode);
      products += subtotal.products;
      liveProducts += subtotal.liveProducts;
    }
    const result = { products, liveProducts };
    aggregateMemo.set(categoryCode, result);
    return result;
  }

  const ordered: CatalogueStructureCategory[] = [];
  const visited = new Set<string>();
  function visit(category: SourceCategory, depth: number, ancestors: readonly string[]) {
    if (visited.has(category.categoryCode)) return;
    visited.add(category.categoryCode);
    const branch = aggregate(category.categoryCode);
    const pathLabels = [...ancestors, category.labelEl];
    const directChildren = children.get(category.categoryCode) ?? [];
    ordered.push({
      ...category,
      parentCategoryCode: parents.get(category.categoryCode),
      depth,
      pathLabels,
      subtreeProducts: branch.products,
      subtreeLiveProducts: branch.liveProducts,
      childCount: directChildren.length
    });
    for (const child of directChildren) visit(child, depth + 1, pathLabels);
  }

  for (const root of children.get(undefined) ?? []) visit(root, 0, []);
  for (const category of [...source].sort(compareSourceCategories)) {
    if (!visited.has(category.categoryCode)) visit(category, 0, []);
  }

  return {
    csrfToken,
    categories: ordered,
    metrics: {
      totalCategories: ordered.length,
      activeCategories: ordered.filter((category) => category.active).length,
      rootCategories: ordered.filter((category) => category.depth === 0).length,
      taxonomyLevels: ordered.length === 0 ? 0 : Math.max(...ordered.map((category) => category.depth)) + 1,
      totalProducts: source.reduce((sum, category) => sum + category.directProducts, 0),
      liveProducts: source.reduce((sum, category) => sum + category.directLiveProducts, 0),
      configuredAttributes
    }
  };
}

async function postgresWorkspace(principal: SessionPrincipal): Promise<CatalogueStructureWorkspace> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [categories, attributeCount] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT
          c.code,
          COALESCE(ct.name, c.code) AS label,
          p.code AS parent_code,
          c.taxonomy_role,
          c.assignable,
          c.discoverable,
          c.active,
          COALESCE(c.sort_order, 0)::int AS sort_order,
          COUNT(DISTINCT cv.id)::int AS direct_products,
          COUNT(DISTINCT cv.id) FILTER (
            WHERE cv.active = TRUE AND cv.suppressed = FALSE AND cv.recalled = FALSE
          )::int AS direct_live_products,
          (
            SELECT COUNT(*)::int FROM (
              SELECT ca.attribute_id
              FROM category_attributes ca
              WHERE ca.category_id = c.id
              UNION
              SELECT pta.attribute_id
              FROM category_product_types cpt
              JOIN product_type_attributes pta ON pta.product_type_id = cpt.product_type_id
              WHERE cpt.category_id = c.id
            ) configured
          ) AS configured_attribute_count,
          (SELECT COUNT(*)::int FROM category_product_types cpt WHERE cpt.category_id = c.id) AS product_type_count
        FROM categories c
        JOIN markets m ON m.id = c.market_id
        LEFT JOIN categories p ON p.id = c.parent_id
        LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = 'el'
        LEFT JOIN canonical_variants cv ON cv.category_id = c.id AND cv.market_id = m.id
        WHERE m.code = 'sparta'
        GROUP BY c.id, c.code, ct.name, p.code, c.taxonomy_role, c.assignable, c.discoverable, c.active, c.sort_order
        ORDER BY c.sort_order ASC, label ASC, c.code ASC
      `),
      tx.query<SqlRow>(`SELECT COUNT(*)::int AS total FROM attribute_definitions WHERE active = TRUE`)
    ]);

    return buildWorkspace(
      principal.csrfToken,
      categories.rows.map((row) => ({
        categoryCode: text(row, "code"),
        labelEl: text(row, "label"),
        parentCategoryCode: optionalText(row, "parent_code"),
        taxonomyRole: text(row, "taxonomy_role"),
        assignable: booleanValue(row, "assignable"),
        discoverable: booleanValue(row, "discoverable"),
        active: booleanValue(row, "active"),
        sortOrder: signedInteger(row, "sort_order"),
        directProducts: integer(row, "direct_products"),
        directLiveProducts: integer(row, "direct_live_products"),
        configuredAttributeCount: integer(row, "configured_attribute_count"),
        productTypeCount: integer(row, "product_type_count")
      })),
      integer(attributeCount.rows[0] ?? {}, "total")
    );
  }, { readOnly: true });
}

async function memoryWorkspace(principal: SessionPrincipal): Promise<CatalogueStructureWorkspace> {
  const overview = await adminCatalogueOverviewWorkspace(principal);
  return buildWorkspace(
    principal.csrfToken,
    overview.categories.map((category) => ({
      categoryCode: category.categoryCode,
      labelEl: category.labelEl,
      parentCategoryCode: category.parentCategoryCode,
      taxonomyRole: category.taxonomyRole,
      assignable: category.assignable,
      discoverable: category.discoverable,
      active: category.active,
      sortOrder: 0,
      directProducts: category.directProducts,
      directLiveProducts: category.directLiveProducts,
      configuredAttributeCount: 0,
      productTypeCount: 0
    })),
    overview.attributes.activeAttributeDefinitions
  );
}

export async function adminCatalogueStructureWorkspace(principal: SessionPrincipal): Promise<CatalogueStructureWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  return postgresAdminRuntimeEnabled() ? postgresWorkspace(principal) : memoryWorkspace(principal);
}

export async function adminCatalogueStructureCategoryDetails(
  principal: SessionPrincipal,
  categoryCode: string,
  options: Readonly<{ offset?: number; limit?: number }> = {}
): Promise<CatalogueStructureCategoryDetails> {
  assertAdminPermission(principal, "catalog.read");
  const code = categoryCode.trim();
  if (!code) throw new Error("Category code is required");
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 50)));

  if (!postgresAdminRuntimeEnabled()) {
    return { categoryCode: code, attributes: [], productTypes: [], products: [], productsTotal: 0, offset, limit, hasMore: false };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const category = await tx.query<SqlRow>(`
      SELECT c.id::text AS category_uuid
      FROM categories c JOIN markets m ON m.id = c.market_id
      WHERE m.code = 'sparta' AND c.code = $1
    `, [code]);
    if (!category.rowCount) throw new Error("Category not found");
    const categoryUuid = text(category.rows[0], "category_uuid");

    const [attributeRows, productTypeRows, productRows, totalRows] = await Promise.all([
      tx.query<SqlRow>(`
        WITH configured AS (
          SELECT ca.attribute_id, 'category'::text AS source, ca.required, ca.sort_order, NULL::uuid AS product_type_id
          FROM category_attributes ca
          WHERE ca.category_id = $1::uuid
          UNION ALL
          SELECT pta.attribute_id, 'product_type'::text AS source,
                 (pta.requirement_level = 'required') AS required, pta.sort_order, pta.product_type_id
          FROM category_product_types cpt
          JOIN product_type_attributes pta ON pta.product_type_id = cpt.product_type_id
          WHERE cpt.category_id = $1::uuid
        ),
        value_coverage AS (
          SELECT cvav.attribute_id, cv.id AS canonical_variant_id
          FROM canonical_variants cv
          JOIN canonical_variant_attribute_values cvav ON cvav.canonical_variant_id = cv.id
          WHERE cv.category_id = $1::uuid
          UNION
          SELECT pfav.attribute_id, cv.id AS canonical_variant_id
          FROM canonical_variants cv
          JOIN product_family_attribute_values pfav ON pfav.family_id = cv.family_id
          WHERE cv.category_id = $1::uuid
        ),
        present AS (
          SELECT attribute_id, source, required, sort_order, product_type_id FROM configured
          UNION ALL
          SELECT DISTINCT attribute_id, 'observed'::text, FALSE, 9999, NULL::uuid FROM value_coverage
        ),
        chosen AS (SELECT DISTINCT attribute_id FROM present)
        SELECT
          a.code,
          COALESCE(at.label, a.code) AS label,
          a.data_type,
          a.unit,
          a.value_mode,
          a.group_code,
          a.active,
          a.filterable,
          a.variant_identity,
          EXISTS(SELECT 1 FROM configured cf WHERE cf.attribute_id = a.id AND cf.required = TRUE) AS required,
          COALESCE((SELECT MIN(p.sort_order) FROM present p WHERE p.attribute_id = a.id), 9999)::int AS sort_order,
          COALESCE((SELECT ARRAY_AGG(DISTINCT p.source ORDER BY p.source) FROM present p WHERE p.attribute_id = a.id), ARRAY[]::text[]) AS sources,
          COALESCE((
            SELECT ARRAY_AGG(DISTINCT COALESCE(ptt.name, pt.code) ORDER BY COALESCE(ptt.name, pt.code))
            FROM configured cf
            JOIN product_types pt ON pt.id = cf.product_type_id
            LEFT JOIN product_type_translations ptt ON ptt.product_type_id = pt.id AND ptt.locale = 'el'
            WHERE cf.attribute_id = a.id AND cf.product_type_id IS NOT NULL
          ), ARRAY[]::text[]) AS product_types,
          (SELECT COUNT(DISTINCT vc.canonical_variant_id)::int FROM value_coverage vc WHERE vc.attribute_id = a.id) AS products_with_value,
          COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('publicId', sample.public_id, 'title', sample.title) ORDER BY sample.title, sample.public_id)
            FROM (
              SELECT DISTINCT cv.public_id,
                     COALESCE(pt.title, cv.model, cv.slug, cv.public_id) AS title
              FROM value_coverage vc
              JOIN canonical_variants cv ON cv.id = vc.canonical_variant_id
              LEFT JOIN product_translations pt ON pt.canonical_variant_id = cv.id AND pt.locale = 'el'
              WHERE vc.attribute_id = a.id
              ORDER BY title, cv.public_id
              LIMIT 8
            ) sample
          ), '[]'::jsonb) AS product_samples
        FROM chosen ch
        JOIN attribute_definitions a ON a.id = ch.attribute_id
        LEFT JOIN attribute_translations at ON at.attribute_id = a.id AND at.locale = 'el'
        ORDER BY sort_order ASC, label ASC, a.code ASC
      `, [categoryUuid]),
      tx.query<SqlRow>(`
        SELECT pt.code, COALESCE(ptt.name, pt.code) AS label, cpt.is_default,
               COUNT(DISTINCT cv.id)::int AS product_count
        FROM category_product_types cpt
        JOIN product_types pt ON pt.id = cpt.product_type_id
        LEFT JOIN product_type_translations ptt ON ptt.product_type_id = pt.id AND ptt.locale = 'el'
        LEFT JOIN product_families pf ON pf.product_type_id = pt.id AND pf.category_id = cpt.category_id
        LEFT JOIN canonical_variants cv ON cv.family_id = pf.id AND cv.category_id = cpt.category_id
        WHERE cpt.category_id = $1::uuid
        GROUP BY cpt.sort_order, pt.id, pt.code, ptt.name, cpt.is_default
        ORDER BY cpt.sort_order ASC, label ASC, pt.code ASC
      `, [categoryUuid]),
      tx.query<SqlRow>(`
        SELECT
          cv.public_id,
          COALESCE(prod.title, cv.model, cv.slug, cv.public_id) AS title,
          cv.slug,
          cv.gtin,
          cv.mpn,
          cv.model,
          cv.active,
          cv.suppressed,
          cv.recalled,
          pt.code AS product_type_code,
          COALESCE(ptt.name, pt.code) AS product_type_name,
          ARRAY(
            SELECT DISTINCT a.code
            FROM attribute_definitions a
            JOIN (
              SELECT cvav.attribute_id
              FROM canonical_variant_attribute_values cvav
              WHERE cvav.canonical_variant_id = cv.id
              UNION
              SELECT pfav.attribute_id
              FROM product_family_attribute_values pfav
              WHERE pfav.family_id = cv.family_id
            ) values_present ON values_present.attribute_id = a.id
            ORDER BY a.code
          ) AS attribute_codes
        FROM canonical_variants cv
        LEFT JOIN product_translations prod ON prod.canonical_variant_id = cv.id AND prod.locale = 'el'
        LEFT JOIN product_families pf ON pf.id = cv.family_id
        LEFT JOIN product_types pt ON pt.id = pf.product_type_id
        LEFT JOIN product_type_translations ptt ON ptt.product_type_id = pt.id AND ptt.locale = 'el'
        WHERE cv.category_id = $1::uuid
        ORDER BY title ASC, cv.public_id ASC
        LIMIT $2 OFFSET $3
      `, [categoryUuid, limit, offset]),
      tx.query<SqlRow>(`SELECT COUNT(*)::int AS total FROM canonical_variants WHERE category_id = $1::uuid`, [categoryUuid])
    ]);

    const productsTotal = integer(totalRows.rows[0] ?? {}, "total");
    return {
      categoryCode: code,
      attributes: attributeRows.rows.map((row) => ({
        code: text(row, "code"),
        labelEl: text(row, "label"),
        dataType: text(row, "data_type"),
        unit: optionalText(row, "unit"),
        valueMode: text(row, "value_mode"),
        groupCode: optionalText(row, "group_code"),
        active: booleanValue(row, "active"),
        filterable: booleanValue(row, "filterable"),
        variantIdentity: booleanValue(row, "variant_identity"),
        required: booleanValue(row, "required"),
        sortOrder: signedInteger(row, "sort_order"),
        sources: stringArray(row, "sources"),
        productTypes: stringArray(row, "product_types"),
        productsWithValue: integer(row, "products_with_value"),
        productSamples: samples(row, "product_samples")
      })),
      productTypes: productTypeRows.rows.map((row) => ({
        code: text(row, "code"),
        labelEl: text(row, "label"),
        isDefault: booleanValue(row, "is_default"),
        productCount: integer(row, "product_count")
      })),
      products: productRows.rows.map((row) => ({
        publicId: text(row, "public_id"),
        title: text(row, "title"),
        slug: text(row, "slug"),
        gtin: optionalText(row, "gtin"),
        mpn: optionalText(row, "mpn"),
        model: optionalText(row, "model"),
        active: booleanValue(row, "active"),
        suppressed: booleanValue(row, "suppressed"),
        recalled: booleanValue(row, "recalled"),
        productTypeCode: optionalText(row, "product_type_code"),
        productTypeName: optionalText(row, "product_type_name"),
        attributeCodes: stringArray(row, "attribute_codes")
      })),
      productsTotal,
      offset,
      limit,
      hasMore: offset + productRows.rows.length < productsTotal
    };
  }, { readOnly: true });
}

export type UpdateStructureCategoryInput = Readonly<{
  categoryCode: string;
  labelEl: string;
  parentCategoryCode?: string | null;
  taxonomyRole: string;
  assignable: boolean;
  discoverable: boolean;
  active: boolean;
  sortOrder: number;
}>;

export type UpdateStructureAttributeInput = Readonly<{
  code: string;
  labelEl: string;
  dataType: string;
  unit?: string | null;
  valueMode: string;
  groupCode?: string | null;
  active: boolean;
  filterable: boolean;
  variantIdentity: boolean;
}>;

export async function adminUpdateCatalogueStructureCategory(principal: SessionPrincipal, input: UpdateStructureCategoryInput) {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Structure editing requires the PostgreSQL admin runtime");

  const categoryCode = input.categoryCode.trim();
  const labelEl = input.labelEl.trim();
  const taxonomyRole = input.taxonomyRole.trim();
  const parentCode = input.parentCategoryCode?.trim() || undefined;
  const sortOrder = Math.floor(Number(input.sortOrder));
  if (!categoryCode || !labelEl) throw new Error("Category code and Greek label are required");
  if (!STRUCTURE_TAXONOMY_ROLES.includes(taxonomyRole as StructureTaxonomyRole)) throw new Error("Invalid taxonomy role");
  if (!Number.isSafeInteger(sortOrder)) throw new Error("Sort order must be an integer");
  if (parentCode === categoryCode) throw new Error("A category cannot be its own parent");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT c.id::text AS category_uuid, c.market_id::text AS market_uuid
      FROM categories c JOIN markets m ON m.id = c.market_id
      WHERE m.code = 'sparta' AND c.code = $1
      FOR UPDATE
    `, [categoryCode]);
    if (!found.rowCount) throw new Error("Category not found");
    const categoryUuid = text(found.rows[0], "category_uuid");
    const marketUuid = text(found.rows[0], "market_uuid");

    let parentUuid: string | null = null;
    if (parentCode) {
      const parent = await tx.query<SqlRow>(`
        SELECT id::text AS parent_uuid FROM categories
        WHERE market_id = $1::uuid AND code = $2
      `, [marketUuid, parentCode]);
      if (!parent.rowCount) throw new Error("Parent category not found in the Sparta taxonomy");
      parentUuid = text(parent.rows[0], "parent_uuid");

      const cycle = await tx.query<SqlRow>(`
        WITH RECURSIVE descendants AS (
          SELECT id FROM categories WHERE parent_id = $1::uuid
          UNION ALL
          SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
        )
        SELECT 1 AS hit FROM descendants WHERE id = $2::uuid LIMIT 1
      `, [categoryUuid, parentUuid]);
      if (cycle.rowCount) throw new Error("This parent would create a taxonomy cycle");
    }

    await tx.query(`
      UPDATE categories
      SET parent_id = $2::uuid,
          taxonomy_role = $3,
          assignable = $4,
          discoverable = $5,
          active = $6,
          sort_order = $7,
          updated_at = NOW()
      WHERE id = $1::uuid
    `, [categoryUuid, parentUuid, taxonomyRole, input.assignable, input.discoverable, input.active, sortOrder]);
    await tx.query(`
      INSERT INTO category_translations(category_id, locale, name)
      VALUES($1::uuid, 'el', $2)
      ON CONFLICT(category_id, locale) DO UPDATE SET name = EXCLUDED.name
    `, [categoryUuid, labelEl]);

    return {
      categoryCode,
      labelEl,
      parentCategoryCode: parentCode,
      taxonomyRole,
      assignable: input.assignable,
      discoverable: input.discoverable,
      active: input.active,
      sortOrder
    };
  }, { isolation: "serializable" });
}

export async function adminUpdateCatalogueStructureAttribute(principal: SessionPrincipal, input: UpdateStructureAttributeInput) {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Structure editing requires the PostgreSQL admin runtime");

  const code = input.code.trim();
  const labelEl = input.labelEl.trim();
  const dataType = input.dataType.trim();
  const valueMode = input.valueMode.trim();
  const unit = input.unit?.trim() || undefined;
  const groupCode = input.groupCode?.trim() || undefined;
  if (!code || !labelEl) throw new Error("Attribute code and Greek label are required");
  if (!STRUCTURE_ATTRIBUTE_DATA_TYPES.includes(dataType as StructureAttributeDataType)) throw new Error("Invalid attribute data type");
  if (!STRUCTURE_ATTRIBUTE_VALUE_MODES.includes(valueMode as StructureAttributeValueMode)) throw new Error("Invalid attribute value mode");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT id::text AS attribute_uuid FROM attribute_definitions WHERE code = $1 FOR UPDATE`, [code]);
    if (!found.rowCount) throw new Error("Attribute not found");
    const attributeUuid = text(found.rows[0], "attribute_uuid");

    await tx.query(`
      UPDATE attribute_definitions
      SET data_type = $2,
          unit = $3,
          value_mode = $4,
          group_code = $5,
          active = $6,
          filterable = $7,
          variant_identity = $8,
          updated_at = NOW()
      WHERE id = $1::uuid
    `, [attributeUuid, dataType, unit ?? null, valueMode, groupCode ?? null, input.active, input.filterable, input.variantIdentity]);
    await tx.query(`
      INSERT INTO attribute_translations(attribute_id, locale, label)
      VALUES($1::uuid, 'el', $2)
      ON CONFLICT(attribute_id, locale) DO UPDATE SET label = EXCLUDED.label
    `, [attributeUuid, labelEl]);

    return {
      code,
      labelEl,
      dataType,
      unit,
      valueMode,
      groupCode,
      active: input.active,
      filterable: input.filterable,
      variantIdentity: input.variantIdentity
    };
  }, { isolation: "serializable" });
}
