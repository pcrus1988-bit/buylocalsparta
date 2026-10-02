import type { StudioDestination } from "./studio-registry";

export type StudioTravelNode = StudioDestination["id"] | "hub";

export type StudioTravelMarker = Readonly<{
  from: StudioTravelNode;
  to: StudioTravelNode;
  at: number;
}>;

const STORAGE_KEY = "km:studio-travel";
const MAX_AGE_MS = 12_000;

export function markStudioTravel(from: StudioTravelNode, to: StudioTravelNode): void {
  if (typeof window === "undefined") return;
  try {
    const marker: StudioTravelMarker = { from, to, at: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // Navigation must remain functional even when browser storage is unavailable.
  }
}

export function consumeStudioTravel(to: StudioTravelNode): StudioTravelMarker | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const marker = JSON.parse(raw) as Partial<StudioTravelMarker>;
    if (
      marker.to !== to
      || typeof marker.from !== "string"
      || typeof marker.at !== "number"
      || Date.now() - marker.at > MAX_AGE_MS
    ) return undefined;
    return marker as StudioTravelMarker;
  } catch {
    return undefined;
  }
}
