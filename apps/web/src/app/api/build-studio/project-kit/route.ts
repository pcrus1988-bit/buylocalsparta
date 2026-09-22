import { formatMoney, money } from "@buy-local-sparta/core";
import { buildCustomerGuide, calculateBuildQuantity, resolveBuildProjectGuidance, validateBuildGuidanceInput, type BuildProjectGuidance, type BuildQuantityEstimate } from "../../../../lib/build-guidance-runtime";
import { getCatalogCard } from "../../../../lib/catalog-view";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { getShopCatalogPage } from "../../../../lib/shop-catalog-page";
import { getVisitorKey } from "../../../../lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectKitRequest = Readonly<{
  scenarioKey?: unknown;
  facts?: unknown;
  manufacturerProductId?: unknown;
  catalogueId?: unknown;
  areaM2?: unknown;
  postcode?: unknown;
}>;

type SelectedProductRow = Readonly<{
  canonical_uuid: string;
  canonical_public_id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  price_minor: number | string | null;
  source_image_url: string | null;
  variant_attributes: unknown;
  vendor_name: string | null;
}>;

type AccessoryDefinition = Readonly<{
  key: string;
  label: string;
  query: string;
  reasonEl: string;
  enabled: boolean;
  quantity: number;
  preselected: boolean;
}>;

const accessoryCategoryCodes = new Set([
  "hardware-tools-paint",
  "hand-tools",
  "tool-accessories-consumables"
]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result ? result.slice(0, max) : undefined;
}

function positive(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function evidenceQuantity(guidance: BuildProjectGuidance, areaM2: number): BuildQuantityEstimate | undefined {
  const manufacturer = object(guidance.manufacturer_guidance);
  const evidence = Array.isArray(manufacturer.instruction_evidence) ? manufacturer.instruction_evidence : [];
  for (const item of evidence) {
    const row = object(item);
    if (row.field_name !== "coverage_m2_per_litre") continue;
    const normalized = object(row.normalized_value);
    const twoCoats = Array.isArray(normalized.two_coats) ? normalized.two_coats.map(Number).filter(Number.isFinite) : [];
    if (twoCoats.length < 2 || twoCoats.some((entry) => entry <= 0)) continue;
    const coverageMin = Math.min(...twoCoats);
    const coverageMax = Math.max(...twoCoats);
    return {
      status: "available",
      areaM2,
      unit: "L",
      min: rounded(areaM2 / coverageMax),
      max: rounded(areaM2 / coverageMin),
      coatsMin: 2,
      coatsMax: 2,
      basisEl: `Θεωρητική ποσότητα από την επαληθευμένη απόδοση δύο στρώσεων του κατασκευαστή (${coverageMin}–${coverageMax} m²/L). Δεν προστέθηκε αυθαίρετος συντελεστής απωλειών.`
    };
  }
  return undefined;
}

function resolvedQuantity(guidance: BuildProjectGuidance, areaM2: number): BuildQuantityEstimate {
  const direct = calculateBuildQuantity(guidance, areaM2);
  if (direct.status === "available") return direct;
  return evidenceQuantity(guidance, areaM2) ?? direct;
}

function allowedAccessoryCategory(code: string): boolean {
  return code.startsWith("paint-decorating") || accessoryCategoryCodes.has(code);
}

function packInfo(value: unknown): { amount?: number; unit?: string } {
  const attributes = object(value);
  return {
    amount: positive(attributes.pack_value),
    unit: text(attributes.pack_unit, 12)?.toUpperCase()
  };
}

async function selectedProduct(catalogueId: string, manufacturerProductId: string): Promise<SelectedProductRow | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<SelectedProductRow>(`
    SELECT
      cv.id AS canonical_uuid,
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(vcp.product_title,''),cv.slug) AS title,
      COALESCE(NULLIF(b.name,''),NULLIF(pfb.name,''),'VITEX') AS brand_name,
      COALESCE(vcp.price_minor,cv.platform_price_minor) AS price_minor,
      NULLIF(csp.source_image_url,'') AS source_image_url,
      cv.variant_attributes,
      vendor_pick.vendor_name
    FROM public.canonical_variants cv
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en
      ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN public.product_families pf ON pf.id=cv.family_id
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.brands pfb ON pfb.id=pf.brand_id
    LEFT JOIN public.vitex_commerce_products vcp
      ON vcp.canonical_variant_id=cv.id
     AND vcp.manufacturer_product_id=$2::uuid
     AND vcp.active=true
     AND vcp.match_status='verified'
    LEFT JOIN public.catalog_source_products csp
      ON csp.source_product_key=vcp.import_fingerprint
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name
      FROM public.vendor_catalog_assortments vca
      JOIN public.vendor_businesses v ON v.id=vca.vendor_id AND v.status='active'
      WHERE vca.canonical_variant_id=cv.id
        AND vca.assortment_status NOT IN ('rejected','discontinued')
      ORDER BY vca.updated_at DESC
      LIMIT 1
    ) vendor_pick ON true
    WHERE cv.public_id=$1
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (
        EXISTS (
          SELECT 1
          FROM public.vitex_commerce_products verified
          WHERE verified.canonical_variant_id=cv.id
            AND verified.manufacturer_product_id=$2::uuid
            AND verified.active=true
            AND verified.match_status='verified'
        )
        OR EXISTS (
          SELECT 1
          FROM public.manufacturer_products mp
          WHERE mp.id=$2::uuid AND mp.canonical_variant_id=cv.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.manufacturer_product_variants mpv
          WHERE mpv.product_id=$2::uuid AND mpv.canonical_variant_id=cv.id AND mpv.active=true
        )
      )
    ORDER BY vcp.updated_at DESC NULLS LAST
    LIMIT 1
  `, [catalogueId, manufacturerProductId]);
  return result.rows[0];
}

async function findAccessory(
  visitorKey: string,
  postcode: string,
  definition: AccessoryDefinition
) {
  if (!definition.enabled) return undefined;
  try {
    const page = await getShopCatalogPage({
      visitorKey,
      postcode,
      query: definition.query,
      limit: 12,
      offset: 0
    });
    const product = page.products.find((entry) =>
      entry.available
      && entry.availableToSell > 0
      && entry.priceMinor > 0
      && allowedAccessoryCategory(entry.categoryCode)
    );
    if (!product) {
      return {
        key: definition.key,
        role: "accessory" as const,
        label: definition.label,
        reasonEl: definition.reasonEl,
        required: false,
        preselected: false,
        quantity: definition.quantity,
        sourceLayer: "KONTA_MOU_RULE" as const,
        cartable: false,
        availabilityNote: "Δεν υπάρχει ακόμη κατάλληλο διαθέσιμο προϊόν στον κατάλογο KONTA MOY."
      };
    }
    return {
      key: definition.key,
      role: "accessory" as const,
      label: definition.label,
      reasonEl: definition.reasonEl,
      required: false,
      preselected: definition.preselected,
      quantity: definition.quantity,
      sourceLayer: "KONTA_MOU_RULE" as const,
      cartable: true,
      canonicalVariantId: product.id,
      title: product.title,
      priceMinor: product.priceMinor,
      price: product.price,
      imageUrl: product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
      imageAlt: product.mediaAlt ?? product.title
    };
  } catch {
    return {
      key: definition.key,
      role: "accessory" as const,
      label: definition.label,
      reasonEl: definition.reasonEl,
      required: false,
      preselected: false,
      quantity: definition.quantity,
      sourceLayer: "KONTA_MOU_RULE" as const,
      cartable: false,
      availabilityNote: "Η αναζήτηση αξεσουάρ δεν είναι διαθέσιμη αυτή τη στιγμή."
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProjectKitRequest;
    const scenarioKey = text(body.scenarioKey, 96);
    const manufacturerProductId = text(body.manufacturerProductId, 64);
    const catalogueId = text(body.catalogueId, 128);
    const postcode = text(body.postcode, 16) ?? "23100";
    const areaM2 = Math.max(1, Math.min(100000, Number(body.areaM2)));
    const facts = body.facts && typeof body.facts === "object" && !Array.isArray(body.facts) ? body.facts as Record<string, unknown> : {};

    if (!scenarioKey || !manufacturerProductId || !catalogueId || !Number.isFinite(areaM2)) {
      return Response.json({ error: "invalid_project_kit_request" }, { status: 400 });
    }

    const input = validateBuildGuidanceInput({ scenarioKey, facts, manufacturerProductId });
    const [guidance, selected, visitorKey] = await Promise.all([
      resolveBuildProjectGuidance(input),
      selectedProduct(catalogueId, manufacturerProductId),
      getVisitorKey()
    ]);
    if (!selected) return Response.json({ error: "selected_product_not_found" }, { status: 404 });

    const customerGuide = buildCustomerGuide(guidance);
    if (customerGuide.blocked || customerGuide.guidanceConflict) {
      return Response.json({
        error: "project_not_ready",
        blocked: customerGuide.blocked,
        guidanceConflict: customerGuide.guidanceConflict
      }, { status: 409 });
    }

    const quantityEstimate = resolvedQuantity(guidance, areaM2);
    const pack = packInfo(selected.variant_attributes);
    const purchaseQuantity = quantityEstimate.status === "available"
      && quantityEstimate.max != null
      && pack.amount
      && pack.unit === "L"
      ? Math.max(1, Math.ceil(quantityEstimate.max / pack.amount))
      : 1;
    const purchaseVolume = pack.amount && pack.unit === "L" ? rounded(pack.amount * purchaseQuantity) : undefined;

    const cartProduct = await getCatalogCard(catalogueId, visitorKey).catch(() => undefined);
    const cartable = Boolean(cartProduct?.available && cartProduct.availableToSell > 0 && cartProduct.priceMinor > 0);
    const priceMinor = cartable && cartProduct ? cartProduct.priceMinor : Number(selected.price_minor ?? 0);
    const displayPrice = priceMinor > 0 ? formatMoney(money(priceMinor)) : undefined;

    const manufacturer = object(guidance.manufacturer_guidance);
    const profile = object(manufacturer.application_profile);
    const methods = strings(profile.application_methods);
    const recommendedPrimers = strings(profile.recommended_primers);
    const requiredSystemComponents = strings(profile.required_system_components);
    const areaScale = Math.max(1, areaM2);

    const accessoryDefinitions: AccessoryDefinition[] = [
      {
        key: "roller",
        label: "Ρολό βαφής",
        query: "ρολό βαφής",
        reasonEl: "Προτεινόμενο εργαλείο εφαρμογής όταν ο κατασκευαστής επιτρέπει εφαρμογή με ρολό.",
        enabled: methods.includes("roller"),
        quantity: 1,
        preselected: methods.includes("roller")
      },
      {
        key: "brush",
        label: "Πινέλο βαφής",
        query: "πινέλο βαφής",
        reasonEl: "Χρήσιμο για κοψίματα, γωνίες και λεπτομέρειες. Η επιλογή είναι προαιρετική.",
        enabled: methods.includes("brush"),
        quantity: 1,
        preselected: !methods.includes("roller") && methods.includes("brush")
      },
      {
        key: "tray",
        label: "Σκαφάκι βαφής",
        query: "σκαφάκι βαφής",
        reasonEl: "Βοηθητικό εργαλείο έργου για εφαρμογή με ρολό.",
        enabled: methods.includes("roller"),
        quantity: 1,
        preselected: methods.includes("roller")
      },
      {
        key: "masking",
        label: "Ταινία μασκαρίσματος",
        query: "χαρτοταινία βαφής",
        reasonEl: "Προστασία ακμών και λεπτομερειών. Η ποσότητα είναι εκτίμηση KONTA MOY και μπορεί να αλλάξει.",
        enabled: true,
        quantity: Math.max(1, Math.ceil(areaScale / 40)),
        preselected: true
      },
      {
        key: "covering",
        label: "Υλικό κάλυψης / προστασίας",
        query: "νάυλον προστασίας βαφής",
        reasonEl: "Προστασία δαπέδων και γειτονικών επιφανειών. Η ποσότητα είναι εκτίμηση KONTA MOY και μπορεί να αλλάξει.",
        enabled: true,
        quantity: Math.max(1, Math.ceil(areaScale / 25)),
        preselected: true
      }
    ];

    const accessories = (await Promise.all(
      accessoryDefinitions.map((definition) => findAccessory(visitorKey, postcode, definition))
    )).filter(Boolean);

    const mainLine = {
      key: "main-product",
      role: "main" as const,
      label: "Κύριο προϊόν",
      reasonEl: "Το τεχνικά επαληθευμένο προϊόν που επέλεξες για το συγκεκριμένο έργο.",
      required: true,
      preselected: true,
      sourceLayer: "MANUFACTURER" as const,
      quantity: purchaseQuantity,
      quantityCalculated: quantityEstimate.status === "available" && Boolean(pack.amount && pack.unit === "L"),
      canonicalVariantId: selected.canonical_public_id,
      title: selected.title,
      brand: selected.brand_name ?? "VITEX",
      priceMinor,
      price: displayPrice,
      imageUrl: selected.source_image_url ?? undefined,
      imageAlt: selected.title,
      cartable,
      vendorName: selected.vendor_name ?? undefined,
      packAmount: pack.amount,
      packUnit: pack.unit,
      purchaseVolume,
      availabilityNote: cartable
        ? undefined
        : "Το προϊόν είναι τεχνικά διαθέσιμο στο Studio αλλά ο ανατεθειμένος προμηθευτής δεν έχει ακόμη επιβεβαιώσει προσφορά checkout/απόθεμα."
    };

    const systemPlaceholders = [
      ...requiredSystemComponents.map((name, index) => ({
        key: `required-system-${index + 1}`,
        role: "system" as const,
        label: "Απαραίτητο στοιχείο συστήματος",
        reasonEl: "Απαιτείται από το επαληθευμένο manufacturer system.",
        required: true,
        preselected: true,
        sourceLayer: "MANUFACTURER" as const,
        quantity: 1,
        cartable: false,
        title: name,
        availabilityNote: "Το Studio γνωρίζει το απαιτούμενο στοιχείο, αλλά δεν έχει ακόμη συνδεθεί με εμπορική παραλλαγή του καταλόγου."
      })),
      ...(profile.primer_required === true ? recommendedPrimers.slice(0, 1).map((name, index) => ({
        key: `required-primer-${index + 1}`,
        role: "system" as const,
        label: "Αστάρι συστήματος",
        reasonEl: "Το επιλεγμένο manufacturer profile απαιτεί αστάρι.",
        required: true,
        preselected: true,
        sourceLayer: "MANUFACTURER" as const,
        quantity: 1,
        cartable: false,
        title: name,
        availabilityNote: "Απαιτείται σύνδεση του συγκεκριμένου ασταριού με διαθέσιμη εμπορική παραλλαγή πριν προστεθεί στο καλάθι."
      })) : [])
    ];

    return Response.json({
      product: {
        id: selected.canonical_public_id,
        title: selected.title,
        brand: selected.brand_name ?? "VITEX",
        imageUrl: selected.source_image_url ?? undefined,
        priceMinor,
        price: displayPrice,
        vendorName: selected.vendor_name ?? undefined,
        cartable,
        packAmount: pack.amount,
        packUnit: pack.unit
      },
      quantityEstimate,
      purchasePlan: {
        units: purchaseQuantity,
        packAmount: pack.amount,
        packUnit: pack.unit,
        purchaseVolume
      },
      technical: {
        applicationMethods: methods,
        recommendedPrimers,
        requiredSystemComponents,
        preparation: customerGuide.preparation,
        instructions: customerGuide.manufacturerInstructions,
        timings: customerGuide.timings,
        warnings: customerGuide.warnings,
        avoid: customerGuide.avoid
      },
      lines: [mainLine, ...systemPlaceholders, ...accessories],
      notes: {
        accessoryQuantities: "Οι ποσότητες εργαλείων/προστατευτικών είναι κανόνες σχεδιασμού KONTA MOY και όχι οδηγίες VITEX.",
        technicalQuantities: quantityEstimate.basisEl
      }
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "build_studio.project_kit_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "project_kit_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
