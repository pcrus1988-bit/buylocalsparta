import { createHash } from "node:crypto";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!productionDatabaseConfigured()) {
    return Response.json(
      { ok: false, message: "Database runtime unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query(
      "SELECT version, filename, sha256 FROM public.schema_migrations ORDER BY version",
    );
    if (!result.rowCount) {
      return Response.json(
        { ok: false, message: "Migration ledger unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const entries = result.rows.map((row) => ({
      version: Number(row.version),
      filename: String(row.filename),
      sha256: String(row.sha256).trim(),
    }));
    const head = entries.at(-1)!;
    const fingerprint = createHash("sha256")
      .update(`schema-ledger-v1\n${entries.map((entry) => `${entry.version}\t${entry.filename}\t${entry.sha256}`).join("\n")}`)
      .digest("hex");

    return Response.json(
      {
        ok: true,
        headVersion: head.version,
        migrationCount: entries.length,
        fingerprint,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "Migration ledger check failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
