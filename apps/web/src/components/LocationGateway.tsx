"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  EXPANSION_HUBS,
  EXPANSION_REGION_CODES,
  EXPANSION_REGION_LABELS,
  type ExpansionHub,
  type ExpansionRegionCode
} from "../lib/expansion-hubs";
import styles from "./LocationGateway.module.css";

type Coordinates = Readonly<{ latitude: number; longitude: number }>;
type MapsListener = { remove(): void };
type GoogleMapInstance = {
  panTo(point: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleMarkerInstance = {
  setMap(map: GoogleMapInstance | null): void;
  addListener(eventName: "click", handler: () => void): MapsListener;
};
type GoogleCircleInstance = { setMap(map: GoogleMapInstance | null): void };
type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options?: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options?: Record<string, unknown>) => GoogleMarkerInstance;
  Circle: new (options?: Record<string, unknown>) => GoogleCircleInstance;
};
type GatewayWindow = Window & typeof globalThis & {
  google?: { maps?: GoogleMapsNamespace };
  __kontaMouLocationMapsPromise?: Promise<GoogleMapsNamespace>;
};
type MapState = "loading" | "ready" | "fallback";
type LocationState = "idle" | "locating" | "ready" | "denied" | "error";
type DistanceHub = Readonly<{ hub: ExpansionHub; distanceKm?: number }>;

const STORAGE_KEY = "konta-mou-locality";
const COOKIE_KEY = "km_locality";
const GOOGLE_MAP_SCRIPT_SELECTOR = 'script[data-bls-google-maps="true"]';
const GREECE_CENTER = { lat: 38.45, lng: 23.45 };
const PRIORITY_ORDER: Record<ExpansionHub["researchPriority"], number> = { S: 0, A: 1, B: 2, C: 3 };
const MAP_BOUNDS = { minLat: 34.65, maxLat: 41.7, minLng: 19.15, maxLng: 28.65 } as const;

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
  if (hub.isSpartaLegacy) return "Υφιστάμενη περιοχή ΚΟΝΤΑ ΜΟΥ";
  if (hub.coverageMode === "WHOLE_ISLAND") return "Νησιωτική περιοχή";
  if (hub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM") return "Έως 25 km · ίδιο νησί";
  return "Ακτίνα σχεδιασμού 25 km";
}

function regionShortLabel(regionCode: ExpansionRegionCode): string {
  return regionCode === "EMT" ? "Αν. Μακεδονία & Θράκη" : EXPANSION_REGION_LABELS[regionCode];
}

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  const browser = window as GatewayWindow;
  if (browser.google?.maps) return Promise.resolve(browser.google.maps);
  if (browser.__kontaMouLocationMapsPromise) return browser.__kontaMouLocationMapsPromise;

  browser.__kontaMouLocationMapsPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const finish = () => browser.google?.maps
      ? resolve(browser.google.maps)
      : reject(new Error("Google Maps did not initialise"));
    const existing = document.querySelector<HTMLScriptElement>(GOOGLE_MAP_SCRIPT_SELECTOR);

    if (existing) {
      if (browser.google?.maps) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.blsGoogleMaps = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
    document.head.appendChild(script);
  });

  return browser.__kontaMouLocationMapsPromise;
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

function mapPointStyle(point: Coordinates): CSSProperties {
  const x = ((point.longitude - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = (1 - ((point.latitude - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat))) * 100;
  return {
    left: `${Math.min(98, Math.max(2, x))}%`,
    top: `${Math.min(97, Math.max(3, y))}%`
  };
}

export function LocationGateway() {
  const [query, setQuery] = useState("");
  const [regionCode, setRegionCode] = useState<ExpansionRegionCode | "ALL">("ALL");
  const [selectedHub, setSelectedHub] = useState<ExpansionHub>();
  const [userCoordinates, setUserCoordinates] = useState<Coordinates>();
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [mapState, setMapState] = useState<MapState>(() => process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() ? "loading" : "fallback");
  const [savedMessage, setSavedMessage] = useState("");
  const [showAllHubs, setShowAllHubs] = useState(false);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const googleMapsRef = useRef<GoogleMapsNamespace | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const markerListenersRef = useRef<MapsListener[]>([]);
  const coverageCircleRef = useRef<GoogleCircleInstance | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();

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
    if (!apiKey || !mapElementRef.current) {
      setMapState("fallback");
      return undefined;
    }

    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((googleMaps) => {
        if (cancelled || !mapElementRef.current) return;
        googleMapsRef.current = googleMaps;
        mapInstanceRef.current = new googleMaps.Map(mapElementRef.current, {
          center: GREECE_CENTER,
          zoom: 6,
          minZoom: 5,
          maxZoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
          backgroundColor: "#dcecf5"
        });
        setMapState("ready");
      })
      .catch(() => {
        if (!cancelled) setMapState("fallback");
      });

    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    const googleMaps = googleMapsRef.current;
    const map = mapInstanceRef.current;
    if (!googleMaps || !map || mapState !== "ready") return undefined;

    markerListenersRef.current.forEach((listener) => listener.remove());
    markerListenersRef.current = [];
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    visibleMapHubs.forEach((hub) => {
      const marker = new googleMaps.Marker({
        map,
        position: { lat: hub.latitude, lng: hub.longitude },
        title: `${hub.nameEl} · ${hub.regionEl}`,
        zIndex: hub.isLive ? 1000 : selectedHub?.id === hub.id ? 900 : 100
      });
      const listener = marker.addListener("click", () => {
        setSelectedHub(hub);
        setSavedMessage("");
      });
      markersRef.current.push(marker);
      markerListenersRef.current.push(listener);
    });

    return () => {
      markerListenersRef.current.forEach((listener) => listener.remove());
      markerListenersRef.current = [];
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [mapState, selectedHub?.id, visibleMapHubs]);

  useEffect(() => {
    const googleMaps = googleMapsRef.current;
    const map = mapInstanceRef.current;
    if (!googleMaps || !map || mapState !== "ready") return;

    coverageCircleRef.current?.setMap(null);
    coverageCircleRef.current = null;
    if (!selectedHub) return;

    const point = { lat: selectedHub.latitude, lng: selectedHub.longitude };
    map.panTo(point);
    map.setZoom(9);

    if (selectedHub.coverageMode === "GEODESIC_RADIUS_25KM" || selectedHub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM") {
      coverageCircleRef.current = new googleMaps.Circle({
        map,
        center: point,
        radius: selectedHub.radiusKm * 1000,
        strokeColor: "#2f8a3d",
        strokeOpacity: 0.75,
        strokeWeight: 2,
        fillColor: "#69b96f",
        fillOpacity: 0.12,
        clickable: false
      });
    }
  }, [mapState, selectedHub]);

  useEffect(() => () => {
    coverageCircleRef.current?.setMap(null);
    markerListenersRef.current.forEach((listener) => listener.remove());
    markersRef.current.forEach((marker) => marker.setMap(null));
  }, []);

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
        const nearest = EXPANSION_HUBS
          .map((hub) => ({ hub, distance: haversineDistanceKm(coordinates, { latitude: hub.latitude, longitude: hub.longitude }) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest) setSelectedHub(nearest.hub);
      },
      (error) => setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function chooseHub(hub: ExpansionHub) {
    setSelectedHub(hub);
    setSavedMessage("");
  }

  function confirmHub(hub: ExpansionHub) {
    saveLocality(hub);
    if (hub.isLive) {
      window.location.assign("/");
      return;
    }
    setSavedMessage(`${hub.nameEl}: η περιοχή αποθηκεύτηκε. Είναι ήδη στο πλάνο επέκτασης του ΚΟΝΤΑ ΜΟΥ.`);
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
        <span className={styles.scopeBadge}><strong>131</strong> περιοχές στο πλάνο επέκτασης</span>
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
              onChange={(event) => setQuery(event.target.value)}
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
            {locationState === "ready" ? "Βρήκαμε τους κοντινότερους κόμβους με βάση την τοποθεσία σου." : null}
            {locationState === "denied" ? "Η πρόσβαση στην τοποθεσία δεν επιτράπηκε. Μπορείς να επιλέξεις πόλη χειροκίνητα." : null}
            {locationState === "error" ? "Δεν μπορέσαμε να εντοπίσουμε την τοποθεσία. Η αναζήτηση πόλης λειτουργεί κανονικά." : null}
          </div>

          <div className={styles.scopeCard}>
            <span className={styles.scopeIcon} aria-hidden="true">⌖</span>
            <div>
              <strong>131 κόμβοι σε όλη την Ελλάδα</strong>
              <p>Οι ακτίνες είναι όρια σχεδιασμού. Τα νησιά παραμένουν στις δικές τους τοπικές αγορές.</p>
            </div>
          </div>
        </div>

        <section className={styles.mapSection} aria-label="Χάρτης περιοχών ΚΟΝΤΑ ΜΟΥ">
          <div ref={mapElementRef} className={`${styles.googleMap} ${mapState === "ready" ? styles.googleMapReady : ""}`} />
          {mapState !== "ready" ? (
            <div className={styles.fallbackMap} role="group" aria-label="Διαδραστικός χάρτης περιοχών">
              <div className={styles.fallbackSea} aria-hidden="true" />
              <div className={styles.mainlandShape} aria-hidden="true" />
              <div className={styles.creteShape} aria-hidden="true" />
              <div className={styles.mapGrid} aria-hidden="true" />
              {visibleMapHubs.map((hub) => (
                <button
                  type="button"
                  key={hub.id}
                  className={`${styles.mapPin} ${hub.isLive ? styles.mapPinLive : ""} ${selectedHub?.id === hub.id ? styles.mapPinSelected : ""}`}
                  style={mapPointStyle({ latitude: hub.latitude, longitude: hub.longitude })}
                  onClick={() => chooseHub(hub)}
                  aria-label={`${hub.nameEl}, ${hub.regionEl}${hub.isLive ? ", ενεργή περιοχή" : ", στο πλάνο επέκτασης"}`}
                  title={hub.nameEl}
                ><span /></button>
              ))}
              {userCoordinates ? <span className={styles.userPoint} style={mapPointStyle(userCoordinates)} aria-label="Η τοποθεσία σου" /> : null}
              <div className={styles.mapLegend}>
                <span><i className={styles.legendLive} /> Ενεργή</span>
                <span><i /> Στο πλάνο</span>
              </div>
              {mapState === "loading" ? <div className={styles.mapLoading}>Φόρτωση χάρτη…</div> : null}
            </div>
          ) : null}

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

        <aside className={styles.sheet} aria-label="Επιλογή περιοχής">
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetTop}>
            <div>
              <small>Επίλεξε την περιοχή σου</small>
              <h2>{selectedHub ? selectedHub.nameEl : "Πόλη ή περιοχή"}</h2>
            </div>
            <span>{resultCount}</span>
          </div>

          <div className={styles.regionFilters} aria-label="Φίλτρο περιφέρειας">
            <button type="button" className={regionCode === "ALL" ? styles.regionActive : ""} onClick={() => setRegionCode("ALL")}>Όλη η Ελλάδα</button>
            {EXPANSION_REGION_CODES.map((code) => (
              <button type="button" key={code} className={regionCode === code ? styles.regionActive : ""} onClick={() => setRegionCode(code)}>
                {regionShortLabel(code)}
              </button>
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
              {selectedDistance !== undefined ? <p>Περίπου {selectedDistance < 10 ? selectedDistance.toFixed(1) : Math.round(selectedDistance)} km από την τρέχουσα τοποθεσία σου.</p> : null}
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
              <div className={styles.emptyState}>
                <strong>Δεν βρέθηκε περιοχή.</strong>
                <span>Δοκίμασε διαφορετική ονομασία ή επίλεξε άλλη περιφέρεια.</span>
              </div>
            )}
          </div>

          {!shouldShowAll && resultCount > 35 ? (
            <button className={styles.showAll} type="button" onClick={() => setShowAllHubs(true)}>Προβολή και των 131 περιοχών</button>
          ) : null}

          <div className={styles.savedFeedback} aria-live="polite">{savedMessage}</div>
          <p className={styles.planNote}>Η Σπάρτη παραμένει η ενεργή πιλοτική αγορά. Οι υπόλοιπες περιοχές εμφανίζονται ως μέρος του επίσημου πλάνου επέκτασης και δεν παρουσιάζονται ως ενεργές πριν την ενεργοποίησή τους.</p>
        </aside>
      </section>
    </main>
  );
}
