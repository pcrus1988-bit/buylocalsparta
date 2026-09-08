"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXPANSION_HUBS,
  EXPANSION_REGION_CODES,
  EXPANSION_REGION_LABELS,
  type ExpansionHub,
  type ExpansionRegionCode
} from "../lib/expansion-hubs";
import styles from "./LocationGateway.module.css";

type Coordinates = Readonly<{ latitude: number; longitude: number }>;
type LatLngTuple = readonly [number, number];
type LeafletMap = {
  setView(center: LatLngTuple, zoom: number, options?: Record<string, unknown>): LeafletMap;
  invalidateSize(options?: Record<string, unknown>): void;
  remove(): void;
};
type LeafletLayer = {
  addTo(map: LeafletMap): LeafletLayer;
  remove(): void;
};
type LeafletInteractiveLayer = LeafletLayer & {
  on(eventName: "click", handler: () => void): LeafletInteractiveLayer;
  bindTooltip(content: string, options?: Record<string, unknown>): LeafletInteractiveLayer;
  bringToFront(): LeafletInteractiveLayer;
};
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): LeafletLayer;
  circleMarker(point: LatLngTuple, options?: Record<string, unknown>): LeafletInteractiveLayer;
  circle(point: LatLngTuple, options?: Record<string, unknown>): LeafletLayer;
};
type GatewayWindow = Window & typeof globalThis & {
  L?: LeafletNamespace;
  __kontaMouLeafletPromise?: Promise<LeafletNamespace>;
};
type MapState = "loading" | "ready" | "error";
type LocationState = "idle" | "locating" | "ready" | "denied" | "error";
type DistanceHub = Readonly<{ hub: ExpansionHub; distanceKm?: number }>;

const STORAGE_KEY = "konta-mou-locality";
const COOKIE_KEY = "km_locality";
const LEAFLET_VERSION = "1.9.4";
const LEAFLET_SCRIPT_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_STYLE_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_SCRIPT_SELECTOR = 'script[data-km-leaflet="true"]';
const LEAFLET_STYLE_SELECTOR = 'link[data-km-leaflet="true"]';
const GREECE_CENTER: LatLngTuple = [38.35, 23.65];
const PRIORITY_ORDER: Record<ExpansionHub["researchPriority"], number> = { S: 0, A: 1, B: 2, C: 3 };

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .trim();
}

function haversineDistanceKm(from: Coordinates, to: Coordinates): number {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coverageLabel(hub: ExpansionHub): string {
  if (hub.isSpartaLegacy) return "Ενεργή περιοχή · ακτίνα 25 km";
  if (hub.coverageMode === "WHOLE_ISLAND") return "Ολόκληρο το νησί";
  if (hub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM") return "Έως 25 km · ίδιο νησί";
  return "Ακτίνα σχεδιασμού 25 km";
}

function regionShortLabel(regionCode: ExpansionRegionCode): string {
  return regionCode === "EMT" ? "Αν. Μακεδονία & Θράκη" : EXPANSION_REGION_LABELS[regionCode];
}

function ensureLeafletStyle(): void {
  if (document.querySelector(LEAFLET_STYLE_SELECTOR)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_STYLE_URL;
  link.dataset.kmLeaflet = "true";
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<LeafletNamespace> {
  const browser = window as GatewayWindow;
  if (browser.L) return Promise.resolve(browser.L);
  if (browser.__kontaMouLeafletPromise) return browser.__kontaMouLeafletPromise;

  ensureLeafletStyle();
  browser.__kontaMouLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const finish = () => browser.L
      ? resolve(browser.L)
      : reject(new Error("Leaflet did not initialise"));
    const existing = document.querySelector<HTMLScriptElement>(LEAFLET_SCRIPT_SELECTOR);

    if (existing) {
      if (browser.L) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.kmLeaflet = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
    document.head.appendChild(script);
  });

  return browser.__kontaMouLeafletPromise;
}

function saveLocality(hub: ExpansionHub): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ slug: hub.slug, savedAt: new Date().toISOString() }));
  } catch {
    // Cookie remains the server-readable locality hint if storage is unavailable.
  }
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(hub.slug)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function readSavedLocality(): ExpansionHub | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { slug?: string };
    return parsed.slug ? EXPANSION_HUBS.find((hub) => hub.slug === parsed.slug) : undefined;
  } catch {
    return undefined;
  }
}

function initialMapZoom(): number {
  return window.matchMedia("(max-width: 760px)").matches ? 5 : 6;
}

function selectedMapZoom(): number {
  return 9;
}

export function LocationGateway() {
  const [query, setQuery] = useState("");
  const [regionCode, setRegionCode] = useState<ExpansionRegionCode | "ALL">("ALL");
  const [selectedHub, setSelectedHub] = useState<ExpansionHub>();
  const [userCoordinates, setUserCoordinates] = useState<Coordinates>();
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [mapState, setMapState] = useState<MapState>("loading");
  const [savedMessage, setSavedMessage] = useState("");
  const [showAllHubs, setShowAllHubs] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletNamespace | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const hubLayersRef = useRef<LeafletInteractiveLayer[]>([]);
  const userLayerRef = useRef<LeafletInteractiveLayer | null>(null);
  const coverageLayerRef = useRef<LeafletLayer | null>(null);

  useEffect(() => {
    const saved = readSavedLocality();
    if (saved) {
      setSelectedHub(saved);
      setRegionCode(saved.regionCode);
    }
  }, []);

  const distanceByHubId = useMemo(() => {
    if (!userCoordinates) return new Map<string, number>();
    return new Map(EXPANSION_HUBS.map((hub) => [
      hub.id,
      haversineDistanceKm(userCoordinates, { latitude: hub.latitude, longitude: hub.longitude })
    ]));
  }, [userCoordinates]);

  const filteredHubs = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return EXPANSION_HUBS
      .filter((hub) => {
        if (regionCode !== "ALL" && hub.regionCode !== regionCode) return false;
        if (!normalizedQuery) return true;
        return normalizeSearch([hub.nameEl, hub.slug, hub.regionEl, hub.regionalUnit].join(" ")).includes(normalizedQuery);
      })
      .map<DistanceHub>((hub) => ({ hub, distanceKm: distanceByHubId.get(hub.id) }))
      .sort((a, b) => {
        if (userCoordinates && a.distanceKm !== undefined && b.distanceKm !== undefined) return a.distanceKm - b.distanceKm;
        if (a.hub.isLive !== b.hub.isLive) return a.hub.isLive ? -1 : 1;
        const priority = PRIORITY_ORDER[a.hub.researchPriority] - PRIORITY_ORDER[b.hub.researchPriority];
        return priority || a.hub.nameEl.localeCompare(b.hub.nameEl, "el");
      });
  }, [distanceByHubId, query, regionCode, userCoordinates]);

  const visibleMapHubs = useMemo(() => filteredHubs.map(({ hub }) => hub), [filteredHubs]);

  useEffect(() => {
    if (!mapElementRef.current) return undefined;
    let cancelled = false;

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !mapElementRef.current) return;
        leafletRef.current = leaflet;
        const map = leaflet.map(mapElementRef.current, {
          zoomControl: true,
          attributionControl: false,
          minZoom: 5,
          maxZoom: 15,
          zoomAnimation: true
        });
        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          minZoom: 5,
          maxZoom: 19
        }).addTo(map);
        map.setView(GREECE_CENTER, initialMapZoom());
        mapRef.current = map;
        setMapState("ready");
        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) setMapState("error");
      });

    return () => {
      cancelled = true;
      hubLayersRef.current.forEach((layer) => layer.remove());
      hubLayersRef.current = [];
      userLayerRef.current?.remove();
      coverageLayerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || mapState !== "ready") return;

    hubLayersRef.current.forEach((layer) => layer.remove());
    hubLayersRef.current = visibleMapHubs.map((hub) => {
      const selected = selectedHub?.id === hub.id;
      const layer = leaflet.circleMarker([hub.latitude, hub.longitude], {
        radius: selected ? 9 : hub.isLive ? 7 : 5,
        color: "#ffffff",
        weight: selected ? 3 : 2,
        opacity: 1,
        fillColor: selected ? "#126c29" : hub.isLive ? "#1f6f2d" : "#58a968",
        fillOpacity: 0.96
      });
      layer
        .bindTooltip(`${hub.nameEl} · ${hub.regionEl}`, { direction: "top", offset: [0, -5], opacity: 0.92 })
        .on("click", () => chooseHub(hub))
        .addTo(map);
      if (selected) layer.bringToFront();
      return layer;
    });
  }, [mapState, selectedHub?.id, visibleMapHubs]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || mapState !== "ready") return;

    userLayerRef.current?.remove();
    userLayerRef.current = null;
    if (!userCoordinates) return;

    const layer = leaflet.circleMarker([userCoordinates.latitude, userCoordinates.longitude], {
      radius: 7,
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillColor: "#176fca",
      fillOpacity: 1
    });
    layer.bindTooltip("Η τοποθεσία σου", { direction: "top", opacity: 0.95 });
    layer.addTo(map);
    layer.bringToFront();
    userLayerRef.current = layer;
  }, [mapState, userCoordinates]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || mapState !== "ready") return;

    coverageLayerRef.current?.remove();
    coverageLayerRef.current = null;
    if (!selectedHub) return;

    const point: LatLngTuple = [selectedHub.latitude, selectedHub.longitude];
    map.setView(point, selectedMapZoom(), { animate: true });

    if (selectedHub.coverageMode !== "WHOLE_ISLAND") {
      coverageLayerRef.current = leaflet.circle(point, {
        radius: selectedHub.radiusKm * 1000,
        color: "#2f8a3d",
        weight: 2,
        opacity: 0.72,
        fillColor: "#69b96f",
        fillOpacity: 0.11,
        interactive: false
      });
      coverageLayerRef.current.addTo(map);
    }
  }, [mapState, selectedHub]);

  function requestLocation() {
    setSavedMessage("");
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserCoordinates(coordinates);
        setLocationState("ready");
        setQuery("");
        setRegionCode("ALL");
        setShowAllHubs(true);
        setSheetExpanded(false);
        const nearest = EXPANSION_HUBS
          .map((hub) => ({ hub, distance: haversineDistanceKm(coordinates, { latitude: hub.latitude, longitude: hub.longitude }) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest) setSelectedHub(nearest.hub);
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  }

  function chooseHub(hub: ExpansionHub) {
    setSelectedHub(hub);
    setSavedMessage("");
    setSheetExpanded(false);
  }

  function confirmHub(hub: ExpansionHub) {
    saveLocality(hub);
    if (hub.isLive) {
      window.location.assign("/");
      return;
    }
    setSavedMessage(`${hub.nameEl}: η περιοχή αποθηκεύτηκε. Είναι ήδη στο πλάνο επέκτασης του ΚΟΝΤΑ ΜΟΥ.`);
  }

  function selectRegion(code: ExpansionRegionCode | "ALL") {
    setRegionCode(code);
    setSheetExpanded(true);
  }

  const selectedDistance = selectedHub ? distanceByHubId.get(selectedHub.id) : undefined;
  const resultCount = filteredHubs.length;
  const shouldShowAll = showAllHubs || Boolean(query.trim()) || regionCode !== "ALL" || Boolean(userCoordinates);
  const listHubs = shouldShowAll ? filteredHubs : filteredHubs.slice(0, 35);

  return (
    <main className={styles.gateway}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="ΚΟΝΤΑ ΜΟΥ αρχική">
          <Image src="/favicon.svg" width={42} height={42} alt="" priority />
          <span>ΚΟΝΤΑ ΜΟΥ</span>
        </a>
        <span className={styles.scopeBadge}><strong>131</strong><span> περιοχές στο πλάνο επέκτασης</span></span>
      </header>

      <section className={styles.layout} aria-labelledby="location-gateway-title">
        <div className={styles.intro}>
          <div className={styles.eyebrow}>Η τοπική αγορά, δίπλα σου</div>
          <h1 id="location-gateway-title">Καλωσόρισες!</h1>
          <p>Επίλεξε την πόλη ή περιοχή σου για να δεις την τοπική αγορά κοντά σου.</p>

          <label className={styles.search}>
            <span className={styles.srOnly}>Αναζήτηση πόλης ή περιοχής</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                if (next.trim()) setSheetExpanded(true);
              }}
              placeholder="Αναζήτησε πόλη ή περιοχή…"
              autoComplete="off"
            />
          </label>

          <button className={styles.locationButton} type="button" onClick={requestLocation} disabled={locationState === "locating"}>
            <span className={styles.locationIcon} aria-hidden="true">◎</span>
            <span>
              <strong>{locationState === "locating" ? "Εντοπισμός περιοχής…" : "Χρήση τοποθεσίας μου"}</strong>
              <small>Βρες αυτόματα τον κοντινότερο κόμβο</small>
            </span>
          </button>

          <div className={styles.locationFeedback} aria-live="polite">
            {locationState === "denied" ? "Η πρόσβαση στην τοποθεσία δεν επιτράπηκε. Επίλεξε πόλη χειροκίνητα." : null}
            {locationState === "error" ? "Δεν μπορέσαμε να εντοπίσουμε την τοποθεσία. Η αναζήτηση πόλης λειτουργεί κανονικά." : null}
          </div>

          <div className={styles.scopeCard}>
            <span className={styles.scopeIcon} aria-hidden="true">⌖</span>
            <div><strong>131 κόμβοι σε όλη την Ελλάδα</strong><p>Οι ακτίνες είναι όρια σχεδιασμού. Τα νησιά παραμένουν στις δικές τους τοπικές αγορές.</p></div>
          </div>
        </div>

        <section className={styles.mapSection} aria-label="Ακριβής χάρτης περιοχών ΚΟΝΤΑ ΜΟΥ">
          <div ref={mapElementRef} className={styles.mapCanvas} />
          {mapState === "loading" ? <div className={styles.mapLoading}>Φόρτωση ακριβούς χάρτη…</div> : null}
          {mapState === "error" ? (
            <div className={styles.mapError} role="status">
              <strong>Ο χάρτης δεν μπόρεσε να φορτώσει.</strong>
              <span>Η αναζήτηση και η επιλογή περιοχής παραμένουν διαθέσιμες.</span>
            </div>
          ) : null}
          <div className={styles.mapLegend}>
            <span><i className={styles.legendLive} /> Ενεργή</span>
            <span><i /> Στο πλάνο</span>
          </div>
          <a className={styles.mapAttribution} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>

          {selectedHub ? (
            <div className={styles.mapSelection}>
              <div>
                <small>{selectedHub.regionEl}</small>
                <strong>{selectedHub.nameEl}</strong>
                <span>{coverageLabel(selectedHub)}</span>
              </div>
              <span className={selectedHub.isLive ? styles.liveDot : styles.plannedDot} aria-hidden="true" />
            </div>
          ) : null}
        </section>

        <aside className={`${styles.sheet} ${sheetExpanded ? styles.sheetExpanded : ""}`} aria-label="Επιλογή περιοχής">
          <button
            className={styles.sheetHandleButton}
            type="button"
            onClick={() => setSheetExpanded((current) => !current)}
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? "Σύμπτυξη λίστας περιοχών" : "Άνοιγμα λίστας περιοχών"}
          ><span className={styles.sheetHandle} aria-hidden="true" /></button>

          <div className={styles.sheetTop}>
            <div>
              <small>Επίλεξε την περιοχή σου</small>
              <h2>{selectedHub ? selectedHub.nameEl : "Πόλη ή περιοχή"}</h2>
            </div>
            <span>{resultCount}</span>
          </div>

          <div className={styles.regionFilters} aria-label="Φίλτρο περιφέρειας">
            <button type="button" className={regionCode === "ALL" ? styles.regionActive : ""} onClick={() => selectRegion("ALL")}>Όλη η Ελλάδα</button>
            {EXPANSION_REGION_CODES.map((code) => (
              <button type="button" key={code} className={regionCode === code ? styles.regionActive : ""} onClick={() => selectRegion(code)}>{regionShortLabel(code)}</button>
            ))}
          </div>

          {selectedHub ? (
            <div className={`${styles.selectedCard} ${selectedHub.isLive ? styles.selectedCardLive : ""}`}>
              <div className={styles.selectedHeader}>
                <span className={styles.selectedPin} aria-hidden="true">●</span>
                <div>
                  <strong>{selectedHub.nameEl}</strong>
                  <small>{selectedHub.regionEl} · {coverageLabel(selectedHub)}</small>
                </div>
                <span className={styles.statusPill}>{selectedHub.isLive ? "Ενεργή" : "Στο πλάνο"}</span>
              </div>
              {selectedDistance !== undefined ? <p>Περίπου {selectedDistance < 10 ? selectedDistance.toFixed(1) : Math.round(selectedDistance)} km από την τοποθεσία σου.</p> : null}
              <button type="button" className={styles.primaryAction} onClick={() => confirmHub(selectedHub)}>
                {selectedHub.isLive ? "Μπες στην περιοχή σου" : "Αποθήκευση περιοχής"}<span aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}

          <div className={styles.hubList}>
            {listHubs.length ? listHubs.map(({ hub, distanceKm }) => (
              <button key={hub.id} type="button" className={`${styles.hubRow} ${selectedHub?.id === hub.id ? styles.hubRowSelected : ""}`} onClick={() => chooseHub(hub)}>
                <span className={`${styles.rowPin} ${hub.isLive ? styles.rowPinLive : ""}`} aria-hidden="true">●</span>
                <span className={styles.rowCopy}>
                  <strong>{hub.nameEl}</strong>
                  <small>{hub.regionEl} · {hub.isLive ? "Ενεργή τοπική αγορά" : "Στο πλάνο επέκτασης"}</small>
                </span>
                <span className={styles.rowMeta}>{distanceKm !== undefined ? `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km` : "›"}</span>
              </button>
            )) : (
              <div className={styles.emptyState}><strong>Δεν βρέθηκε περιοχή.</strong><span>Δοκίμασε διαφορετική ονομασία ή επίλεξε άλλη περιφέρεια.</span></div>
            )}
          </div>

          {!shouldShowAll && resultCount > 35 ? <button className={styles.showAll} type="button" onClick={() => setShowAllHubs(true)}>Προβολή και των 131 περιοχών</button> : null}
          <div className={styles.savedFeedback} aria-live="polite">{savedMessage}</div>
          <p className={styles.planNote}>Η Σπάρτη παραμένει η ενεργή πιλοτική αγορά. Οι υπόλοιπες περιοχές εμφανίζονται ως μέρος του επίσημου πλάνου επέκτασης.</p>
        </aside>
      </section>
    </main>
  );
}
