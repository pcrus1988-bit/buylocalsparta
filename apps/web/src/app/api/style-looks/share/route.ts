import { createSharedStyleLook } from "../../../../lib/style-builder-runtime";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const look = await createSharedStyleLook({
      name: body.name,
      audience: body.audience,
      source: body.source,
      composition: body.composition
    });
    return Response.json(
      { shareToken: look.shareToken },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "shared_style_look_failed";
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
