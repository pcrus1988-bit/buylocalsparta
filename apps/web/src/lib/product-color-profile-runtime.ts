import { createHash } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
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

const DEFAULT_BATCH_SIZE = 500;
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
      LEFT JOIN public.product_color_profiles existing
        ON existing.canonical_variant_id=cv.id
      WHERE c.code='nail-care-colour'
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

  for (const row of candidates.rows) {
    const canonicalVariantId = requiredText(row.canonical_variant_id, "canonical variant id");
    const profile = deriveProfile(row);
    if (!profile.canonicalHex) unresolved += 1;

    if (text(row.existing_profile_source_hash) === profile.sourceHash) {
      unchanged += 1;
      unchangedIds.push(canonicalVariantId);
      continue;
    }

    await pool.query(`
      INSERT INTO public.product_color_profiles(
        canonical_variant_id,family_id,supplier_id,external_product_id,
        brand_name,shade_code,brand_shade_name,color_family,color_detail,undertone,
        finish,product_type,canonical_hex,lab_l,lab_a,lab_b,
        match_precision,confidence,source_kind,source_hash,provenance,profiled_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,
        $5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21::jsonb,now()
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
    `, [
      canonicalVariantId,
      profile.familyId ?? null,
      profile.supplierId ?? null,
      profile.externalProductId ?? null,
      profile.brandName ?? null,
      profile.shadeCode ?? null,
      profile.brandShadeName ?? null,
      profile.colorFamily ?? null,
      profile.colorDetail ?? null,
      profile.undertone ?? null,
      profile.finish,
      profile.productType,
      profile.canonicalHex ?? null,
      profile.lab?.l ?? null,
      profile.lab?.a ?? null,
      profile.lab?.b ?? null,
      profile.matchPrecision,
      profile.confidence,
      profile.sourceKind,
      profile.sourceHash,
      JSON.stringify(profile.provenance)
    ]);
    updated += 1;
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

  const explicitHex = firstHex(
    facts.canonicalHex,
    facts.canonical_hex,
    facts.officialHex,
    facts.official_hex,
    attributes.canonical_hex,
    attributes.official_hex,
    attributes.shade_hex,
    specsEn.canonical_hex,
    specsEn.official_hex,
    specsEn.shade_hex,
    specsEl.canonical_hex,
    specsEl.official_hex,
    specsEl.shade_hex
  );

  const brandShadeName = firstText(
    facts.brandShadeName,
    facts.brand_shade_name,
    attributes.shade_name,
    specsEn.shade_name,
    specsEl.shade_name
  );
  const colorDetail = firstText(
    facts.colorDetail,
    facts.color_detail,
    attributes.color_detail,
    specsEn.color_detail,
    specsEl.color_detail
  );
  const rawColor = firstText(
    facts.color,
    attributes.color,
    specsEn.color,
    specsEl.color,
    specsEl["Χρώμα"]
  );
  const colorEvidence = colorDetail ?? rawColor ?? brandShadeName ?? sourceTitle;
  const resolved = explicitHex
    ? { hex: explicitHex, label: colorDetail ?? rawColor ?? brandShadeName ?? explicitHex }
    : resolveCatalogColor({ color: colorEvidence, title: sourceTitle });

  const colorFamily = canonicalColorFamily(rawColor ?? colorDetail ?? brandShadeName ?? resolved?.label);
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
  const agentBacked = provenanceText.includes("nail_polish_agent")
    || firstText(attributes.shade_enrichment_source, specsEn.shade_enrichment_source)?.includes("nail_polish_agent");
  const sourceKind: SourceKind = explicitHex && provenanceText.includes("research")
    ? "research"
    : agentBacked
      ? "agent"
      : rawColor
        ? "supplier"
        : "derived";

  const matchPrecision: ProfilePrecision = explicitHex
    ? "exact"
    : resolved && (rawColor || colorDetail || brandShadeName)
      ? "canonicalized"
      : resolved
        ? "family_estimate"
        : "unknown";
  const confidence = matchPrecision === "exact"
    ? Math.max(shadeConfidence ?? 0.9, 0.9)
    : matchPrecision === "canonicalized"
      ? Math.min(shadeConfidence ?? 0.72, 0.82)
      : matchPrecision === "family_estimate"
        ? 0.45
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
  const normalized = normalizeText(value);
  const families: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["black", ["black","μαυρ"]],
    ["white", ["white","ivory","milky","λευκ"]],
    ["grey", ["grey","gray","gris","γκρι"]],
    ["red", ["red","rouge","scarlet","cherry","κοκκιν"]],
    ["pink", ["pink","rose","rosé","blush","fuchsia","ροζ","φουξ"]],
    ["purple", ["purple","violet","lilac","lavender","plum","mauve","grape","μωβ"]],
    ["blue", ["blue","navy","cobalt","midnight","μπλε"]],
    ["green", ["green","emerald","olive","mint","πρασιν"]],
    ["orange", ["orange","coral","peach","salmon","terracotta","πορτοκαλ","κοραλ"]],
    ["brown", ["brown","chocolate","mocha","caramel","bronze","καφε"]],
    ["nude", ["nude","beige","taupe","natural","μπεζ"]],
    ["gold", ["gold","champagne","χρυσ"]],
    ["silver", ["silver","chrome","ασημ"]]
  ];
  return families.find(([, tokens]) => tokens.some((token) => normalized.includes(token)))?.[0];
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

function firstHex(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = typeof value === "string" ? normalizeHex(value) : undefined;
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
