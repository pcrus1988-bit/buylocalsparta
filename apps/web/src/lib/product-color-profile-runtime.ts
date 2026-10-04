import { createHash } from "node:crypto";
import { normalizeCatalogColorText, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  hexToLab,
  inferColorFinish,
  inferColorProductType,
  normalizeHex,
  resolveCatalogColor,
  type ColorFinish,
  type ColorProductType
} from "./color-finder";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1_000;

export type ProductColorProfileSyncResult = Readonly<{
  scanned: number;
  updated: number;
  unchanged: number;
  unresolved: number;
}>;

type ProfilePrecision = "exact" | "canonicalized" | "family_estimate" | "unknown";
type SourceKind = "supplier" | "agent" | "research" | "derived";

type DerivedProfile = Readonly<{
  familyId?: string;
  supplierId?: string;
  externalProductId?: string;
  brandName?: string;
  shadeCode?: string;
  brandShadeName?: string;
  colorFamily?: string;
  colorDetail?: string;
  undertone?: string;
  finish: ColorFinish;
  productType: ColorProductType;
  canonicalHex?: string;
  lab?: Readonly<{ l: number; a: number; b: number }>;
  matchPrecision: ProfilePrecision;
  confidence: number;
  sourceKind: SourceKind;
  sourceHash: string;
  provenance: Readonly<Record<string, unknown>>;
}>;

export async function runProductColorProfileSyncSlice(
  env: NodeJS.ProcessEnv = process.env
): Promise<ProductColorProfileSyncResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    WITH candidate_ids AS MATERIALIZED (
      SELECT cv.id
      FROM public.categories c
      JOIN public.canonical_variants cv ON cv.category_id=c.id
      LEFT JOIN public.product_translations candidate_en
        ON candidate_en.canonical_variant_id=cv.id AND candidate_en.locale='en'
      LEFT JOIN public.product_translations candidate_el
        ON candidate_el.canonical_variant_id=cv.id AND candidate_el.locale='el'
      LEFT JOIN public.product_color_profiles existing
        ON existing.canonical_variant_id=cv.id
      WHERE (
        c.code IN ('nail-care-colour','lip-makeup','eye-makeup','face-makeup','makeup')
        OR c.code ~* '(hair|shoe|footwear|sneaker|boot|sandal|loafer|bag|handbag|backpack|wallet|luggage|fashion|dress|top|shirt|trouser|jean|jacket|coat|short|skirt|activewear|clothing|apparel|belt|scarf|hat|glove|sunglass|jewell|earring|necklace|bracelet|ring|watch|home|decor|candle|tableware|glassware|kitchen|furniture|lighting|houseware)'
        OR NULLIF(btrim(COALESCE(
          cv.variant_attributes->>'color',
          cv.variant_attributes->>'colour',
          cv.variant_attributes->>'color_name',
          cv.variant_attributes->>'colour_name',
          cv.variant_attributes->>'variant_color',
          cv.variant_attributes->>'variant_colour',
          cv.variant_attributes->>'primary_color',
          cv.variant_attributes->>'primary_colour',
          cv.variant_attributes->>'Χρώμα',
          cv.variant_attributes->>'χρώμα',
          candidate_en.specifications->>'color',
          candidate_en.specifications->>'colour',
          candidate_en.specifications->>'color_name',
          candidate_en.specifications->>'colour_name',
          candidate_en.specifications->>'variant_color',
          candidate_en.specifications->>'variant_colour',
          candidate_en.specifications->>'primary_color',
          candidate_en.specifications->>'primary_colour',
          candidate_el.specifications->>'color',
          candidate_el.specifications->>'colour',
          candidate_el.specifications->>'color_name',
          candidate_el.specifications->>'colour_name',
          candidate_el.specifications->>'variant_color',
          candidate_el.specifications->>'variant_colour',
          candidate_el.specifications->>'primary_color',
          candidate_el.specifications->>'primary_colour',
          candidate_el.specifications->>'Χρώμα',
          candidate_el.specifications->>'χρώμα',
          ''
        )), '') IS NOT NULL
      )
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
      ORDER BY
        (existing.canonical_variant_id IS NULL) DESC,
        COALESCE(existing.profiled_at,'epoch'::timestamptz) ASC,
        cv.id
      LIMIT $1
    )
    SELECT
      cv.id::text canonical_variant_id,
      cv.family_id::text family_id,
      cv.mpn,
      cv.variant_attributes,
      c.code category_code,
      b.name brand_name,
      COALESCE(en.title,el.title,cv.model,cv.slug) source_title,
      COALESCE(en.specifications,'{}'::jsonb) specifications_en,
      COALESCE(el.specifications,'{}'::jsonb) specifications_el,
      ce.supplier_id::text supplier_id,
      ce.external_product_id,
      ce.verified_facts,
      ce.fact_provenance,
      ce.source_hash enrichment_source_hash,
      existing.source_hash existing_profile_source_hash
    FROM candidate_ids selected
    JOIN public.canonical_variants cv ON cv.id=selected.id
    JOIN public.categories c ON c.id=cv.category_id
    LEFT JOIN public.product_families pf ON pf.id=cv.family_id
    LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
    LEFT JOIN public.product_translations en
      ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.catalogue_enrichments ce ON ce.family_id=cv.family_id
    LEFT JOIN public.product_color_profiles existing
      ON existing.canonical_variant_id=cv.id
    ORDER BY
      (existing.canonical_variant_id IS NULL) DESC,
      COALESCE(existing.profiled_at,'epoch'::timestamptz) ASC,
      cv.id
  `, [batchSize(env)]);

  let updated = 0;
  let unchanged = 0;
  let unresolved = 0;
  const unchangedIds: string[] = [];
  const pendingUpserts: Array<Record<string, unknown>> = [];

  for (const row of candidates.rows) {
    const canonicalVariantId = requiredText(row.canonical_variant_id, "canonical variant id");
    const profile = deriveProfile(row);
    if (!profile.canonicalHex) unresolved += 1;

    if (text(row.existing_profile_source_hash) === profile.sourceHash) {
      unchanged += 1;
      unchangedIds.push(canonicalVariantId);
      continue;
    }

    pendingUpserts.push({
      canonical_variant_id: canonicalVariantId,
      family_id: profile.familyId ?? null,
      supplier_id: profile.supplierId ?? null,
      external_product_id: profile.externalProductId ?? null,
      brand_name: profile.brandName ?? null,
      shade_code: profile.shadeCode ?? null,
      brand_shade_name: profile.brandShadeName ?? null,
      color_family: profile.colorFamily ?? null,
      color_detail: profile.colorDetail ?? null,
      undertone: profile.undertone ?? null,
      finish: profile.finish,
      product_type: profile.productType,
      canonical_hex: profile.canonicalHex ?? null,
      lab_l: profile.lab?.l ?? null,
      lab_a: profile.lab?.a ?? null,
      lab_b: profile.lab?.b ?? null,
      match_precision: profile.matchPrecision,
      confidence: profile.confidence,
      source_kind: profile.sourceKind,
      source_hash: profile.sourceHash,
      provenance: profile.provenance
    });
  }

  if (pendingUpserts.length > 0) {
    await pool.query(`
      INSERT INTO public.product_color_profiles(
        canonical_variant_id,family_id,supplier_id,external_product_id,
        brand_name,shade_code,brand_shade_name,color_family,color_detail,undertone,
        finish,product_type,canonical_hex,lab_l,lab_a,lab_b,
        match_precision,confidence,source_kind,source_hash,provenance,profiled_at
      )
      SELECT
        payload.canonical_variant_id,
        payload.family_id,
        payload.supplier_id,
        payload.external_product_id,
        payload.brand_name,
        payload.shade_code,
        payload.brand_shade_name,
        payload.color_family,
        payload.color_detail,
        payload.undertone,
        payload.finish,
        payload.product_type,
        payload.canonical_hex,
        payload.lab_l,
        payload.lab_a,
        payload.lab_b,
        payload.match_precision,
        payload.confidence,
        payload.source_kind,
        payload.source_hash,
        payload.provenance,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS payload(
        canonical_variant_id uuid,
        family_id uuid,
        supplier_id uuid,
        external_product_id text,
        brand_name text,
        shade_code text,
        brand_shade_name text,
        color_family text,
        color_detail text,
        undertone text,
        finish text,
        product_type text,
        canonical_hex text,
        lab_l double precision,
        lab_a double precision,
        lab_b double precision,
        match_precision text,
        confidence numeric,
        source_kind text,
        source_hash text,
        provenance jsonb
      )
      ON CONFLICT(canonical_variant_id)
      DO UPDATE SET
        family_id=EXCLUDED.family_id,
        supplier_id=EXCLUDED.supplier_id,
        external_product_id=EXCLUDED.external_product_id,
        brand_name=EXCLUDED.brand_name,
        shade_code=EXCLUDED.shade_code,
        brand_shade_name=EXCLUDED.brand_shade_name,
        color_family=EXCLUDED.color_family,
        color_detail=EXCLUDED.color_detail,
        undertone=EXCLUDED.undertone,
        finish=EXCLUDED.finish,
        product_type=EXCLUDED.product_type,
        canonical_hex=EXCLUDED.canonical_hex,
        lab_l=EXCLUDED.lab_l,
        lab_a=EXCLUDED.lab_a,
        lab_b=EXCLUDED.lab_b,
        match_precision=EXCLUDED.match_precision,
        confidence=EXCLUDED.confidence,
        source_kind=EXCLUDED.source_kind,
        source_hash=EXCLUDED.source_hash,
        provenance=EXCLUDED.provenance,
        profiled_at=now(),
        updated_at=now()
    `, [JSON.stringify(pendingUpserts)]);
    updated = pendingUpserts.length;
  }

  if (unchangedIds.length > 0) {
    await pool.query(`
      UPDATE public.product_color_profiles
      SET profiled_at=now()
      WHERE canonical_variant_id=ANY($1::uuid[])
    `, [unchangedIds]);
  }

  return {
    scanned: candidates.rowCount ?? candidates.rows.length,
    updated,
    unchanged,
    unresolved
  };
}

function deriveProfile(row: SqlRow): DerivedProfile {
  const attributes = record(row.variant_attributes);
  const specsEn = record(row.specifications_en);
  const specsEl = record(row.specifications_el);
  const facts = record(row.verified_facts);
  const factProvenance = record(row.fact_provenance);
  const sourceTitle = text(row.source_title) ?? "";
  const brandName = text(facts.brand) ?? text(row.brand_name);

  const brandShadeName = firstText(
    facts.brandShadeName,
    facts.brand_shade_name,
    facts.shadeName,
    facts.shade_name,
    attributes.brand_shade_name,
    attributes.shade_name,
    specsEn.brand_shade_name,
    specsEn.shade_name,
    specsEl.brand_shade_name,
    specsEl.shade_name
  );
  const colorDetail = firstText(
    facts.colorDetail,
    facts.color_detail,
    attributes.color_detail,
    specsEn.color_detail,
    specsEl.color_detail
  );
  const rawColor = firstColorText(facts, attributes, specsEn, specsEl);
  const colorEvidence = colorDetail ?? rawColor ?? brandShadeName;
  const explicitHex = firstHex(
    facts.canonicalHex,
    facts.canonical_hex,
    facts.officialHex,
    facts.official_hex,
    facts.colorHex,
    facts.color_hex,
    facts.shadeHex,
    facts.shade_hex,
    attributes.canonical_hex,
    attributes.official_hex,
    attributes.color_hex,
    attributes.hex_color,
    attributes.shade_hex,
    specsEn.canonical_hex,
    specsEn.official_hex,
    specsEn.color_hex,
    specsEn.hex_color,
    specsEn.shade_hex,
    specsEl.canonical_hex,
    specsEl.official_hex,
    specsEl.color_hex,
    specsEl.hex_color,
    specsEl.shade_hex,
    colorDetail,
    rawColor,
    brandShadeName
  );

  const namedResolved = resolveCatalogColor({
    color: colorEvidence,
    title: sourceTitle
  });
  const resolved = explicitHex
    ? {
        hex: explicitHex,
        label: colorDetail ?? rawColor ?? brandShadeName ?? namedResolved?.label ?? explicitHex,
        familyKey: namedResolved?.familyKey,
        shadeKey: namedResolved?.shadeKey ?? explicitHex.toLowerCase(),
        precision: "exact" as const
      }
    : namedResolved;

  const colorFamily = namedResolved?.familyKey ?? canonicalColorFamily(rawColor ?? colorDetail ?? brandShadeName);
  const shadeCode = officialShadeCode({
    enriched: firstText(facts.shadeCode, facts.shade_code, attributes.shade_code, specsEn.shade_code, specsEl.shade_code),
    title: sourceTitle
  });
  const finishText = firstText(facts.finish, attributes.finish, specsEn.finish, specsEl.finish, colorDetail, brandShadeName) ?? sourceTitle;
  const productTypeText = firstText(facts.productType, facts.product_type) ?? sourceTitle;
  const finish = inferColorFinish(finishText);
  const productType = inferColorProductType(productTypeText);
  const undertone = supportedUndertone(firstText(facts.undertone, attributes.undertone, specsEn.undertone, specsEl.undertone));
  const shadeConfidence = boundedConfidence(
    facts.shadeConfidence ?? facts.shade_confidence ?? attributes.shade_confidence ?? specsEn.shade_confidence
  );

  const provenanceText = JSON.stringify(factProvenance).toLowerCase();
  const enrichmentSource = firstText(
    attributes.shade_enrichment_source,
    attributes.color_enrichment_source,
    specsEn.shade_enrichment_source,
    specsEn.color_enrichment_source,
    specsEl.shade_enrichment_source,
    specsEl.color_enrichment_source
  )?.toLowerCase();
  const agentBacked = /(?:nail[_ -]?polish|color|colour|shade)[_ -]?agent/.test(provenanceText)
    || Boolean(enrichmentSource && /(?:agent|research)/.test(enrichmentSource));
  const directColorEvidence = Boolean(rawColor || colorDetail || brandShadeName);
  const sourceKind: SourceKind = explicitHex && provenanceText.includes("research")
    ? "research"
    : agentBacked
      ? "agent"
      : directColorEvidence
        ? "supplier"
        : "derived";

  const matchPrecision: ProfilePrecision = explicitHex
    ? "exact"
    : resolved && directColorEvidence
      ? "canonicalized"
      : resolved
        ? "family_estimate"
        : "unknown";
  const confidence = matchPrecision === "exact"
    ? Math.max(shadeConfidence ?? (sourceKind === "research" ? 0.98 : sourceKind === "agent" ? 0.94 : 0.9), 0.9)
    : matchPrecision === "canonicalized"
      ? Math.min(
          shadeConfidence ?? (resolved?.precision === "reference" ? 0.86 : 0.74),
          resolved?.precision === "reference" ? 0.92 : 0.82
        )
      : matchPrecision === "family_estimate"
        ? resolved?.precision === "reference" ? 0.52 : 0.42
        : 0;

  const canonicalHex = resolved ? normalizeHex(resolved.hex) : undefined;
  const lab = canonicalHex ? hexToLab(canonicalHex) : undefined;
  const sourceEvidence = {
    enrichmentSourceHash: text(row.enrichment_source_hash),
    brandName,
    shadeCode,
    brandShadeName,
    rawColor,
    colorDetail,
    undertone,
    finish,
    productType,
    canonicalHex,
    matchPrecision,
    sourceKind,
    shadeConfidence,
    title: sourceTitle
  };
  const sourceHash = createHash("sha256").update(JSON.stringify(sourceEvidence)).digest("hex");

  return {
    familyId: text(row.family_id) ?? undefined,
    supplierId: text(row.supplier_id) ?? undefined,
    externalProductId: text(row.external_product_id) ?? undefined,
    brandName: brandName ?? undefined,
    shadeCode,
    brandShadeName: brandShadeName ?? undefined,
    colorFamily,
    colorDetail: colorDetail ?? rawColor ?? undefined,
    undertone,
    finish,
    productType,
    canonicalHex,
    lab,
    matchPrecision,
    confidence,
    sourceKind,
    sourceHash,
    provenance: {
      sourceTitle,
      enrichmentSourceHash: text(row.enrichment_source_hash),
      factProvenance,
      shadeIdentity: {
        code: shadeCode ?? null,
        name: brandShadeName ?? null,
        confidence: shadeConfidence ?? null
      },
      colorEvidence: {
        family: colorFamily ?? null,
        detail: colorDetail ?? null,
        raw: rawColor ?? null,
        canonicalHex: canonicalHex ?? null,
        precision: matchPrecision
      }
    }
  };
}

function canonicalColorFamily(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return resolveCatalogColor({ color: value })?.familyKey;
}

function officialShadeCode(input: { enriched?: string; title: string }): string | undefined {
  const titleCode = input.title.match(/\b(?:EN\s?\d{2,4}|GC\s?[A-Z]?\d{1,3}|[A-Z]{1,3}\s?\d{2,4})\b/i)?.[0]
    ?.replace(/\s+/g, "")
    .toUpperCase();
  if (titleCode) return titleCode;

  const numericSegment = input.title.match(/,\s*(\d{2,4})\s*,/)?.[1];
  if (input.enriched && /^\d{2,4}$/.test(input.enriched) && numericSegment === input.enriched) return input.enriched;
  return input.enriched?.trim() || numericSegment;
}

const COLOR_ATTRIBUTE_KEYS = new Set([
  "color", "colour", "χρωμα",
  "color name", "colour name", "colorname", "colourname",
  "variant color", "variant colour", "variantcolor", "variantcolour",
  "primary color", "primary colour", "primarycolor", "primarycolour"
]);

function firstColorText(...records: readonly Record<string, unknown>[]): string | undefined {
  for (const source of records) {
    for (const [key, value] of Object.entries(source)) {
      if (!COLOR_ATTRIBUTE_KEYS.has(normalizeCatalogColorText(key))) continue;
      const candidate = text(value);
      if (candidate) return candidate;
    }
  }
  return undefined;
}

function firstHex(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const direct = normalizeHex(value);
    if (direct) return direct;
    const embedded = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i)?.[0];
    const candidate = embedded ? normalizeHex(embedded) : undefined;
    if (candidate) return candidate;
  }
  return undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function supportedUndertone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeText(value);
  if (/\bcool\b|ψυχρ/.test(normalized)) return "cool";
  if (/\bwarm\b|θερμ/.test(normalized)) return "warm";
  if (/\bneutral\b|ουδετερ/.test(normalized)) return "neutral";
  return undefined;
}

function boundedConfidence(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function batchSize(env: NodeJS.ProcessEnv): number {
  const value = Number(env.BLS_COLOR_PROFILE_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requiredText(value: unknown, label: string): string {
  const candidate = text(value);
  if (!candidate) throw new Error(`${label} is required`);
  return candidate;
}
