import { NextResponse } from "next/server";
import { publicResearchObservatory } from "../../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await publicResearchObservatory();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
