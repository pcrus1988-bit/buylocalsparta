import { NextResponse } from "next/server";

type NominatimResult = Readonly<{
  lat?: string;
  lon?: string;
  display_name?: string;
}>;

const MAX_QUERY_LENGTH = 160;

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
    const response = await fetch(geocoderUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "KONTA-MOU/1.0 (https://kontamou.site)"
      },
      next: { revalidate: 86400 }
    });

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
