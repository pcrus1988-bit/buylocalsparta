import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../lib/postgres-runtime";

type NominatimResult = Readonly<{
  lat?: string;
  lon?: string;
  display_name?: string;
}>;

const MAX_QUERY_LENGTH = 160;
const NOMINATIM_LOCK_KEY = "712487102341";
const NOMINATIM_MIN_INTERVAL_SECONDS = 1.05;

async function geocodeWithApplicationThrottle(url: URL): Promise<Response> {
  if (!productionDatabaseConfigured()) {
    throw new Error("Distributed geocoder throttle requires shared database state");
  }

  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [NOMINATIM_LOCK_KEY]);
    await client.query("SELECT pg_sleep($1::double precision)", [NOMINATIM_MIN_INTERVAL_SECONDS]);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "KONTA-MOU/1.0 (https://kontamou.site)"
      },
      next: { revalidate: 86400 }
    });

    await client.query("COMMIT");
    return response;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  if (query.length < 2) {
    return NextResponse.json({ location: null }, { status: 400 });
  }

  const geocoderUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocoderUrl.searchParams.set("q", query);
  geocoderUrl.searchParams.set("format", "jsonv2");
  geocoderUrl.searchParams.set("limit", "1");
  geocoderUrl.searchParams.set("countrycodes", "gr");
  geocoderUrl.searchParams.set("accept-language", "el,en");

  try {
    // Public Nominatim requires application-wide request pacing. PostgreSQL's
    // advisory transaction lock serializes calls across all warm Vercel instances;
    // the delay while holding that lock keeps remote request starts below 1 req/s.
    const response = await geocodeWithApplicationThrottle(geocoderUrl);

    if (!response.ok) {
      return NextResponse.json({ location: null }, { status: 502 });
    }

    const results = await response.json() as NominatimResult[];
    const first = results[0];
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ location: null });
    }

    return NextResponse.json({
      location: {
        latitude,
        longitude,
        label: first?.display_name ?? query
      }
    }, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
      }
    });
  } catch {
    return NextResponse.json({ location: null }, { status: 502 });
  }
}
