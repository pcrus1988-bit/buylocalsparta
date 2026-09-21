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
      title: optionalText(product.title, 260),
      brand: optionalText(product.brand, 140),
      price: optionalText(product.price, 64)
    } : undefined
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
    const quantityEstimate = calculateBuildQuantity(guidance, project.areaM2 ?? 0);
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
