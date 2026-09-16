import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const postgresUrl = process.env.POSTGRES_URL?.trim() ?? "";
  const activeUrl = databaseUrl || postgresUrl;
  return NextResponse.json({
    databaseUrlConfigured: databaseUrl.length > 0,
    postgresUrlConfigured: postgresUrl.length > 0,
    expectedProductionProject: activeUrl.includes("eemihhfreggbigxejjhj")
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
