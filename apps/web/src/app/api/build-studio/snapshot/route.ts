import { getAccountSession } from "../../../../lib/account-session";
import {
  buildCustomerGuide,
  calculateBuildQuantity,
  resolveBuildProjectGuidance,
  validateBuildGuidanceInput
} from "../../../../lib/build-guidance-runtime";
import {
  createPaintBuildSnapshot,
  type PaintBuildProjectSnapshot
} from "../../../../lib/paint-build-project-documents";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { calculateVerifiedPaintQuantity } from "../../../../lib/paint-build-project-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotRequest = Readonly<{
  scenarioKey?: unknown;
  facts?: unknown;
  manufacturerProductId?: unknown;
  project?: unknown;
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("project must be an object");
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, max = 220): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("project text fields must be strings");
  const result = value.trim();
  if (!result) return undefined;
  if (result.length > max) throw new Error("project text field is too long");
  return result;
}

function requiredText(value: unknown, field: string, max = 220): string {
  const result = optionalText(value, max);
  if (!result) throw new Error(`${field} is required`);
  return result;
}


function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function twoCoatCoverage(value: unknown): Readonly<{ min: number; max: number }> | undefined {
  const raw = recordValue(value).two_coats;
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const first = numberValue(raw[0]);
  const second = numberValue(raw[1]);
  if (!first || !second || first <= 0 || second <= 0) return undefined;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

async function verifiedQuantityFallback(
  manufacturerProductId: string,
  guidance: Awaited<ReturnType<typeof resolveBuildProjectGuidance>>,
  areaM2: number
) {
  const manufacturer = recordValue(guidance.manufacturer_guidance);
  if (manufacturer.status !== "verified") return undefined;
  const profile = recordValue(manufacturer.application_profile);
  const evidence = await getProductionPostgresRuntime().nativePool.query<{ normalized_value: unknown }>(
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
  const aggregate = twoCoatCoverage(evidence.rows[0]?.normalized_value);
  const quantity = calculateVerifiedPaintQuantity({
    areaM2,
    coverageMin: numberValue(profile.coverage_m2_per_litre_min),
    coverageMax: numberValue(profile.coverage_m2_per_litre_max),
    coatsMin: numberValue(profile.number_of_coats_min),
    coatsMax: numberValue(profile.number_of_coats_max),
    twoCoatCoverageMin: aggregate?.min,
    twoCoatCoverageMax: aggregate?.max
  });
  if (!quantity) return undefined;
  return {
    status: "available" as const,
    areaM2,
    unit: "L" as const,
    min: quantity.min,
    max: quantity.max,
    coatsMin: quantity.coatsMin,
    coatsMax: quantity.coatsMax,
    basisEl: quantity.basis === "manufacturer_two_coat_coverage"
      ? "Θεωρητική ποσότητα από την επαληθευμένη κάλυψη δύο στρώσεων που δημοσιεύει η VITEX. Δεν προστέθηκε γενικός συντελεστής απωλειών."
      : "Θεωρητική ποσότητα από επαληθευμένα m²/L και αριθμό στρώσεων VITEX."
  };
}

function kitData(value: unknown) {
  if (value == null) return undefined;
  const raw = object(value);
  if (!Array.isArray(raw.items) || raw.items.length > 64) throw new Error("project.kit.items is invalid");
  const roles = new Set(["required_system", "recommended_working", "optional_extra"]);
  const layers = new Set(["MANUFACTURER_VITEX", "KONTA_MOU_RULE"]);
  const items = raw.items.map((entry, index) => {
    const item = object(entry);
    const priceMinor = Number(item.priceMinor);
    const quantity = Number(item.quantity);
    const role = optionalText(item.role, 40);
    const sourceLayer = optionalText(item.sourceLayer, 40);
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new Error(`project.kit.items[${index}].priceMinor is invalid`);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new Error(`project.kit.items[${index}].quantity is invalid`);
    if (!role || !roles.has(role)) throw new Error(`project.kit.items[${index}].role is invalid`);
    if (!sourceLayer || !layers.has(sourceLayer)) throw new Error(`project.kit.items[${index}].sourceLayer is invalid`);
    return {
      canonicalVariantId: requiredText(item.canonicalVariantId, `project.kit.items[${index}].canonicalVariantId`, 128),
      title: requiredText(item.title, `project.kit.items[${index}].title`, 500),
      priceMinor,
      price: requiredText(item.price, `project.kit.items[${index}].price`, 64),
      imageUrl: optionalText(item.imageUrl, 1200),
      quantity,
      selected: item.selected === true,
      required: item.required === true,
      role: role as "required_system" | "recommended_working" | "optional_extra",
      sourceLayer: sourceLayer as "MANUFACTURER_VITEX" | "KONTA_MOU_RULE",
      reasonEl: optionalText(item.reasonEl, 500)
    };
  });
  const unresolvedRequired = Array.isArray(raw.unresolvedRequired)
    ? raw.unresolvedRequired.slice(0, 32).map((item, index) => requiredText(item, `project.kit.unresolvedRequired[${index}]`, 260))
    : [];
  const unavailableAccessorySlots = Array.isArray(raw.unavailableAccessorySlots)
    ? raw.unavailableAccessorySlots.slice(0, 32).map((item, index) => requiredText(item, `project.kit.unavailableAccessorySlots[${index}]`, 260))
    : [];
  const complete = raw.complete === true
    && unresolvedRequired.length === 0
    && items.filter((item) => item.required).every((item) => item.selected);
  const totalMinor = items
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error("project.kit.total is invalid");
  return { complete, totalMinor, items, unresolvedRequired, unavailableAccessorySlots };
}

function projectData(value: unknown) {
  const raw = object(value);
  const area = raw.areaM2 == null ? undefined : Number(raw.areaM2);
  if (area !== undefined && (!Number.isFinite(area) || area < 1 || area > 100000)) throw new Error("areaM2 is invalid");
  const colour = optionalText(raw.colour, 16);
  if (colour && !/^#[0-9A-Fa-f]{6}$/.test(colour)) throw new Error("colour is invalid");
  const product = raw.selectedProduct == null ? undefined : object(raw.selectedProduct);
  return {
    title: requiredText(raw.title, "project.title"),
    projectType: requiredText(raw.projectType, "project.projectType", 96),
    areaM2: area,
    colour,
    summary: optionalText(raw.summary, 500),
    selectedProduct: product ? {
      manufacturerProductId: optionalText(product.manufacturerProductId, 64),
      catalogueId: optionalText(product.catalogueId, 128),
      slug: optionalText(product.slug, 260),
      url: optionalText(product.url, 1200),
      title: optionalText(product.title, 260),
      brand: optionalText(product.brand, 140),
      price: optionalText(product.price, 64),
      mediaId: optionalText(product.mediaId, 128),
      imageUrl: optionalText(product.imageUrl, 1200),
      imageAlt: optionalText(product.imageAlt, 260),
      colour: optionalText(product.colour, 160),
      size: optionalText(product.size, 80),
      packValue: product.packValue == null ? undefined : Number(product.packValue),
      packUnit: optionalText(product.packUnit, 40),
      tintBase: optionalText(product.tintBase, 160),
      finish: optionalText(product.finish, 160)
    } : undefined,
    kit: kitData(raw.kit)
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SnapshotRequest;
    if (typeof body.scenarioKey !== "string") throw new Error("scenarioKey is required");
    const facts = body.facts === undefined ? {} : body.facts;
    if (!facts || Array.isArray(facts) || typeof facts !== "object") throw new Error("facts must be an object");
    if (body.manufacturerProductId !== undefined && body.manufacturerProductId !== null && typeof body.manufacturerProductId !== "string") {
      throw new Error("manufacturerProductId must be a UUID string or null");
    }

    const project = projectData(body.project);
    const input = validateBuildGuidanceInput({
      scenarioKey: body.scenarioKey,
      facts: facts as Record<string, unknown>,
      manufacturerProductId: body.manufacturerProductId as string | null | undefined
    });
    if (project.selectedProduct?.manufacturerProductId && project.selectedProduct.manufacturerProductId !== input.manufacturerProductId) {
      throw new Error("selected product does not match manufacturerProductId");
    }

    const guidance = await resolveBuildProjectGuidance(input);
    if (guidance.status === "scenario_not_found") {
      return Response.json({ error: "scenario_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const customerGuide = buildCustomerGuide(guidance);
    const runtimeQuantity = calculateBuildQuantity(guidance, project.areaM2 ?? 0);
    const quantityEstimate = runtimeQuantity.status === "available" || !input.manufacturerProductId
      ? runtimeQuantity
      : await verifiedQuantityFallback(input.manufacturerProductId, guidance, project.areaM2 ?? 0).catch(() => undefined) ?? runtimeQuantity;
    const principal = await getAccountSession();
    const customerPrincipal = principal?.roles.includes("customer") ? principal : undefined;
    const snapshot: PaintBuildProjectSnapshot = {
      createdAt: new Date().toISOString(),
      project: {
        ...project,
        scenarioKey: input.scenarioKey
      },
      guidance,
      customerGuide,
      quantityEstimate
    };
    const stored = await createPaintBuildSnapshot(snapshot, customerPrincipal);

    return Response.json({
      snapshotId: stored.publicId,
      savedForCustomer: Boolean(customerPrincipal),
      customerGuide,
      quantityEstimate
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validation = /required|invalid|must be|too long|does not match/i.test(message);
    if (!validation) console.error(JSON.stringify({ level: "error", event: "build_studio.snapshot_failed", message }));
    return Response.json({
      error: validation ? "invalid_snapshot_request" : "snapshot_unavailable",
      message: validation ? message : "Δεν ήταν δυνατή η δημιουργία του οδηγού έργου."
    }, { status: validation ? 400 : 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
