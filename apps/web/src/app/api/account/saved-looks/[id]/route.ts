import { requireAccountSession } from "../../../../../lib/account-session";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

type Context = Readonly<{ params: Promise<{ id: string }> }>;
type SavedLookRow = Readonly<{
  public_id: string;
  name: string;
  composition: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}>;

function validLookId(value: string): boolean {
  return /^look_[a-f0-9]{32}$/i.test(value);
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

export async function GET(_request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession();
    const { id } = await params;
    if (!validLookId(id)) return Response.json({ error: "invalid_look" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const result = await getProductionPostgresRuntime().nativePool.query<SavedLookRow>(`
      SELECT public_id,name,composition,created_at,updated_at
      FROM customer_saved_looks
      WHERE public_id=$1 AND user_id=$2
      LIMIT 1
    `, [id, principal.userId]);
    const row = result.rows[0];
    if (!row) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ look: browserLook(row) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "saved_look_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    if (!validLookId(id)) return Response.json({ error: "invalid_look" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const result = await getProductionPostgresRuntime().nativePool.query(`
      DELETE FROM customer_saved_looks
      WHERE public_id=$1 AND user_id=$2
    `, [id, principal.userId]);
    return Response.json({ removed: Boolean(result.rowCount) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete_look_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
