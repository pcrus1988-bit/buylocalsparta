import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CatalogMetadata = Readonly<{
  id: string;
  mpn?: string;
  description?: string;
  brand?: string;
  color?: string;
  sizes: readonly string[];
  categoryLabel?: string;
  fit?: string;
  composition?: string;
  madeIn?: string;
}>;

type MetadataRow = Readonly<{
  id: string;
  mpn: string | null;
  description: string | null;
  brand: string | null;
  category_label: string | null;
  variant_attributes: unknown;
  specifications: unknown;
}>;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(textValue).filter((entry): entry is string => Boolean(entry)) : [];
}

export async function loadCatalogMetadata(ids: readonly string[]): Promise<ReadonlyMap<string, CatalogMetadata>> {
  if (!productionDatabaseConfigured() || ids.length === 0) return new Map();
  const result = await getProductionPostgresRuntime().nativePool.query<MetadataRow>(`
    SELECT cv.public_id AS id,
           cv.mpn,
           COALESCE(el.description,en.description) AS description,
           b.name AS brand,
           COALESCE(ctel.name,cten.name,c.code) AS category_label,
           cv.variant_attributes,
           COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications
    FROM canonical_variants cv
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
    LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
    WHERE cv.public_id = ANY($1::text[])
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
  `, [ids]);

  return new Map(result.rows.map((row) => {
    const attributes = objectValue(row.variant_attributes);
    const specifications = objectValue(row.specifications);
    const sizes = stringArray(specifications.sizes).length ? stringArray(specifications.sizes) : stringArray(attributes.sizes_observed);
    return [row.id, {
      id: row.id,
      mpn: textValue(row.mpn),
      description: textValue(row.description),
      brand: textValue(row.brand) ?? textValue(specifications.brand),
      color: textValue(specifications.color) ?? textValue(attributes.color),
      sizes,
      categoryLabel: textValue(row.category_label),
      fit: textValue(specifications.fit),
      composition: textValue(specifications.composition),
      madeIn: textValue(specifications.made_in) ?? textValue(attributes.made_in)
    } satisfies CatalogMetadata] as const;
  }));
}
