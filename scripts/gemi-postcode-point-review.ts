/**
 * Advisory-only review of Eurostat GISCO 2025 *postcode POINTS*.
 * No postcode point identifies or verifies a GEMI business premise.
 *
 * Use:
 *  node --experimental-strip-types scripts/gemi-postcode-point-review.ts \
 *    /private/PCODE_PT_2025_4326.geojson > /private/gemi-postcode-review.ndjson
 *
 * Each row is a postal-code candidate, NEVER a business-verified geocode.
 * Source: https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units/postal-codes
 * © European Union - GISCO, 2024, postal code point dataset, CC-BY-SA-4.0.
 */
import { readFileSync } from "node:fs";
import { EXPANSION_HUBS } from "../apps/web/src/lib/expansion-hubs.ts";
import { haversineKm } from "../apps/web/src/lib/hub-gemi-assignment.ts";

type RawFeature = Readonly<{
  type?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown };
}>;
export type AdvisoryPostcodePoint = Readonly<{
  postcode: string;
  latitude: number;
  longitude: number;
}>;
export function extractGreekPostcodePoints(value: unknown): AdvisoryPostcodePoint[] {
  if (!value || typeof value !== "object") throw new Error("Expected GISCO GeoJSON object");
  const object = value as Record<string, unknown>;
  if (object.type !== "FeatureCollection" || !Array.isArray(object.features)) {
    throw new Error("Expected a GeoJSON FeatureCollection");
  }
  const points: AdvisoryPostcodePoint[] = [];
  for (const input of object.features as RawFeature[]) {
    if (!input || input.type !== "Feature" || !input.properties || !input.geometry) continue;
    const country = String(input.properties.CNTR_ID ?? input.properties.CNTR_CODE ?? "").trim();
    if (country !== "EL") continue;
    const postcode = String(input.properties.POSTCODE ?? input.properties.PCODE ?? "").trim();
    if (!/^[0-9]{5}$/.test(postcode)) continue;
    if (input.geometry.type !== "Point" || !Array.isArray(input.geometry.coordinates)) continue;
    const [lon, lat] = input.geometry.coordinates;
    const latitude = Number(lat), longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < 34 || latitude > 43 || longitude < 19 || longitude > 30) continue;
    points.push({ postcode, latitude, longitude });
  }
  return points;
}

export type PostcodeReview = Readonly<{
  postcode: string;
  pointCount: number;
  nearestHubSlug: string;
  nearestKm: number;
  runnerUpKm: number | null;
  pointSpreadKm: number;
  candidateOnly: true;
  reviewReason: "multiple_distinct_points" | "island_context_unknown" |
    "outside_nearest_radius" | "address_required";
}>;

/**
 * This computes potential review order, NOT hub assignments. No landmass,
 * postcode geometry or business address is asserted from a GISCO point.
 */
export function reviewPostcodePoints(points: readonly AdvisoryPostcodePoint[]): PostcodeReview[] {
  const grouped = new Map<string, AdvisoryPostcodePoint[]>();
  for (const point of points) grouped.set(point.postcode, [...(grouped.get(point.postcode) ?? []), point]);
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([postcode, locations]) => {
    const first = locations[0]!;
    const ranked = EXPANSION_HUBS.map(h => ({
      hub: h,
      km: haversineKm(first.latitude, first.longitude, h.latitude, h.longitude)
    })).sort((a, b) => a.km - b.km || a.hub.id.localeCompare(b.hub.id));
    const spread = locations.reduce((maximum, current) =>
      Math.max(maximum, haversineKm(first.latitude, first.longitude,
        current.latitude, current.longitude)), 0);
    const nearest = ranked[0]!;
    const island = nearest.hub.coverageMode === "WHOLE_ISLAND" ||
      nearest.hub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM";
    const reason = spread > 1
      ? "multiple_distinct_points"
      : island ? "island_context_unknown"
      : nearest.km > 25 ? "outside_nearest_radius"
      : "address_required";
    return {
      postcode,
      pointCount: locations.length,
      nearestHubSlug: nearest.hub.slug,
      nearestKm: Number(nearest.km.toFixed(4)),
      runnerUpKm: ranked[1] ? Number(ranked[1].km.toFixed(4)) : null,
      pointSpreadKm: Number(spread.toFixed(4)),
      candidateOnly: true,
      reviewReason: reason
    };
  });
}

if (process.argv[1]?.endsWith("gemi-postcode-point-review.ts")) {
  const source = process.argv[2];
  if (!source || process.argv.length > 3) throw new Error("Supply one local GISCO GeoJSON file; this tool NEVER writes to the database");
  const points = extractGreekPostcodePoints(JSON.parse(readFileSync(source, "utf8")));
  if (points.length < 100) throw new Error("GISCO Greece source has too few postcode points; inspect source schema");
  const reviews = reviewPostcodePoints(points);
  for (const row of reviews) console.log(JSON.stringify(row));
  console.error(JSON.stringify({
    mode: "postcode_candidates_only", attribution: "© European Union - GISCO, 2024, CC-BY-SA-4.0",
    greekFeatures: points.length, postcodes: reviews.length,
    ambiguous: reviews.filter(r => r.reviewReason === "multiple_distinct_points").length,
    verifiedBusinessAddresses: 0, published: 0
  }));
}
