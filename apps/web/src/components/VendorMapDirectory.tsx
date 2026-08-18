"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./VendorMapDirectory.module.css";

export type VendorMapCategory = Readonly<{ key: string; label: string }>;

export type VendorMapEntry = Readonly<{
  id: string;
  name: string;
  href: string;
  status: "partner" | "research";
  adviser?: string;
  canonicalCount: number;
  address?: string;
  locality?: string;
  postcode?: string;
  coordinates?: Readonly<{ latitude: number; longitude: number }>;
  categories: readonly VendorMapCategory[];
}>;

type UserCoordinates = Readonly<{ latitude: number; longitude: number }>;
type MapStatusFilter = "all" | VendorMapEntry["status"];
type RadiusFilter = "all" | 2 | 5 | 10 | 25;

type LeafletBounds = {
  pad(ratio: number): LeafletBounds;
};

type LeafletMap = {
  setView(latLng: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: LeafletBounds, options?: Record<string, unknown>): LeafletMap;
  panTo(latLng: [number, number], options?: Record<string, unknown>): LeafletMap;
  invalidateSize(): void;
  remove(): void;
};

type LeafletLayerGroup = {
  addTo(map: LeafletMap): LeafletLayerGroup;
  clearLayers(): void;
};

type LeafletMarker = {
  addTo(target: LeafletLayerGroup): LeafletMarker;
  bindTooltip(content: HTMLElement, options?: Record<string, unknown>): LeafletMarker;
  on(event: "click", handler: () => void): LeafletMarker;
};

type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  layerGroup(): LeafletLayerGroup;
  marker(latLng: [number, number], options?: Record<string, unknown>): LeafletMarker;
  divIcon(options: Record<string, unknown>): unknown;
  latLngBounds(points: readonly [number, number][]): LeafletBounds;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
    __blsLeafletPromise?: Promise<LeafletNamespace>;
  }
}

const SPARTA_CENTER: [number, number] = [37.0748, 22.4303];
const LEAFLET_VERSION = "1.9.4";

function loadLeaflet(): Promise<LeafletNamespace> {
  if (window.L) return Promise.resolve(window.L);
  if (window.__blsLeafletPromise) return window.__blsLeafletPromise;

  window.__blsLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const cssHref = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-leaflet="true"]');
    const finish = () => window.L ? resolve(window.L) : reject(new Error("Leaflet did not initialise."));
    if (existing) {
      if (window.L) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Leaflet failed to load.")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "";
    script.dataset.blsLeaflet = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load.")), { once: true });
    document.head.appendChild(script);
  });

  return window.__blsLeafletPromise;
}

function normalizedSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el");
}

function distanceKm(a: UserCoordinates, b: UserCoordinates): number {
  const earthRadiusKm = 6371.0088;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function formatDistance(distance: number): string {
  return distance < 1 ? `${Math.max(1, Math.round(distance * 1000))} μ.` : `${distance.toLocaleString("el-GR", { maximumFractionDigits: 1 })} χλμ.`;
}

export function VendorMapDirectory({ vendors, categories }: { vendors: readonly VendorMapEntry[]; categories: readonly VendorMapCategory[] }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<MapStatusFilter>("all");
  const [radius, setRadius] = useState<RadiusFilter>("all");
  const [userLocation, setUserLocation] = useState<UserCoordinates | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [geoMessage, setGeoMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredVendors = useMemo(() => {
    const needle = normalizedSearch(query);
    return vendors
      .filter((vendor) => {
        if (status !== "all" && vendor.status !== status) return false;
        if (category !== "all" && !vendor.categories.some((entry) => entry.key === category)) return false;
        if (needle) {
          const haystack = normalizedSearch([
            vendor.name,
            vendor.adviser,
            vendor.address,
            vendor.locality,
            vendor.postcode,
            ...vendor.categories.map((entry) => entry.label)
          ].filter(Boolean).join(" "));
          if (!haystack.includes(needle)) return false;
        }
        if (radius !== "all" && userLocation) {
          if (!vendor.coordinates) return false;
          if (distanceKm(userLocation, vendor.coordinates) > radius) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (userLocation && a.coordinates && b.coordinates) {
          const distanceDifference = distanceKm(userLocation, a.coordinates) - distanceKm(userLocation, b.coordinates);
          if (Math.abs(distanceDifference) > 0.001) return distanceDifference;
        }
        if (a.status !== b.status) return a.status === "partner" ? -1 : 1;
        return a.name.localeCompare(b.name, "el");
      });
  }, [category, query, radius, status, userLocation, vendors]);

  const selectedVendor = filteredVendors.find((vendor) => vendor.id === selectedId) ?? filteredVendors[0];
  const mappedCount = filteredVendors.filter((vendor) => vendor.coordinates).length;

  useEffect(() => {
    if (!filteredVendors.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedVendor || selectedVendor.id !== selectedId) setSelectedId(filteredVendors[0].id);
  }, [filteredVendors, selectedId, selectedVendor]);

  useEffect(() => {
    let cancelled = false;
    const element = mapElementRef.current;
    if (!element) return undefined;

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !mapElementRef.current || mapRef.current) return;
        leafletRef.current = leaflet;
        const map = leaflet.map(mapElementRef.current, { scrollWheelZoom: true, zoomControl: true }).setView(SPARTA_CENTER, 13);
        const tileUrl = process.env.NEXT_PUBLIC_VENDOR_MAP_TILE_URL?.trim() || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        const attribution = process.env.NEXT_PUBLIC_VENDOR_MAP_ATTRIBUTION?.trim() || "&copy; OpenStreetMap contributors";
        leaflet.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);
        mapRef.current = map;
        layerRef.current = leaflet.layerGroup().addTo(map);
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) setMapError("Ο διαδραστικός χάρτης δεν μπόρεσε να φορτώσει. Η λίστα καταστημάτων παραμένει διαθέσιμη.");
      });

    return () => {
      cancelled = true;
      layerRef.current?.clearLayers();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !layerRef.current || !leafletRef.current) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    const leaflet = leafletRef.current;
    layer.clearLayers();
    const points: [number, number][] = [];

    for (const vendor of filteredVendors) {
      if (!vendor.coordinates) continue;
      const point: [number, number] = [vendor.coordinates.latitude, vendor.coordinates.longitude];
      points.push(point);
      const selected = vendor.id === selectedVendor?.id;
      const markerClass = [styles.markerPin, vendor.status === "partner" ? styles.markerPartner : styles.markerResearch, selected ? styles.markerSelected : ""].filter(Boolean).join(" ");
      const marker = leaflet.marker(point, {
        icon: leaflet.divIcon({
          className: styles.markerHost,
          html: `<span class="${markerClass}" aria-hidden="true"></span>`,
          iconSize: [34, 42],
          iconAnchor: [17, 38]
        })
      }).addTo(layer);
      const tooltip = document.createElement("span");
      tooltip.textContent = vendor.name;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -30] });
      marker.on("click", () => setSelectedId(vendor.id));
    }

    if (userLocation) {
      const userPoint: [number, number] = [userLocation.latitude, userLocation.longitude];
      points.push(userPoint);
      leaflet.marker(userPoint, {
        icon: leaflet.divIcon({
          className: styles.markerHost,
          html: `<span class="${styles.userMarker}" aria-hidden="true"></span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(layer);
    }

    if (points.length === 1) map.setView(points[0], 16);
    else if (points.length > 1) map.fitBounds(leaflet.latLngBounds(points).pad(0.14), { maxZoom: 16, padding: [26, 26] });
    else map.setView(SPARTA_CENTER, 13);
  }, [filteredVendors, mapReady, selectedVendor?.id, userLocation]);

  useEffect(() => {
    if (!mapReady || !selectedVendor?.coordinates || !mapRef.current) return;
    mapRef.current.panTo([selectedVendor.coordinates.latitude, selectedVendor.coordinates.longitude], { animate: true });
  }, [mapReady, selectedVendor?.coordinates]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setGeoMessage("Η συσκευή ή ο browser δεν υποστηρίζει εντοπισμό θέσης.");
      return;
    }
    setGeoStatus("loading");
    setGeoMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setGeoStatus("ready");
        setGeoMessage("Η λίστα ταξινομήθηκε με βάση την απόστασή σου.");
        setRadius(5);
      },
      () => {
        setGeoStatus("error");
        setGeoMessage("Δεν δόθηκε πρόσβαση στην τοποθεσία. Μπορείς να χρησιμοποιήσεις τον χάρτη χωρίς αυτήν.");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 }
    );
  }, []);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setRadius("all");
  };

  return (
    <div className={styles.directory}>
      <aside className={styles.sidebar} aria-label="Φίλτρα καταστημάτων">
        <div className={styles.filterCard}>
          <div className="eyebrow">Βρες κοντά σου</div>
          <h2>Φίλτρα χάρτη</h2>
          <label className={styles.field}>
            <span>Αναζήτηση</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 80))} placeholder="Όνομα, κατηγορία, δρόμος" />
          </label>
          <label className={styles.field}>
            <span>Κατηγορία</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">Όλες οι κατηγορίες</option>
              {categories.map((entry) => <option value={entry.key} key={entry.key}>{entry.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Κατάσταση</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as MapStatusFilter)}>
              <option value="all">Όλες οι επιχειρήσεις</option>
              <option value="partner">Ενεργοί συνεργάτες</option>
              <option value="research">Χαρτογραφημένες / invited</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Απόσταση από εμένα</span>
            <select value={String(radius)} disabled={!userLocation} onChange={(event) => setRadius(event.target.value === "all" ? "all" : Number(event.target.value) as RadiusFilter)}>
              <option value="all">Χωρίς όριο</option>
              <option value="2">Έως 2 χλμ.</option>
              <option value="5">Έως 5 χλμ.</option>
              <option value="10">Έως 10 χλμ.</option>
              <option value="25">Έως 25 χλμ.</option>
            </select>
          </label>
          <button className={`button ${styles.locationButton}`} type="button" onClick={requestLocation} disabled={geoStatus === "loading"}>
            {geoStatus === "loading" ? "Εντοπισμός…" : userLocation ? "Ανανέωση θέσης" : "Χρησιμοποίησε τη θέση μου"}
          </button>
          {geoMessage && <p className={geoStatus === "error" ? styles.geoError : styles.geoNote}>{geoMessage}</p>}
          {(query || category !== "all" || status !== "all" || radius !== "all") && <button type="button" className={styles.resetButton} onClick={clearFilters}>Καθαρισμός φίλτρων</button>}
        </div>

        <div className={styles.resultSummary}>
          <strong>{filteredVendors.length} επιχειρήσεις</strong>
          <span>{mappedCount} με διαθέσιμο σημείο στον χάρτη</span>
        </div>

        <div className={styles.vendorList}>
          {filteredVendors.map((vendor) => {
            const distance = userLocation && vendor.coordinates ? distanceKm(userLocation, vendor.coordinates) : undefined;
            const active = vendor.id === selectedVendor?.id;
            return (
              <article className={`${styles.vendorCard}${active ? ` ${styles.vendorCardActive}` : ""}`} key={vendor.id}>
                <button type="button" className={styles.vendorSelect} onClick={() => setSelectedId(vendor.id)}>
                  <span className={styles.vendorCardTop}>
                    <span className={vendor.status === "partner" ? styles.partnerBadge : styles.researchBadge}>{vendor.status === "partner" ? "Συνεργάτης" : "Invited"}</span>
                    {distance !== undefined && <strong>{formatDistance(distance)}</strong>}
                  </span>
                  <strong className={styles.vendorName}>{vendor.name}</strong>
                  <span className={styles.vendorAddress}>{[vendor.address, vendor.postcode, vendor.locality].filter(Boolean).join(" · ") || "Η διεύθυνση δεν έχει ακόμη δημοσιευθεί."}</span>
                  {vendor.categories.length > 0 && <span className={styles.vendorCategories}>{vendor.categories.map((entry) => entry.label).join(" · ")}</span>}
                </button>
                <a className={styles.vendorLink} href={vendor.href}>Άνοιγμα dossier →</a>
              </article>
            );
          })}
          {!filteredVendors.length && <div className={styles.noResults}><strong>Δεν βρέθηκαν επιχειρήσεις.</strong><span>Δοκίμασε μεγαλύτερη απόσταση ή διαφορετικά φίλτρα.</span></div>}
        </div>
      </aside>

      <section className={styles.mapPanel} aria-label="Χάρτης τοπικών επιχειρήσεων">
        <div className={styles.mapToolbar}>
          <div>
            <span className={styles.legendPartner}><i /> Ενεργός συνεργάτης</span>
            <span className={styles.legendResearch}><i /> Χαρτογραφημένη επιχείρηση</span>
          </div>
          <a href="/shops">Προβολή λίστας →</a>
        </div>
        <div className={styles.mapFrame}>
          {!mapReady && !mapError && <div className={styles.mapLoading}>Φόρτωση χάρτη…</div>}
          {mapError && <div className={styles.mapFallback}>{mapError}</div>}
          <div ref={mapElementRef} className={styles.mapCanvas} aria-label="Διαδραστικός χάρτης καταστημάτων" />

          {selectedVendor && <article className={styles.mapSelection} aria-live="polite">
            <div className={styles.selectionHead}>
              <span className={selectedVendor.status === "partner" ? styles.partnerBadge : styles.researchBadge}>{selectedVendor.status === "partner" ? "Ενεργός συνεργάτης" : "Δημόσια ερευνητική καταχώριση"}</span>
              {userLocation && selectedVendor.coordinates && <strong>{formatDistance(distanceKm(userLocation, selectedVendor.coordinates))}</strong>}
            </div>
            <h2>{selectedVendor.name}</h2>
            <p>{[selectedVendor.address, selectedVendor.postcode, selectedVendor.locality].filter(Boolean).join(", ") || "Η ακριβής τοποθεσία δεν έχει ακόμη δημοσιευθεί."}</p>
            {selectedVendor.categories.length > 0 && <div className={styles.selectionCategories}>{selectedVendor.categories.map((entry) => <span key={entry.key}>{entry.label}</span>)}</div>}
            <a className="button" href={selectedVendor.href}>Δες τη σελίδα του καταστήματος</a>
          </article>}
        </div>
      </section>
    </div>
  );
}
