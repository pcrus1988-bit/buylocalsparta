"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeliveryLiveLocation,
  DeliveryLiveSnapshot,
  DeliveryRouteSnapshot,
} from "../lib/delivery-customer-live";
import styles from "./DeliveryOperations.module.css";
import live from "./CustomerDeliveryLiveMap.module.css";

type Point = Readonly<{ lat: number; lng: number }>;
type LeafletMap = {
  setView(point: [number, number], zoom: number): LeafletMap;
  panTo(point: [number, number]): void;
  fitBounds(bounds: [number, number][], options?: Record<string, unknown>): void;
  remove(): void;
  invalidateSize(): void;
};
type LeafletMarker = {
  addTo(map: LeafletMap): LeafletMarker;
  setLatLng(point: [number, number]): LeafletMarker;
};
type LeafletPolyline = {
  addTo(map: LeafletMap): LeafletPolyline;
  setLatLngs(points: [number, number][]): LeafletPolyline;
};
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  marker(point: [number, number], options?: Record<string, unknown>): LeafletMarker;
  polyline(points: [number, number][], options?: Record<string, unknown>): LeafletPolyline;
  divIcon(options: Record<string, unknown>): unknown;
};
type LiveWindow = Window & typeof globalThis & {
  L?: LeafletNamespace;
  __blsLiveLeafletPromise?: Promise<LeafletNamespace>;
  google?: {
    maps: {
      Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
      Marker: new (options: Record<string, unknown>) => GoogleMarker;
      Polyline: new (options: Record<string, unknown>) => GooglePolyline;
      LatLngBounds: new () => GoogleBounds;
    };
  };
  __blsGoogleMapsPromise?: Promise<NonNullable<LiveWindow["google"]>["maps"]>;
};
type GoogleMap = {
  setCenter(point: Point): void;
  fitBounds(bounds: GoogleBounds, padding?: number): void;
};
type GoogleMarker = {
  setPosition(point: Point): void;
  setMap(map: GoogleMap | null): void;
};
type GooglePolyline = {
  setPath(points: Point[]): void;
  setMap(map: GoogleMap | null): void;
};
type GoogleBounds = {
  extend(point: Point): GoogleBounds;
};

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DRIVER_MARKER_HTML = '<span style="display:block;width:22px;height:22px;border-radius:50%;background:#183027;border:4px solid #fff;box-shadow:0 5px 18px rgba(24,48,39,.35)"></span>';

function loadLeaflet(): Promise<LeafletNamespace> {
  const browser = window as LiveWindow;
  if (browser.L) return Promise.resolve(browser.L);
  if (browser.__blsLiveLeafletPromise) return browser.__blsLiveLeafletPromise;

  browser.__blsLiveLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const cssHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
    const finish = () => browser.L ? resolve(browser.L) : reject(new Error("leaflet_init_failed"));
    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-leaflet="true"]');
    if (existing) {
      if (browser.L) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("leaflet_load_failed")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.dataset.blsLeaflet = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("leaflet_load_failed")), { once: true });
    document.head.appendChild(script);
  });
  return browser.__blsLiveLeafletPromise;
}

function loadGoogleMaps(apiKey: string): Promise<NonNullable<LiveWindow["google"]>["maps"]> {
  const browser = window as LiveWindow;
  if (browser.google?.maps) return Promise.resolve(browser.google.maps);
  if (browser.__blsGoogleMapsPromise) return browser.__blsGoogleMapsPromise;

  browser.__blsGoogleMapsPromise = new Promise<NonNullable<LiveWindow["google"]>["maps"]>((resolve, reject) => {
    const finish = () => browser.google?.maps
      ? resolve(browser.google.maps)
      : reject(new Error("google_maps_init_failed"));
    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("google_maps_load_failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.blsGoogleMaps = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("google_maps_load_failed")), { once: true });
    document.head.appendChild(script);
  });
  return browser.__blsGoogleMapsPromise;
}

function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }
  return points;
}

function time(value?: number): string {
  return value
    ? new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value)
    : "—";
}

function etaText(route?: DeliveryRouteSnapshot): string | undefined {
  if (!route?.available || route.durationSeconds == null) return undefined;
  const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
  return `${minutes} λεπ${minutes === 1 ? "τό" : "τά"}`;
}

export function CustomerDeliveryLiveMap({
  jobId,
  initialLocation,
}: {
  jobId: string;
  initialLocation?: DeliveryLiveLocation;
}) {
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
  const [snapshot, setSnapshot] = useState<DeliveryLiveSnapshot>({
    jobId,
    status: "in_progress",
    liveTracking: true,
    latestLocation: initialLocation,
    stale: !initialLocation,
  });
  const [route, setRoute] = useState<DeliveryRouteSnapshot>();
  const [googleMode, setGoogleMode] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletMarkerRef = useRef<LeafletMarker | null>(null);
  const leafletRouteRef = useRef<LeafletPolyline | null>(null);
  const googleMapRef = useRef<GoogleMap | null>(null);
  const googleMarkerRef = useRef<GoogleMarker | null>(null);
  const googleRouteRef = useRef<GooglePolyline | null>(null);
  const provider = googleMode && browserKey ? "google" : "leaflet";
  const location = snapshot.latestLocation;

  const routePoints = useMemo(
    () => route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : [],
    [route?.encodedPolyline],
  );

  const refreshLocation = useCallback(async () => {
    try {
      const response = await fetch(`/api/account/delivery/live?jobId=${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      setSnapshot(await response.json() as DeliveryLiveSnapshot);
    } catch {
      // Keep the last trusted position visible during transient network failures.
    }
  }, [jobId]);

  const refreshRoute = useCallback(async () => {
    if (!googleMode) return;
    try {
      const response = await fetch(`/api/account/delivery/route?jobId=${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      setRoute(await response.json() as DeliveryRouteSnapshot);
    } catch {
      // ETA is optional; live GPS remains available when Google Routes is unavailable.
    }
  }, [googleMode, jobId]);

  useEffect(() => {
    void refreshLocation();
    const timer = window.setInterval(() => void refreshLocation(), 5_000);
    return () => window.clearInterval(timer);
  }, [refreshLocation]);

  useEffect(() => {
    if (!googleMode) return undefined;
    void refreshRoute();
    const timer = window.setInterval(() => void refreshRoute(), 45_000);
    return () => window.clearInterval(timer);
  }, [googleMode, refreshRoute]);

  useEffect(() => {
    if (!elementRef.current || !location) return undefined;
    let cancelled = false;
    setMapFailed(false);

    if (provider === "google" && browserKey) {
      loadGoogleMaps(browserKey)
        .then((maps) => {
          if (cancelled || !elementRef.current) return;
          const center = { lat: location.latitude, lng: location.longitude };
          const map = new maps.Map(elementRef.current, {
            center,
            zoom: 15,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            clickableIcons: false,
          });
          const marker = new maps.Marker({
            map,
            position: center,
            title: "Οδηγός ΚΟΝΤΑ ΜΟΥ",
          });
          const polyline = new maps.Polyline({
            map,
            path: [],
            geodesic: true,
            strokeColor: "#183027",
            strokeOpacity: 0.82,
            strokeWeight: 5,
          });
          googleMapRef.current = map;
          googleMarkerRef.current = marker;
          googleRouteRef.current = polyline;
        })
        .catch(() => {
          if (!cancelled) {
            setMapFailed(true);
            setGoogleMode(false);
          }
        });
    } else {
      loadLeaflet()
        .then((leaflet) => {
          if (cancelled || !elementRef.current) return;
          const point: [number, number] = [location.latitude, location.longitude];
          const map = leaflet.map(elementRef.current, {
            scrollWheelZoom: false,
            zoomControl: true,
          }).setView(point, 15);
          leaflet.tileLayer(OSM_TILE_URL, {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
          }).addTo(map);
          const icon = leaflet.divIcon({
            className: "",
            html: DRIVER_MARKER_HTML,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          leafletMapRef.current = map;
          leafletMarkerRef.current = leaflet.marker(point, { icon }).addTo(map);
          leafletRouteRef.current = leaflet.polyline([], {
            color: "#183027",
            opacity: 0.82,
            weight: 5,
          }).addTo(map);
          window.setTimeout(() => map.invalidateSize(), 0);
        })
        .catch(() => {
          if (!cancelled) setMapFailed(true);
        });
    }

    return () => {
      cancelled = true;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      leafletMarkerRef.current = null;
      leafletRouteRef.current = null;
      googleMarkerRef.current?.setMap(null);
      googleRouteRef.current?.setMap(null);
      googleMapRef.current = null;
      googleMarkerRef.current = null;
      googleRouteRef.current = null;
      if (elementRef.current) elementRef.current.innerHTML = "";
    };
  }, [provider, browserKey, Boolean(location)]);

  useEffect(() => {
    if (!location) return;
    const point: [number, number] = [location.latitude, location.longitude];
    leafletMarkerRef.current?.setLatLng(point);
    leafletMapRef.current?.panTo(point);
    googleMarkerRef.current?.setPosition({ lat: location.latitude, lng: location.longitude });
    googleMapRef.current?.setCenter({ lat: location.latitude, lng: location.longitude });
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (!routePoints.length) return;
    const leafletPoints = routePoints.map((point) => [point.lat, point.lng] as [number, number]);
    leafletRouteRef.current?.setLatLngs(leafletPoints);
    if (leafletMapRef.current) {
      leafletMapRef.current.fitBounds(leafletPoints, { padding: [24, 24], maxZoom: 16 });
    }
    googleRouteRef.current?.setPath(routePoints);
    const browser = window as LiveWindow;
    if (googleMapRef.current && browser.google?.maps) {
      const bounds = new browser.google.maps.LatLngBounds();
      routePoints.forEach((point) => bounds.extend(point));
      googleMapRef.current.fitBounds(bounds, 40);
    }
  }, [routePoints]);

  if (!location) {
    return (
      <div className={live.empty}>
        <strong>Αναμονή για live θέση</strong>
        <span>Μόλις ο οδηγός ενεργοποιήσει το GPS, η θέση του θα εμφανιστεί εδώ.</span>
      </div>
    );
  }

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  const eta = etaText(route);
  const distance = route?.available && route.distanceMeters != null
    ? route.distanceMeters >= 1000
      ? `${(route.distanceMeters / 1000).toFixed(1)} km`
      : `${Math.round(route.distanceMeters)} m`
    : undefined;

  return (
    <div className={live.card}>
      <div className={live.topbar}>
        <div>
          <strong>{snapshot.stale ? "Τελευταία γνωστή θέση οδηγού" : "Live θέση οδηγού"}</strong>
          <div className={styles.muted}>
            Ενημέρωση {time(location.receivedAt)}
            {location.accuracy != null ? ` · ακρίβεια ±${Math.round(location.accuracy)}m` : ""}
            {location.speed != null && location.speed >= 0.5 ? ` · ${Math.round(location.speed * 3.6)} km/h` : ""}
          </div>
        </div>
        <span className={`${live.liveDot} ${snapshot.stale ? live.liveDotStale : ""}`}>
          {snapshot.liveTracking && !snapshot.stale ? "LIVE" : "PAUSED"}
        </span>
      </div>

      {!mapFailed
        ? <div ref={elementRef} className={live.canvas} aria-label="Live χάρτης θέσης οδηγού" />
        : <div className={live.empty}>Ο ενσωματωμένος χάρτης δεν μπόρεσε να φορτώσει.</div>}

      {googleMode && route?.available && (
        <div className={live.etaStrip}>
          <div>
            <span>{route.label ?? "Google traffic ETA"}</span>
            <strong>{eta}</strong>
          </div>
          <div className={live.etaMeta}>
            {distance && <span>{distance}</span>}
            {route.arrivalAt && <span>περίπου {time(route.arrivalAt).slice(0, 5)}</span>}
          </div>
        </div>
      )}

      {googleMode && route && !route.available && (
        <div className={styles.muted}>
          Το Google traffic ETA δεν είναι διαθέσιμο αυτή τη στιγμή. Η live θέση συνεχίζει να ενημερώνεται.
        </div>
      )}

      <div className={live.actions}>
        <button className={styles.buttonSecondary} type="button" onClick={() => setGoogleMode((value) => !value)}>
          {googleMode ? "Βασικός live χάρτης" : "Google Maps + ETA"}
        </button>
        <a className={styles.buttonSecondary} target="_blank" rel="noreferrer" href={mapsHref}>
          Άνοιγμα στο Google Maps
        </a>
      </div>
      <div className={styles.muted}>
        Το Google Maps/ETA ενεργοποιείται μόνο όταν το επιλέξεις. Η live κοινοποίηση σταματά όταν την κλείσει ο οδηγός ή ολοκληρωθεί η εργασία.
      </div>
    </div>
  );
}
