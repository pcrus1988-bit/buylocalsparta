import { EXPANSION_HUBS, type ExpansionHub } from "./expansion-hubs.ts";

/**
 * Stable, deterministic resolver for geocoded research businesses.
 * Uses the very same 131 HUB coordinates, 25-km radius and coverageMode.
 * On islands, pure distance is insufficient: a licensed/verified geography
 * source must explicitly supply islandHubId to avoid cross-water assignment.
 */
export type CensusGeoPoint = Readonly<{
  latitude: number;
  longitude: number;
  islandHubId?: string;
  landmass?: "mainland" | "island";
}>;
export type CensusHubAssignment = Readonly<{
  hub: ExpansionHub;
  distanceKm: number;
  status: "assigned" | "outside_coverage";
  method: "nearest_geocoded_25km" | "nearest_geocoded_outside_radius";
}>;

export function resolveCensusHubFromPoint(point: CensusGeoPoint): CensusHubAssignment | undefined {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
      point.latitude < 34 || point.latitude > 43 ||
      point.longitude < 19 || point.longitude > 30) return undefined;

  // Reject contradictory evidence rather than letting a supplied island hub
  // override an explicit mainland classification.
  if (point.islandHubId && point.landmass === "mainland") return undefined;

  // Island contexts must be explicitly confirmed by a source that distinguishes
  // the landmass. A mainland hub across a bay is never an acceptable substitute.
  const candidates = point.islandHubId
    ? EXPANSION_HUBS.filter((hub) => hub.id === point.islandHubId &&
        (hub.coverageMode === "WHOLE_ISLAND" || hub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM"))
    : point.landmass === "mainland"
      ? EXPANSION_HUBS.filter((hub) =>
          hub.coverageMode === "GEODESIC_RADIUS_25KM" || hub.coverageMode === "LEGACY_SPARTA")
      : [];
  if (!candidates.length) return undefined;

  const ranked = candidates
    .map((hub) => ({ hub, distanceKm: haversineKm(
      point.latitude, point.longitude, hub.latitude, hub.longitude
    ) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.hub.id.localeCompare(b.hub.id));
  const nearest = ranked[0];
  if (!nearest) return undefined;
  // A hub's WHOLE_ISLAND designation is a routing restriction, not proof
  // that arbitrary coordinates belong to that island. Until a verified
  // island polygon is available, keep the same 25-km physical radius.
  const inside = nearest.distanceKm <= nearest.hub.radiusKm;
  return {
    hub: nearest.hub,
    distanceKm: nearest.distanceKm,
    status: inside ? "assigned" : "outside_coverage",
    method: inside ? "nearest_geocoded_25km" : "nearest_geocoded_outside_radius"
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371.0088;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
