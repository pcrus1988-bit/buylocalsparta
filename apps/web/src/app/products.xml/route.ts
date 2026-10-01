import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type SnapshotState = Readonly<{
  generation_id: string;
  item_count: number;
  generated_at: Date | string;
}>;

type SnapshotChunk = Readonly<{
  chunk_index: number;
  xml_chunk: string;
  item_count: number;
}>;

type SnapshotCache = Readonly<{
  generationId: string;
  itemCount: number;
  generatedAt: string;
  chunks: readonly SnapshotChunk[];
}>;

let memorySnapshot: SnapshotCache | undefined;

async function loadSnapshot(): Promise<SnapshotCache> {
  if (!productionDatabaseConfigured()) {
    throw new Error("Production database is not configured");
  }

  const db = getProductionPostgresRuntime().nativePool;
  const stateResult = await db.query<SnapshotState>(`
    select generation_id::text, item_count, generated_at
    from bls_private.product_xml_export_state
    where export_key = 'products'
    limit 1
  `);

  const state = stateResult.rows[0];
  if (!state) throw new Error("Product XML snapshot is not available");

  const generatedAt = state.generated_at instanceof Date
    ? state.generated_at.toISOString()
    : String(state.generated_at);

  if (memorySnapshot?.generationId === state.generation_id) {
    return memorySnapshot;
  }

  const chunkResult = await db.query<SnapshotChunk>(`
    select chunk_index, xml_chunk, item_count
    from bls_private.product_xml_export_chunks
    where generation_id = $1::uuid
    order by chunk_index
  `, [state.generation_id]);

  if (!chunkResult.rows.length) {
    throw new Error("Product XML snapshot has no chunks");
  }

  const chunkItemCount = chunkResult.rows.reduce((total, chunk) => total + Number(chunk.item_count), 0);
  if (chunkItemCount !== Number(state.item_count)) {
    throw new Error(`Product XML snapshot count mismatch: expected ${state.item_count}, got ${chunkItemCount}`);
  }

  memorySnapshot = {
    generationId: state.generation_id,
    itemCount: Number(state.item_count),
    generatedAt,
    chunks: chunkResult.rows
  };

  return memorySnapshot;
}

export async function GET(): Promise<Response> {
  try {
    const snapshot = await loadSnapshot();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<?xml version="1.0" encoding="UTF-8"?>\n<products>\n'));
        for (const chunk of snapshot.chunks) {
          controller.enqueue(encoder.encode(chunk.xml_chunk));
        }
        controller.enqueue(encoder.encode("</products>\n"));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kontamou-products.xml"',
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
        "ETag": `"${snapshot.generationId}"`,
        "X-Robots-Tag": "noindex, follow",
        "X-Kontamou-Product-Items": String(snapshot.itemCount),
        "X-Kontamou-Product-Generated-At": snapshot.generatedAt,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "products_xml.export_failed",
      message: error instanceof Error ? error.message : String(error)
    }));

    return new Response("Product XML temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  }
}
