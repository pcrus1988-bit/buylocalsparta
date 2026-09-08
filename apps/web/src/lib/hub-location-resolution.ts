import type { GemiCompanyRecord } from "./gemi-runtime";
import { EXPANSION_HUBS, type ExpansionHub } from "./expansion-hubs";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_GEOCODE_TIMEOUT_MS = 6_000;

export type HubResolutionMethod = "registry_locality" | "google_geocode";

export type ResolvedHubLocation = Readonly<{
  status: "matched";
  hub: ExpansionHub;
  method: HubResolutionMethod;
  sourcePostcode: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
}>;

export type UnresolvedHubLocation = Readonly<{
  status: "unresolved";
  reason: "postcode_missing" | "geocoding_unavailable" | "geocoding_failed" | "outside_coverage";
  message: string;
  sourcePostcode?: string;
}>;

export type HubLocationResolution = ResolvedHubLocation | UnresolvedHubLocation;

export async function resolveExpansionHubForGemiCompany(
  company: GemiCompanyRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<HubLocationResolution> {
  const sourcePostcode = normalizePostcode(company.postcode);
  if (!sourcePostcode) {
    return {
      status: "unresolved",
      reason: "postcode_missing",
      message: "Το Γ.Ε.ΜΗ. δεν επέστρεψε έγκυρο ταχυδρομικό κώδικα για την επιχείρηση. Η αντιστοίχιση HUB χρειάζεται έλεγχο."
    };
  }

  const localityHub = resolveByRegistryLocality(company);
  if (localityHub) {
    return {
      status: "matched",
      hub: localityHub,
      method: "registry_locality",
      sourcePostcode
    };
  }

  const geocodingKey = env.GOOGLE_MAPS_GEOCODING_SERVER_KEY?.trim();
  if (!geocodingKey) {
    return {
      status: "unresolved",
      reason: "geocoding_unavailable",
      sourcePostcode,
      message: "Βρήκαμε την επιχείρηση στο Γ.Ε.ΜΗ., αλλά δεν μπορούμε ακόμη να επιβεβαιώσουμε αυτόματα το HUB της τοποθεσίας της."
    };
  }

  const point = await geocodeRegistryLocation(company, sourcePostcode, geocodingKey, env);
  if (!point) {
    return {
      status: "unresolved",
      reason: "geocoding_failed",
      sourcePostcode,
      message: "Βρήκαμε την επιχείρηση στο Γ.Ε.ΜΗ., αλλά η διεύθυνση δεν μπόρεσε να αντιστοιχιστεί με ασφάλεια σε τοποθεσία."
    };
  }

  const nearest = nearestEligibleHub(point.latitude, point.longitude);
  if (!nearest) {
    return {
      status: "unresolved",
      reason: "outside_coverage",
      sourcePostcode,
      message: "Η επαληθευμένη τοποθεσία της επιχείρησης δεν βρίσκεται μέσα σε ενεργό ή προγραμματισμένο όριο HUB του τρέχοντος master."
    };
  }

  return {
    status: "matched",
    hub: nearest.hub,
    method: "google_geocode",
    sourcePostcode,
    latitude: point.latitude,
    longitude: point.longitude,
    distanceKm: nearest.distanceKm
  };
}

export function nearestEligibleHub(latitude: number, longitude: number): { hub: ExpansionHub; distanceKm: number } | undefined {
  return EXPANSION_HUBS
    .map((hub) => ({ hub, distanceKm: haversineKm(latitude, longitude, hub.latitude, hub.longitude) }))
    .filter(({ hub, distanceKm }) => distanceKm <= hub.radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.hub.id.localeCompare(right.hub.id))[0];
}

function resolveByRegistryLocality(company: GemiCompanyRecord): ExpansionHub | undefined {
  const registryLocalities = [company.city, company.municipality]
    .map(normalizeLocationText)
    .filter(Boolean);
  if (!registryLocalities.length) return undefined;

  const matches = EXPANSION_HUBS.filter((hub) => {
    const hubName = normalizeLocationText(hub.nameEl);
    if (!hubName || hubName.length < 4) return false;
    return registryLocalities.some((locality) => locality === hubName || locality.includes(hubName));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

async function geocodeRegistryLocation(
  company: GemiCompanyRecord,
  postcode: string,
  apiKey: string,
  env: NodeJS.ProcessEnv
): Promise<{ latitude: number; longitude: number } | undefined> {
  const address = [
    company.addressLine1,
    postcode,
    company.city,
    company.municipality,
    company.prefecture,
    "Ελλάδα"
  ].filter(Boolean).join(", ");

  const params = new URLSearchParams({
    address,
    key: apiKey,
    region: "gr",
    language: "el"
  });
  const controller = new AbortController();
  const timeoutMs = positiveInteger(env.GOOGLE_MAPS_GEOCODING_TIMEOUT_MS, DEFAULT_GEOCODE_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as GoogleGeocodeResponse;
    if (payload.status !== "OK") return undefined;
    const result = payload.results?.[0];
    const location = result?.geometry?.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return undefined;

    const returnedPostcode = result.address_components
      ?.find((component) => component.types.includes("postal_code"))
      ?.long_name?.replace(/\D/g, "");
    if (returnedPostcode && returnedPostcode !== postcode) return undefined;

    return { latitude: location.lat, longitude: location.lng };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePostcode(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return /^\d{5}$/.test(normalized) ? normalized : undefined;
}

function normalizeLocationText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^a-zα-ω0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371.0088;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type GoogleGeocodeResponse = Readonly<{
  status?: string;
  results?: ReadonlyArray<{
    address_components?: ReadonlyArray<{
      long_name?: string;
      types: ReadonlyArray<string>;
    }>;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
}>;
