import { requireAccountSession } from "../../../../lib/account-session";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";

const SLOT_KEYS = new Set(["main", "bottom", "layer", "shoes", "bag", "accessory", "beauty", "nails"]);
const PRODUCT_KEYS = new Set([
  "id", "slug", "title", "price", "priceMinor", "categoryCode", "categoryLabel",
  "brand", "color", "sizes", "fit", "mediaId", "mediaAlt", "sourceImageAvailable",
  "available", "availableToSell", "vendorId", "vendorName"
]);

type SavedLookRow = Readonly<{
  public_id: string;
  name: string;
  composition: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function safeText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim().slice(0, max);
  return result || undefined;
}

function sanitizeProduct(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const id = safeText(source.id, 160);
  const slug = safeText(source.slug, 240);
  const title = safeText(source.title, 300);
  const categoryCode = safeText(source.categoryCode, 160);
  const priceMinor = Number(source.priceMinor);
  if (!id || !slug || !title || !categoryCode || !Number.isSafeInteger(priceMinor) || priceMinor < 0) return undefined;

  const result: Record<string, unknown> = {};
  for (const key of PRODUCT_KEYS) {
    const item = source[key];
    if (item === undefined || item === null) continue;
    if (key === "sizes") {
      if (Array.isArray(item)) result[key] = item.flatMap((entry) => safeText(entry, 80) ? [safeText(entry, 80)!] : []).slice(0, 30);
      continue;
    }
    if (key === "priceMinor" || key === "availableToSell") {
      const number = Number(item);
      if (Number.isSafeInteger(number) && number >= 0) result[key] = number;
      continue;
    }
    if (key === "sourceImageAvailable" || key === "available") {
      if (typeof item === "boolean") result[key] = item;
      continue;
    }
    const text = safeText(item, key === "title" ? 300 : 240);
    if (text) result[key] = text;
  }
  return result;
}

function sanitizeComposition(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_LOOK");
  const source = value as Record<string, unknown>;
  const slotSource = source.slots;
  if (!slotSource || typeof slotSource !== "object" || Array.isArray(slotSource)) throw new Error("INVALID_LOOK");

  const slots: Record<string, unknown> = {};
  for (const [slot, product] of Object.entries(slotSource as Record<string, unknown>)) {
    if (!SLOT_KEYS.has(slot)) continue;
    const sanitized = sanitizeProduct(product);
    if (sanitized) slots[slot] = sanitized;
  }
  if (Object.keys(slots).length === 0) throw new Error("EMPTY_LOOK");

  return {
    name: safeText(source.name, 120),
    mood: safeText(source.mood, 180),
    note: safeText(source.note, 400),
    slots
  };
}

function browserLook(row: SavedLookRow) {
  return {
    id: row.public_id,
    name: row.name,
    composition: row.composition,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const result = await getProductionPostgresRuntime().nativePool.query<SavedLookRow>(`
      SELECT public_id,name,composition,created_at,updated_at
      FROM customer_saved_looks
      WHERE user_id=$1
      ORDER BY updated_at DESC,id DESC
      LIMIT 100
    `, [principal.userId]);
    return Response.json({ looks: result.rows.map(browserLook) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "saved_looks_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const name = safeText(body.name, 120) ?? "My KONTA MOY Look";
    const composition = sanitizeComposition(body.composition);
    const serialized = JSON.stringify(composition);
    if (serialized.length > 50_000) throw new Error("LOOK_TOO_LARGE");

    const result = await getProductionPostgresRuntime().nativePool.query<SavedLookRow>(`
      INSERT INTO customer_saved_looks(user_id,name,composition)
      VALUES ($1,$2,$3::jsonb)
      RETURNING public_id,name,composition,created_at,updated_at
    `, [principal.userId, name, serialized]);
    return Response.json({ look: browserLook(result.rows[0]) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_look_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
