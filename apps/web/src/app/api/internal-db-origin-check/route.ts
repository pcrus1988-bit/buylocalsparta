import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  return NextResponse.json({
    configured: databaseUrl.length > 0,
    expectedProductionProject: databaseUrl.includes("eemihhfreggbigxejjhj")
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
