import { formatMoney, money } from "@buy-local-sparta/core";
import { getCatalogCard } from "../../../../lib/catalog-view";
import {
  buildCustomerGuide,
  calculateBuildQuantity,
  resolveBuildProjectGuidance
} from "../../../../lib/build-guidance-runtime";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import {
  PROJECT_ACCESSORY_RULES,
  calculateVerifiedPaintQuantity,
  extractManufacturerComponentNames,
  choosePaintPackPlan,
  variantRouteKey,
  type PaintBuildPackVariant
} from "../../../../lib/paint-build-project-kit";
import { getVisitorKey } from "../../../../lib/visitor";
import {
  paintBuildGreekText,
  paintBuildManufacturerDescription,
  paintBuildProductTitle
} from "../../../../lib/paint-build-greek-presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = Readonly<{
  scenarioKey?: unknown;
  facts?: unknown;
  manufacturerProductId?: unknown;
  areaM2?: unknown;
  selectedVariantId?: unknown;
  postcode?: unknown;
}>;

type FamilyVariantRow = Readonly<{
  canonical_public_id: string;
  title: string;
  price_minor: number | string;
  pack_value: number | string | null;
  pack_unit: string | null;
  colour_hint: string | null;
  tint_base_hint: string | null;
  finish_hint: string | null;
  image_url: string | null;
}>;

type FamilyVariant = PaintBuildPackVariant & Readonly<{
  price: string;
  imageUrl?: string;
}>;

type ProfileRow = Readonly<{
  coverage_m2_per_litre_min: number | string | null;
  coverage_m2_per_litre_max: number | string | null;
  number_of_coats_min: number | string | null;
  number_of_coats_max: number | string | null;
  dry_to_touch_minutes_min: number | null;
  dry_to_touch_minutes_max: number | null;
  recoat_minutes_min: number | null;
  recoat_minutes_max: number | null;
  primer_required: boolean | null;
  recommended_primers: string[];
  required_system_components: string[];
  application_methods: string[];
  recommended_roller: string | null;
  recommended_brush: string | null;
  surface_preparation: string[];
  safety_warnings: string[];
  manufacturer_do_not_do: string[];
  coverage_conditions: string | null;
}>;

type RequiredRelationshipRow = Readonly<{
  target_product_id: string;
  target_product_name: string;
  relationship_type: string;
}>;

type ScenarioEligibilityRow = Readonly<{
  rule_key: string;
  result_status: string;
  actions: Record<string, unknown>;
  evidence_field_name: string | null;
  evidence_value: unknown;
}>;

type CoverageEvidenceRow = Readonly<{
  normalized_value: unknown;
}>;

type ManufacturerProductLookupRow = Readonly<{
  id: string;
  product_name: string;
  verification_status: string;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scenarioPattern = /^[a-z0-9_]{1,96}$/;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result && result.length <= max ? result : undefined;
}

function numberValue(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function safeFacts(value: unknown): Readonly<Record<string, unknown>> {
  if (value == null) return {};
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("INVALID_FACTS");
  const serialized = JSON.stringify(value);
  if (serialized.length > 12000) throw new Error("INVALID_FACTS");
  return value as Readonly<Record<string, unknown>>;
}

function safeMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function familyVariant(row: FamilyVariantRow): FamilyVariant | undefined {
  const priceMinor = safeMinor(row.price_minor);
  const packValue = numberValue(row.pack_value);
  const packUnit = row.pack_unit?.trim();
  if (!row.canonical_public_id || !row.title || !priceMinor || !packValue || !packUnit) return undefined;
  return {
    id: row.canonical_public_id,
    title: row.title,
    priceMinor,
    price: formatMoney(money(priceMinor)),
    packValue,
    packUnit,
    colourHint: row.colour_hint?.trim() || undefined,
    tintBaseHint: row.tint_base_hint?.trim() || undefined,
    finishHint: row.finish_hint?.trim() || undefined,
    imageUrl: row.image_url?.trim() || undefined
  };
}

async function readFamily(manufacturerProductId: string) {
  const db = getProductionPostgresRuntime().nativePool;
  const [product, variants] = await Promise.all([
    db.query<{
      product_name: string;
      brand_name: string;
      product_category: string | null;
      subcategory: string | null;
      interior_exterior: string | null;
      substrate_types: string[] | null;
    }>(
      `select product_name,brand_name,product_category,subcategory,interior_exterior,substrate_types
       from public.manufacturer_products
       where id=$1::uuid
         and product_system_status='current'
         and verification_status='verified'
         and (valid_from is null or valid_from<=current_date)
         and (valid_to is null or valid_to>=current_date)
       limit 1`,
      [manufacturerProductId]
    ),
    db.query<FamilyVariantRow>(
      `select distinct on (cv.public_id)
          cv.public_id as canonical_public_id,
          coalesce(nullif(el.title,''),nullif(en.title,''),nullif(vcp.product_title,''),cv.slug) as title,
          vcp.price_minor,
          vcp.pack_value,
          vcp.pack_unit,
          vcp.colour_hint,
          vcp.tint_base_hint,
          vcp.finish_hint,
          nullif(csp.source_image_url,'') as image_url
       from public.vendor_catalog_assortments vca
       join public.vendor_businesses vendor on vendor.id=vca.vendor_id and vendor.status='active'
       join public.vendor_locations location on location.id=vca.location_id and location.active=true
       join public.catalog_source_products csp on csp.id=vca.source_product_id
       join public.catalog_sources cs on cs.id=csp.source_id and cs.code='vitex-commerce-media' and cs.active=true
       join public.vitex_commerce_products vcp
         on vcp.import_fingerprint=csp.source_product_key
        and vcp.active=true
        and vcp.match_status in ('verified','product_matched')
        and vcp.manufacturer_product_id=$1::uuid
        and vcp.canonical_variant_id is not null
       join public.canonical_variants cv
         on cv.id=vcp.canonical_variant_id
        and cv.active=true and cv.suppressed=false and cv.recalled=false
        and coalesce(cv.commerce_channel,'normal')='normal'
       left join public.product_translations el on el.canonical_variant_id=cv.id and el.locale='el'
       left join public.product_translations en on en.canonical_variant_id=cv.id and en.locale='en'
       where vca.assortment_status not in ('rejected','discontinued')
         and vcp.price_minor>0
       order by cv.public_id,vca.updated_at desc`,
      [manufacturerProductId]
    )
  ]);
  if (!product.rowCount) throw new Error("MANUFACTURER_PRODUCT_NOT_FOUND");
  const manufacturerName = product.rows[0].product_name;
  const mapped = variants.rows
    .map(familyVariant)
    .filter((value): value is FamilyVariant => Boolean(value))
    .map((variant) => ({ ...variant, title: paintBuildProductTitle(variant.title, manufacturerName) }));
  const manufacturer = product.rows[0];
  return {
    manufacturerProductId,
    title: manufacturerName,
    brand: manufacturer.brand_name || "VITEX",
    descriptionEl: paintBuildManufacturerDescription({
      productName: manufacturerName,
      productCategory: manufacturer.product_category,
      subcategory: manufacturer.subcategory,
      interiorExterior: manufacturer.interior_exterior,
      substrateTypes: manufacturer.substrate_types
    }),
    imageUrl: mapped.find((variant) => variant.imageUrl)?.imageUrl,
    variants: mapped
  };
}

async function readProfile(manufacturerProductId: string): Promise<ProfileRow | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<ProfileRow>(
    `select
       coverage_m2_per_litre_min,coverage_m2_per_litre_max,
       number_of_coats_min,number_of_coats_max,
       dry_to_touch_minutes_min,dry_to_touch_minutes_max,
       recoat_minutes_min,recoat_minutes_max,
       primer_required,recommended_primers,required_system_components,
       application_methods,recommended_roller,recommended_brush,
       surface_preparation,safety_warnings,manufacturer_do_not_do,coverage_conditions
     from public.manufacturer_application_profiles
     where product_id=$1::uuid
       and source_layer='manufacturer'
       and verification_status='verified'
       and is_current=true
       and (valid_from is null or valid_from<=current_date)
       and (valid_to is null or valid_to>=current_date)
     order by last_verified_at desc nulls last,updated_at desc
     limit 1`,
    [manufacturerProductId]
  );
  return result.rows[0];
}

async function readScenarioEligibility(manufacturerProductId: string, scenarioKey: string): Promise<ScenarioEligibilityRow | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<ScenarioEligibilityRow>(
    `select
       ar.rule_key,
       ar.result_status,
       ar.actions,
       ie.field_name as evidence_field_name,
       ie.normalized_value as evidence_value
     from public.manufacturer_application_rules ar
     join public.manufacturer_instruction_evidence ie on ie.id=ar.source_evidence_id and ie.is_current=true
     join public.manufacturer_technical_sources ts on ts.id=ie.source_id and ts.is_current=true
     where ar.product_id=$1::uuid
       and ar.source_layer='manufacturer'
       and ar.active=true
       and ar.condition_expression->>'scenario_key'=$2
       and ar.result_status in ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
       and (ar.valid_from is null or ar.valid_from<=current_date)
       and (ar.valid_to is null or ar.valid_to>=current_date)
     order by ar.priority desc,ar.rule_key
     limit 1`,
    [manufacturerProductId, scenarioKey]
  );
  return result.rows[0];
}

async function readCoverageEvidence(manufacturerProductId: string): Promise<CoverageEvidenceRow | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<CoverageEvidenceRow>(
    `select ie.normalized_value
     from public.manufacturer_instruction_evidence ie
     join public.manufacturer_technical_sources ts on ts.id=ie.source_id and ts.is_current=true
     where ie.product_id=$1::uuid
       and ie.source_layer='manufacturer'
       and ie.field_name='coverage_m2_per_litre'
       and ie.is_current=true
       and (ie.valid_from is null or ie.valid_from<=current_date)
       and (ie.valid_to is null or ie.valid_to>=current_date)
     order by ie.confidence desc nulls last,ie.created_at desc
     limit 1`,
    [manufacturerProductId]
  );
  return result.rows[0];
}

function twoCoatCoverage(value: unknown): Readonly<{ min: number; max: number }> | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const raw = (value as Record<string, unknown>).two_coats;
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const first = numberValue(raw[0]);
  const second = numberValue(raw[1]);
  if (!first || !second || first <= 0 || second <= 0) return undefined;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

function manufacturerQuantityFromProfile(
  profile: ProfileRow | undefined,
  areaM2: number,
  coverageEvidence?: CoverageEvidenceRow
) {
  if (!profile) return undefined;
  const aggregate = twoCoatCoverage(coverageEvidence?.normalized_value);
  return calculateVerifiedPaintQuantity({
    areaM2,
    coverageMin: numberValue(profile.coverage_m2_per_litre_min),
    coverageMax: numberValue(profile.coverage_m2_per_litre_max),
    coatsMin: numberValue(profile.number_of_coats_min),
    coatsMax: numberValue(profile.number_of_coats_max),
    twoCoatCoverageMin: aggregate?.min,
    twoCoatCoverageMax: aggregate?.max
  });
}

async function lookupManufacturerProductByName(name: string): Promise<ManufacturerProductLookupRow | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<ManufacturerProductLookupRow>(
    `select id::text,product_name,verification_status
     from public.manufacturer_products
     where lower(product_name)=lower($1)
       and product_system_status='current'
       and (valid_from is null or valid_from<=current_date)
       and (valid_to is null or valid_to>=current_date)
     order by (verification_status='verified') desc,updated_at desc
     limit 1`,
    [name]
  );
  return result.rows[0];
}

async function requiredRelationships(manufacturerProductId: string): Promise<readonly RequiredRelationshipRow[]> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<RequiredRelationshipRow>(
    `select distinct
       target.id::text as target_product_id,
       target.product_name as target_product_name,
       relation.relationship_type
     from public.manufacturer_product_compatibility relation
     join public.manufacturer_products target
       on target.id=relation.target_product_id
      and target.product_system_status='current'
      and target.verification_status='verified'
     join public.manufacturer_instruction_evidence ie
       on ie.id=relation.source_evidence_id and ie.is_current=true
     join public.manufacturer_technical_sources ts
       on ts.id=ie.source_id and ts.is_current=true
     where relation.source_product_id=$1::uuid
       and relation.relationship_strength='required'
       and relation.is_current=true
       and (relation.valid_from is null or relation.valid_from<=current_date)
       and (relation.valid_to is null or relation.valid_to>=current_date)
     order by target.product_name,relation.relationship_type`,
    [manufacturerProductId]
  );
  return result.rows;
}

async function categoryCandidateIds(categoryCode: string): Promise<readonly string[]> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{ public_id: string }>(
    `select cv.public_id
     from public.canonical_variants cv
     join public.categories category on category.id=cv.category_id
     where category.code=$1
       and category.active=true
       and cv.active=true and cv.suppressed=false and cv.recalled=false
       and coalesce(cv.commerce_channel,'normal')='normal'
     order by cv.platform_price_minor asc nulls last,cv.updated_at desc
     limit 12`,
    [categoryCode]
  );
  return result.rows.map((row) => row.public_id);
}

async function accessoryItems(areaM2: number) {
  const visitorKey = await getVisitorKey();
  const rows = await Promise.all(PROJECT_ACCESSORY_RULES.map(async (rule) => {
    const ids = await categoryCandidateIds(rule.categoryCode);
    const cards = await Promise.all(ids.map((id) => getCatalogCard(id, visitorKey).catch(() => undefined)));
    const candidate = cards.find((card) => card && card.available && card.availableToSell > 0 && card.priceMinor > 0);
    if (!candidate) {
      return {
        ruleKey: rule.key,
        label: rule.labelEl,
        categoryCode: rule.categoryCode,
        role: rule.role,
        status: "catalogue_missing" as const
      };
    }
    const quantity = rule.quantityForArea(areaM2);
    return {
      ruleKey: rule.key,
      label: rule.labelEl,
      categoryCode: rule.categoryCode,
      role: rule.role,
      status: "ready" as const,
      item: {
        canonicalVariantId: candidate.id,
        title: candidate.title,
        priceMinor: candidate.priceMinor,
        price: candidate.price,
        quantity,
        imageUrl: candidate.mediaId ? `/api/media/${encodeURIComponent(candidate.mediaId)}` : undefined,
        selected: rule.role === "recommended_working",
        required: false,
        role: rule.role,
        sourceLayer: "KONTA_MOU_RULE" as const,
        reasonEl: rule.role === "recommended_working"
          ? "Πρόταση ΚΟΝΤΑ ΜΟΥ βάσει τύπου και μεγέθους έργου — όχι οδηγία VITEX."
          : "Προαιρετικό υλικό ευκολίας από τους κανόνες υλικών του έργου."
      }
    };
  }));
  return rows;
}

async function requiredSystemItems(manufacturerProductId: string, areaM2: number) {
  const relationships = await requiredRelationships(manufacturerProductId);
  const ready: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];

  for (const relationship of relationships) {
    const [family, profile, coverageEvidence] = await Promise.all([
      readFamily(relationship.target_product_id).catch(() => undefined),
      readProfile(relationship.target_product_id),
      readCoverageEvidence(relationship.target_product_id)
    ]);
    if (!family?.variants.length) {
      unresolved.push({
        manufacturerProductId: relationship.target_product_id,
        title: relationship.target_product_name,
        relationshipType: relationship.relationship_type,
        reason: "required_component_not_available"
      });
      continue;
    }
    const quantity = manufacturerQuantityFromProfile(profile, areaM2, coverageEvidence);
    if (!quantity) {
      unresolved.push({
        manufacturerProductId: relationship.target_product_id,
        title: relationship.target_product_name,
        relationshipType: relationship.relationship_type,
        reason: "required_component_quantity_unverified"
      });
      continue;
    }

    const routeGroups = new Map<string, FamilyVariant[]>();
    for (const variant of family.variants) {
      const key = variantRouteKey(variant);
      routeGroups.set(key, [...(routeGroups.get(key) ?? []), variant]);
    }
    const plans = [...routeGroups.values()]
      .map((variants) => choosePaintPackPlan(variants, quantity.max))
      .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan))
      .sort((a, b) => a.totalPriceMinor - b.totalPriceMinor || a.surplusLitres - b.surplusLitres);
    const plan = plans[0];
    if (!plan) {
      unresolved.push({
        manufacturerProductId: relationship.target_product_id,
        title: relationship.target_product_name,
        relationshipType: relationship.relationship_type,
        reason: "required_component_pack_plan_unavailable"
      });
      continue;
    }
    for (const line of plan.lines) {
      const variant = family.variants.find((item) => item.id === line.variant.id);
      if (!variant) continue;
      ready.push({
        canonicalVariantId: variant.id,
        title: variant.title,
        priceMinor: variant.priceMinor,
        price: variant.price,
        quantity: line.quantity,
        imageUrl: variant.imageUrl,
        selected: true,
        required: true,
        role: "required_system",
        sourceLayer: "MANUFACTURER_VITEX",
        reasonEl: "ΑΠΑΡΑΙΤΗΤΟ ΓΙΑ ΤΟ ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΥΣΤΗΜΑ",
        manufacturerProductId: relationship.target_product_id
      });
    }
  }
  return { ready, unresolved };
}

async function scenarioRequiredSystemItems(eligibility: ScenarioEligibilityRow | undefined, areaM2: number) {
  const ready: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];
  if (!eligibility || !["requires_specific_primer", "requires_system_component"].includes(eligibility.result_status)) {
    return { ready, unresolved };
  }

  const names = extractManufacturerComponentNames(eligibility.actions, eligibility.evidence_value);
  if (names.length !== 1) {
    unresolved.push({
      relationshipType: eligibility.result_status,
      title: names.join(" / ") || "Απαιτούμενο συστατικό συστήματος",
      reason: names.length > 1 ? "required_component_choice_needed" : "required_component_evidence_unresolved",
      choices: names
    });
    return { ready, unresolved };
  }

  const target = await lookupManufacturerProductByName(names[0]);
  if (!target) {
    unresolved.push({
      title: names[0],
      relationshipType: eligibility.result_status,
      reason: "required_component_not_in_manufacturer_catalogue"
    });
    return { ready, unresolved };
  }
  if (target.verification_status !== "verified") {
    unresolved.push({
      manufacturerProductId: target.id,
      title: target.product_name,
      relationshipType: eligibility.result_status,
      reason: "required_component_not_yet_verified"
    });
    return { ready, unresolved };
  }

  const [family, profile, coverageEvidence] = await Promise.all([
    readFamily(target.id).catch(() => undefined),
    readProfile(target.id),
    readCoverageEvidence(target.id)
  ]);
  if (!family?.variants.length) {
    unresolved.push({
      manufacturerProductId: target.id,
      title: target.product_name,
      relationshipType: eligibility.result_status,
      reason: "required_component_not_available"
    });
    return { ready, unresolved };
  }

  const quantity = manufacturerQuantityFromProfile(profile, areaM2, coverageEvidence);
  if (!quantity) {
    unresolved.push({
      manufacturerProductId: target.id,
      title: target.product_name,
      relationshipType: eligibility.result_status,
      reason: "required_component_quantity_unverified"
    });
    return { ready, unresolved };
  }

  const routeGroups = new Map<string, FamilyVariant[]>();
  for (const variant of family.variants) {
    const key = variantRouteKey(variant);
    routeGroups.set(key, [...(routeGroups.get(key) ?? []), variant]);
  }
  const plans = [...routeGroups.values()]
    .map((variants) => choosePaintPackPlan(variants, quantity.max))
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan))
    .sort((a, b) => a.totalPriceMinor - b.totalPriceMinor || a.surplusLitres - b.surplusLitres);
  const plan = plans[0];
  if (!plan) {
    unresolved.push({
      manufacturerProductId: target.id,
      title: target.product_name,
      relationshipType: eligibility.result_status,
      reason: "required_component_pack_plan_unavailable"
    });
    return { ready, unresolved };
  }

  for (const line of plan.lines) {
    const variant = family.variants.find((item) => item.id === line.variant.id);
    if (!variant) continue;
    ready.push({
      canonicalVariantId: variant.id,
      title: variant.title,
      priceMinor: variant.priceMinor,
      price: variant.price,
      quantity: line.quantity,
      imageUrl: variant.imageUrl,
      selected: true,
      required: true,
      role: "required_system",
      sourceLayer: "MANUFACTURER_VITEX",
      reasonEl: eligibility.result_status === "requires_specific_primer"
        ? "ΑΠΑΡΑΙΤΗΤΟ ΑΣΤΑΡΙ ΓΙΑ ΤΟ ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΕΝΑΡΙΟ VITEX"
        : "ΑΠΑΡΑΙΤΗΤΟ ΣΥΣΤΑΤΙΚΟ ΓΙΑ ΤΟ ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΥΣΤΗΜΑ VITEX",
      manufacturerProductId: target.id
    });
  }
  return { ready, unresolved };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const scenarioKey = text(body.scenarioKey, 96);
    const manufacturerProductId = text(body.manufacturerProductId, 64);
    const selectedVariantId = text(body.selectedVariantId, 128);
    const postcode = text(body.postcode, 16) ?? "23100";
    const areaM2 = numberValue(body.areaM2);
    const facts = safeFacts(body.facts);
    if (!scenarioKey || !scenarioPattern.test(scenarioKey)) throw new Error("INVALID_SCENARIO");
    if (!manufacturerProductId || !uuidPattern.test(manufacturerProductId)) throw new Error("INVALID_MANUFACTURER_PRODUCT");
    if (!areaM2 || areaM2 < 1 || areaM2 > 100000) throw new Error("INVALID_AREA");

    const guidance = await resolveBuildProjectGuidance({
      scenarioKey,
      facts,
      manufacturerProductId
    });
    if (guidance.status !== "ready" || guidance.blocked || guidance.guidance_conflict) {
      return Response.json({
        error: "guidance_not_ready",
        guidanceStatus: guidance.status,
        blocked: guidance.blocked,
        guidanceConflict: guidance.guidance_conflict
      }, { status: 409, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const [family, profile, eligibility, coverageEvidence] = await Promise.all([
      readFamily(manufacturerProductId),
      readProfile(manufacturerProductId),
      readScenarioEligibility(manufacturerProductId, scenarioKey),
      readCoverageEvidence(manufacturerProductId)
    ]);
    if (!family.variants.length) {
      return Response.json({ error: "family_not_available" }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const runtimeQuantity = calculateBuildQuantity(guidance, areaM2);
    const aggregateCoverage = twoCoatCoverage(coverageEvidence?.normalized_value);
    const verifiedQuantity = manufacturerQuantityFromProfile(profile, areaM2, coverageEvidence);
    const quantityEstimate = runtimeQuantity.status === "available" || !verifiedQuantity
      ? runtimeQuantity
      : {
          status: "available" as const,
          areaM2,
          unit: "L" as const,
          min: verifiedQuantity.min,
          max: verifiedQuantity.max,
          coatsMin: verifiedQuantity.coatsMin,
          coatsMax: verifiedQuantity.coatsMax,
          basisEl: verifiedQuantity.basis === "manufacturer_two_coat_coverage"
            ? "Θεωρητική ποσότητα απευθείας από την επαληθευμένη κάλυψη δύο στρώσεων που δημοσιεύει η VITEX. Δεν προστέθηκε γενικός συντελεστής απωλειών."
            : "Θεωρητική ποσότητα από επαληθευμένα m²/L και αριθμό στρώσεων VITEX."
        };
    const customerGuide = buildCustomerGuide(guidance);
    const technical = {
      eligibility: eligibility?.result_status,
      ruleKey: eligibility?.rule_key,
      whySuitable: typeof eligibility?.actions?.message === "string" ? paintBuildGreekText(eligibility.actions.message) : undefined,
      coverageM2PerLitre: profile ? {
        min: numberValue(profile.coverage_m2_per_litre_min),
        max: numberValue(profile.coverage_m2_per_litre_max),
        conditions: profile.coverage_conditions ? paintBuildGreekText(profile.coverage_conditions) : undefined
      } : undefined,
      coats: profile ? {
        min: numberValue(profile.number_of_coats_min) ?? verifiedQuantity?.coatsMin,
        max: numberValue(profile.number_of_coats_max) ?? verifiedQuantity?.coatsMax
      } : undefined,
      twoCoatCoverageM2PerLitre: aggregateCoverage,
      dryToTouchMinutes: profile ? {
        min: profile.dry_to_touch_minutes_min,
        max: profile.dry_to_touch_minutes_max
      } : undefined,
      recoatMinutes: profile ? {
        min: profile.recoat_minutes_min,
        max: profile.recoat_minutes_max
      } : undefined,
      primerRequired: profile?.primer_required ?? (eligibility?.result_status === "requires_specific_primer" ? true : undefined),
      recommendedPrimers: profile?.recommended_primers ?? [],
      requiredSystemComponents: profile?.required_system_components ?? [],
      applicationMethods: (profile?.application_methods ?? []).map(paintBuildGreekText),
      recommendedRoller: profile?.recommended_roller ? paintBuildGreekText(profile.recommended_roller) : undefined,
      recommendedBrush: profile?.recommended_brush ? paintBuildGreekText(profile.recommended_brush) : undefined,
      preparation: (profile?.surface_preparation ?? []).map(paintBuildGreekText),
      warnings: [...(profile?.safety_warnings ?? []), ...(profile?.manufacturer_do_not_do ?? [])].map(paintBuildGreekText)
    };

    if (!selectedVariantId) {
      return Response.json({
        family,
        technical,
        quantityEstimate,
        customerGuide,
        postcode
      }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const selectedVariant = family.variants.find((variant) => variant.id === selectedVariantId);
    if (!selectedVariant) {
      return Response.json({ error: "selected_variant_not_in_family" }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const routeKey = variantRouteKey(selectedVariant);
    const routeVariants = family.variants.filter((variant) => variantRouteKey(variant) === routeKey);
    const packPlan = quantityEstimate.status === "available" && quantityEstimate.max
      ? choosePaintPackPlan(routeVariants, quantityEstimate.max)
      : undefined;

    const [required, scenarioRequired, accessories] = await Promise.all([
      requiredSystemItems(manufacturerProductId, areaM2),
      scenarioRequiredSystemItems(eligibility, areaM2),
      accessoryItems(areaM2)
    ]);

    const coatingItems = packPlan?.lines.flatMap((line) => {
      const variant = family.variants.find((item) => item.id === line.variant.id);
      if (!variant) return [];
      return [{
        canonicalVariantId: variant.id,
        title: variant.title,
        priceMinor: variant.priceMinor,
        price: variant.price,
        quantity: line.quantity,
        imageUrl: variant.imageUrl,
        selected: true,
        required: true,
        role: "required_system" as const,
        sourceLayer: "MANUFACTURER_VITEX" as const,
        reasonEl: "Κύριο υλικό του επαληθευμένου συστήματος · ποσότητα από επαληθευμένη κάλυψη VITEX και αριθμό στρώσεων.",
        manufacturerProductId
      }];
    }) ?? [];

    const accessoryReady = accessories.flatMap((entry) => entry.status === "ready" ? [entry.item] : []);
    const accessoryMissing = accessories.flatMap((entry) => entry.status === "catalogue_missing" ? [{
      ruleKey: entry.ruleKey,
      label: entry.label,
      categoryCode: entry.categoryCode,
      role: entry.role
    }] : []);

    const requiredQuantityResolved = quantityEstimate.status === "available" && Boolean(packPlan);
    const allUnresolvedRequired = [...required.unresolved, ...scenarioRequired.unresolved];
    const complete = requiredQuantityResolved && allUnresolvedRequired.length === 0;

    return Response.json({
      family,
      technical,
      quantityEstimate,
      customerGuide,
      packPlan,
      selectedVariantId,
      kit: {
        complete,
        completenessReasons: [
          ...(!requiredQuantityResolved ? ["main_product_quantity_unverified"] : []),
          ...allUnresolvedRequired.map((item) => String(item.reason))
        ],
        items: [...coatingItems, ...required.ready, ...scenarioRequired.ready, ...accessoryReady],
        unresolvedRequired: allUnresolvedRequired,
        unavailableAccessorySlots: accessoryMissing
      }
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validation = /^INVALID_/.test(message);
    if (!validation) {
      console.error(JSON.stringify({ level: "error", event: "build_studio.project_kit_failed", message }));
    }
    return Response.json({
      error: validation ? message.toLocaleLowerCase("en") : "project_kit_unavailable"
    }, {
      status: validation ? 400 : 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
