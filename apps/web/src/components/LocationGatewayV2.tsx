"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXPANSION_HUBS,
  EXPANSION_REGION_CODES,
  EXPANSION_REGION_LABELS,
  type ExpansionHub,
  type ExpansionRegionCode
} from "../lib/expansion-hubs";
import styles from "./LocationGatewayV2.module.css";

export type LocationGatewayRuntimeHubV2 = Readonly<{
  hubId: string;
  lifecycleState: "inactive" | "prospect" | "active";
  isLive: boolean;
}>;

type Coordinates = Readonly<{ latitude: number; longitude: number }>;
type SearchLocation = Coordinates & Readonly<{ label: string }>;
type SearchState = "idle" | "searching" | "ready" | "not-found" | "error";
type LeafletMap = {
  setView(center: readonly [number, number], zoom: number, options?: Record<string, unknown>): LeafletMap;
  invalidateSize(): void;
  remove(): void;
};
type LeafletLayer = { addTo(map: LeafletMap): LeafletLayer; remove(): void };
type LeafletMarker = LeafletLayer & {
  on(event: "click", callback: () => void): LeafletMarker;
  bindTooltip(content: string, options?: Record<string, unknown>): LeafletMarker;
};
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): LeafletLayer;
  circleMarker(point: readonly [number, number], options?: Record<string, unknown>): LeafletMarker;
  circle(point: readonly [number, number], options?: Record<string, unknown>): LeafletLayer;
};
type GatewayWindow = Window & typeof globalThis & {
  L?: LeafletNamespace;
  __kmLocationLeaflet?: Promise<LeafletNamespace>;
};

type PublicState = "active" | "preparing" | "planned";

const STORAGE_KEY = "konta-mou-locality";
const COOKIE_KEY = "km_locality";
const LEAFLET_SCRIPT = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const MAP_CENTER = [38.35, 23.65] as const;
const NEAREST_SEARCH_RESULT_COUNT = 5;
const STATE_ORDER: Record<PublicState, number> = { active: 0, preparing: 1, planned: 2 };
const STATE_COLOR: Record<PublicState, string> = { active: "#39884b", preparing: "#c8a33b", planned: "#929b96" };

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").trim();
}

function runtimeState(runtime: LocationGatewayRuntimeHubV2 | undefined): PublicState {
  if (runtime?.lifecycleState === "active" && runtime.isLive) return "active";
  if (runtime?.lifecycleState === "prospect") return "preparing";
  return "planned";
}

function stateLabel(state: PublicState): string {
  if (state === "active") return "Αγορά διαθέσιμη";
  if (state === "preparing") return "Ετοιμάζεται";
  return "Στο πλάνο";
}

function stateDescription(state: PublicState): string {
  if (state === "active") return "Η τοπική αγορά είναι διαθέσιμη τώρα.";
  if (state === "preparing") return "Η τοπική αγορά της περιοχής ετοιμάζεται.";
  return "Η περιοχή είναι μέρος της επόμενης ανάπτυξης του ΚΟΝΤΑ ΜΟΥ.";
}

function coverageLabel(hub: ExpansionHub): string {
  if (hub.coverageMode === "WHOLE_ISLAND") return "Κάλυψη ολόκληρου νησιού";
  if (hub.coverageMode === "ISLAND_LOCKED_RADIUS_25KM") return "Τοπική κάλυψη έως 25 km";
  return "Τοπική περιοχή έως 25 km";
}

function distanceKm(from: Coordinates, hub: ExpansionHub): number {
  const radius = 6371;
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(hub.latitude - from.latitude);
  const dLon = rad(hub.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(hub.latitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortLocationLabel(value: string): string {
  return value.split(",").slice(0, 3).join(",").trim() || value;
}

function saveLocality(hub: ExpansionHub): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ slug: hub.slug, savedAt: new Date().toISOString() }));
  } catch {
    // Cookie below remains the server-readable locality hint.
  }
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(hub.slug)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function readLocality(): ExpansionHub | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { slug?: string };
    return parsed.slug ? EXPANSION_HUBS.find((hub) => hub.slug === parsed.slug) : undefined;
  } catch {
    return undefined;
  }
}

function ensureLeaflet(): Promise<LeafletNamespace> {
  const browser = window as GatewayWindow;
  if (browser.L) return Promise.resolve(browser.L);
  if (browser.__kmLocationLeaflet) return browser.__kmLocationLeaflet;

  if (!document.querySelector('link[data-km-location-map="true"]')) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = LEAFLET_CSS;
    style.dataset.kmLocationMap = "true";
    document.head.appendChild(style);
  }

  browser.__kmLocationLeaflet = new Promise<LeafletNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-km-location-map="true"]');
    const finish = () => browser.L ? resolve(browser.L) : reject(new Error("Map unavailable"));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Map unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset.kmLocationMap = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Map unavailable")), { once: true });
    document.head.appendChild(script);
  });

  return browser.__kmLocationLeaflet;
}

function regionLabel(code: ExpansionRegionCode): string {
  return code === "EMT" ? "Αν. Μακεδονία & Θράκη" : EXPANSION_REGION_LABELS[code];
}

export function LocationGatewayV2({ runtimeHubs }: Readonly<{ runtimeHubs: readonly LocationGatewayRuntimeHubV2[] }>) {
  const runtimeByHub = useMemo(() => new Map(runtimeHubs.map((hub) => [hub.hubId, hub] as const)), [runtimeHubs]);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<ExpansionRegionCode | "ALL">("ALL");
  const [selected, setSelected] = useState<ExpansionHub>();
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [searchLocation, setSearchLocation] = useState<SearchLocation>();
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<LeafletNamespace | null>(null);
  const markers = useRef<LeafletMarker[]>([]);
  const originMarker = useRef<LeafletMarker | null>(null);
  const coverage = useRef<LeafletLayer | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = readLocality();
    if (saved) {
      setSelected(saved);
      setRegion(saved.regionCode);
    }
  }, []);

  useEffect(() => () => searchAbort.current?.abort(), []);

  const distanceOrigin = searchLocation ?? coordinates;

  const hubs = useMemo(() => {
    const needle = normalize(query);
    const ranked = EXPANSION_HUBS
      .filter((hub) => searchLocation || region === "ALL" || hub.regionCode === region)
      .filter((hub) => searchLocation || !needle || normalize(`${hub.nameEl} ${hub.slug} ${hub.regionEl} ${hub.regionalUnit}`).includes(needle))
      .map((hub) => ({
        hub,
        state: runtimeState(runtimeByHub.get(hub.id)),
        distance: distanceOrigin ? distanceKm(distanceOrigin, hub) : undefined
      }))
      .sort((left, right) => {
        if (distanceOrigin && left.distance !== undefined && right.distance !== undefined) return left.distance - right.distance;
        const byState = STATE_ORDER[left.state] - STATE_ORDER[right.state];
        return byState || left.hub.nameEl.localeCompare(right.hub.nameEl, "el");
      });

    return searchLocation ? ranked.slice(0, NEAREST_SEARCH_RESULT_COUNT) : ranked;
  }, [distanceOrigin, query, region, runtimeByHub, searchLocation]);

  useEffect(() => {
    if (!mapNode.current) return undefined;
    let cancelled = false;
    ensureLeaflet().then((api) => {
      if (cancelled || !mapNode.current) return;
      leaflet.current = api;
      const instance = api.map(mapNode.current, { zoomControl: true, attributionControl: false, minZoom: 5, maxZoom: 15 });
      api.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { minZoom: 5, maxZoom: 19 }).addTo(instance);
      instance.setView(MAP_CENTER, window.matchMedia("(max-width: 760px)").matches ? 5 : 6);
      map.current = instance;
      setMapStatus("ready");
      window.setTimeout(() => instance.invalidateSize(), 0);
    }).catch(() => !cancelled && setMapStatus("error"));

    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      originMarker.current?.remove();
      coverage.current?.remove();
      map.current?.remove();
      map.current = null;
      leaflet.current = null;
    };
  }, []);

  useEffect(() => {
    const api = leaflet.current;
    const instance = map.current;
    if (!api || !instance || mapStatus !== "ready") return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = hubs.map(({ hub, state }) => api.circleMarker([hub.latitude, hub.longitude], {
      radius: selected?.id === hub.id ? 9 : state === "active" ? 7 : 5.5,
      color: "#fff",
      weight: selected?.id === hub.id ? 3 : 2,
      fillColor: STATE_COLOR[state],
      fillOpacity: 1
    }).bindTooltip(`${hub.nameEl} · ${stateLabel(state)}`, { direction: "top" }).on("click", () => setSelected(hub)).addTo(instance) as LeafletMarker);
  }, [hubs, mapStatus, selected]);

  useEffect(() => {
    const api = leaflet.current;
    const instance = map.current;
    if (!api || !instance || mapStatus !== "ready") return;

    originMarker.current?.remove();
    originMarker.current = null;
    if (!distanceOrigin) return;

    const marker = api.circleMarker([distanceOrigin.latitude, distanceOrigin.longitude], {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: "#176fca",
      fillOpacity: 1
    }).bindTooltip(searchLocation ? "Το σημείο που αναζήτησες" : "Η τοποθεσία σου", { direction: "top" }).addTo(instance) as LeafletMarker;
    originMarker.current = marker;
    instance.setView([distanceOrigin.latitude, distanceOrigin.longitude], searchLocation ? 8 : 9, { animate: true });
  }, [distanceOrigin, mapStatus, searchLocation]);

  useEffect(() => {
    const api = leaflet.current;
    const instance = map.current;
    if (!api || !instance || mapStatus !== "ready" || !selected) return;
    coverage.current?.remove();
    instance.setView([selected.latitude, selected.longitude], 9, { animate: true });
    if (selected.coverageMode !== "WHOLE_ISLAND") {
      coverage.current = api.circle([selected.latitude, selected.longitude], {
        radius: selected.radiusKm * 1000,
        color: STATE_COLOR[runtimeState(runtimeByHub.get(selected.id))],
        weight: 2,
        fillOpacity: .08
      }).addTo(instance);
    }
  }, [mapStatus, runtimeByHub, selected]);

  async function resolveTypedLocation() {
    const trimmed = query.trim();
    if (trimmed.length < 2 || searchState === "searching") return;

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchState("searching");
    setLocationError("");
    setSavedMessage("");

    try {
      const response = await fetch(`/api/location-search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("location-search-failed");

      const payload = await response.json() as { location?: SearchLocation | null };
      if (!payload.location) {
        setSearchLocation(undefined);
        setSearchState("not-found");
        setSelected(undefined);
        return;
      }

      const location = payload.location;
      const nearest = [...EXPANSION_HUBS].sort((a, b) => distanceKm(location, a) - distanceKm(location, b))[0];
      setSearchLocation(location);
      setCoordinates(undefined);
      setLocating(false);
      setRegion("ALL");
      setSearchState("ready");
      setMobileView("list");
      setSelected(nearest);
    } catch {
      if (controller.signal.aborted) return;
      setSearchLocation(undefined);
      setSearchState("error");
      setSelected(undefined);
    }
  }

  function useMyLocation() {
    searchAbort.current?.abort();
    setQuery("");
    setSearchLocation(undefined);
    setSearchState("idle");
    setRegion("ALL");
    setLocationError("");
    setSavedMessage("");
    if (!("geolocation" in navigator)) {
      setLocationError("Η συσκευή δεν υποστηρίζει εντοπισμό τοποθεσίας. Αναζήτησε την πόλη σου.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoordinates(next);
      const nearest = [...EXPANSION_HUBS].sort((a, b) => distanceKm(next, a) - distanceKm(next, b))[0];
      if (nearest) setSelected(nearest);
      setLocating(false);
    }, () => {
      setLocationError("Δεν μπορέσαμε να χρησιμοποιήσουμε την τοποθεσία σου. Αναζήτησε την πόλη σου χειροκίνητα.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 });
  }

  function chooseRegion(nextRegion: ExpansionRegionCode | "ALL") {
    searchAbort.current?.abort();
    setSearchLocation(undefined);
    setSearchState("idle");
    setCoordinates(undefined);
    setSelected(undefined);
    setRegion(nextRegion);
  }

  function confirmSelection() {
    if (!selected) return;
    saveLocality(selected);
    const state = runtimeState(runtimeByHub.get(selected.id));
    if (state === "active") {
      window.location.assign("/");
      return;
    }
    setSavedMessage(`Θα θυμόμαστε την περιοχή ${selected.nameEl}. ${state === "preparing" ? "Η αγορά ετοιμάζεται και θα εμφανιστεί εδώ μόλις είναι διαθέσιμη." : "Θα εμφανιστεί εδώ όταν το ΚΟΝΤΑ ΜΟΥ ενεργοποιηθεί στην περιοχή."}`);
  }

  const selectedState = selected ? runtimeState(runtimeByHub.get(selected.id)) : undefined;
  const selectedDistance = selected && distanceOrigin ? distanceKm(distanceOrigin, selected) : undefined;
  const hasTypedQuery = query.trim().length >= 2;
  const feedback = searchState === "searching"
    ? "Βρίσκουμε την τοποθεσία και τα κοντινότερα σημεία ΚΟΝΤΑ ΜΟΥ…"
    : searchState === "ready" && searchLocation
      ? `Βρέθηκε: ${shortLocationLabel(searchLocation.label)}. Εμφανίζονται τα ${hubs.length} κοντινότερα σημεία.`
      : searchState === "not-found"
        ? "Δεν βρήκαμε αυτή την τοποθεσία. Δοκίμασε πόλη, χωριό, περιοχή ή Τ.Κ. στην Ελλάδα."
        : searchState === "error"
          ? "Η αναζήτηση τοποθεσίας δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκίμασε ξανά."
          : locationError;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="ΚΟΝΤΑ ΜΟΥ · αρχική"><img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ" /></a>
        <a href="/" className={styles.backLink}>Πίσω στην αγορά →</a>
      </header>

      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Μια ολόκληρη πόλη. Κοντά σου.</span>
          <h1>Πού είσαι σήμερα;</h1>
          <p>Γράψε οποιαδήποτε πόλη, χωριό, περιοχή ή Τ.Κ. στην Ελλάδα και θα σου δείξουμε τα κοντινότερα σημεία ΚΟΝΤΑ ΜΟΥ.</p>
        </div>
        <button type="button" className={styles.locationButton} onClick={useMyLocation} disabled={locating}>
          <span aria-hidden="true">◎</span><span><strong>{locating ? "Σε εντοπίζουμε…" : "Χρήση τοποθεσίας μου"}</strong><small>Βρες την κοντινότερη περιοχή</small></span>
        </button>
      </section>

      <section className={styles.controls} aria-label="Αναζήτηση περιοχής">
        <form className={styles.searchForm} role="search" onSubmit={(event) => { event.preventDefault(); void resolveTypedLocation(); }}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                searchAbort.current?.abort();
                setQuery(event.target.value);
                setSearchLocation(undefined);
                setSearchState("idle");
                setCoordinates(undefined);
                setSelected(undefined);
                setRegion("ALL");
                setLocationError("");
                setSavedMessage("");
              }}
              placeholder="Πόλη, χωριό, περιοχή ή Τ.Κ."
              aria-label="Αναζήτηση πόλης, χωριού, περιοχής ή ταχυδρομικού κώδικα"
              autoComplete="off"
              maxLength={160}
            />
          </label>
          <button type="submit" className={styles.searchSubmit} disabled={!hasTypedQuery || searchState === "searching"}>{searchState === "searching" ? "Αναζήτηση…" : "Βρες κοντινότερα"}</button>
        </form>
        <div className={styles.viewToggle} aria-label="Τρόπος προβολής">
          <button type="button" className={mobileView === "list" ? styles.activeView : ""} onClick={() => setMobileView("list")}>Λίστα</button>
          <button type="button" className={mobileView === "map" ? styles.activeView : ""} onClick={() => setMobileView("map")}>Χάρτης</button>
        </div>
      </section>

      <nav className={styles.regions} aria-label="Περιφέρεια">
        <button type="button" className={region === "ALL" && !searchLocation ? styles.activeRegion : ""} onClick={() => chooseRegion("ALL")}>Όλη η Ελλάδα</button>
        {EXPANSION_REGION_CODES.map((code) => <button type="button" key={code} className={region === code && !searchLocation ? styles.activeRegion : ""} onClick={() => chooseRegion(code)}>{regionLabel(code)}</button>)}
      </nav>

      {feedback ? <p className={styles.feedback} role="status" aria-live="polite">{feedback}</p> : null}

      <section className={styles.experience}>
        <div className={`${styles.resultsPanel} ${mobileView === "map" ? styles.mobileHidden : ""}`}>
          <div className={styles.resultsHead}>
            <div><span>{searchLocation ? "Κοντινότερα σημεία" : "Περιοχές"}</span><strong>{hubs.length}</strong></div>
            <small>{searchLocation ? `Από: ${shortLocationLabel(searchLocation.label)}` : "Πράσινο: διαθέσιμη · Κίτρινο: ετοιμάζεται · Γκρι: στο πλάνο"}</small>
          </div>
          <div className={styles.resultsList}>
            {hubs.length ? hubs.map(({ hub, state, distance }) => (
              <button type="button" className={`${styles.hubRow} ${selected?.id === hub.id ? styles.selectedRow : ""}`} key={hub.id} onClick={() => setSelected(hub)}>
                <i style={{ background: STATE_COLOR[state] }} aria-hidden="true" />
                <span><strong>{hub.nameEl}</strong><small>{hub.regionEl} · {stateLabel(state)}</small></span>
                <b>{distance !== undefined ? `${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km` : "›"}</b>
              </button>
            )) : (
              <div className={styles.empty}>
                <strong>{searchState === "searching" ? "Αναζητούμε την τοποθεσία…" : "Δεν βρήκαμε άμεση αντιστοίχιση."}</strong>
                <span>{hasTypedQuery && searchState === "idle" ? "Πάτησε «Βρες κοντινότερα» για να εντοπίσουμε το σημείο και να σου προτείνουμε τις 5 κοντινότερες περιοχές." : "Δοκίμασε άλλη ονομασία ή καθάρισε το φίλτρο περιφέρειας."}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.mapPanel} ${mobileView === "list" ? styles.mobileHidden : ""}`}>
          <div ref={mapNode} className={styles.map} />
          {mapStatus === "loading" ? <div className={styles.mapMessage}>Φόρτωση χάρτη…</div> : null}
          {mapStatus === "error" ? <div className={styles.mapMessage}>Ο χάρτης δεν φορτώθηκε. Η λίστα περιοχών λειτουργεί κανονικά.</div> : null}
          <div className={styles.legend}><span><i style={{ background: STATE_COLOR.active }} />Αγορά διαθέσιμη</span><span><i style={{ background: STATE_COLOR.preparing }} />Ετοιμάζεται</span><span><i style={{ background: STATE_COLOR.planned }} />Στο πλάνο</span></div>
        </div>

        <aside className={styles.selection} aria-live="polite">
          {selected && selectedState ? <>
            <span className={styles.selectionState} style={{ color: STATE_COLOR[selectedState] }}>{stateLabel(selectedState)}</span>
            <h2>{selected.nameEl}</h2>
            <p>{selected.regionEl}</p>
            <div className={styles.selectionFacts}>
              <span>{coverageLabel(selected)}</span>
              {selectedDistance !== undefined ? <span>Περίπου {selectedDistance < 10 ? selectedDistance.toFixed(1) : Math.round(selectedDistance)} km {searchLocation ? "από το σημείο που αναζήτησες" : "από εσένα"}</span> : null}
            </div>
            <p className={styles.selectionCopy}>{stateDescription(selectedState)}</p>
            <button type="button" className={styles.primary} onClick={confirmSelection}>{selectedState === "active" ? "Μπες στην τοπική αγορά" : "Θυμήσου την περιοχή μου"}<span aria-hidden="true">→</span></button>
            {selectedState !== "active" ? <a className={styles.vendorLink} href="/join">Έχεις κατάστημα εδώ; Δες πώς συμμετέχεις →</a> : null}
          </> : <><span className={styles.selectionState}>Η περιοχή σου</span><h2>Επίλεξε μια πόλη</h2><p className={styles.selectionCopy}>Θα σου δείξουμε καθαρά αν η αγορά είναι διαθέσιμη τώρα ή αν ετοιμάζεται.</p></>}
          {savedMessage ? <div className={styles.saved}>{savedMessage}</div> : null}
        </aside>
      </section>

      <footer className={styles.footer}><span>ΚΟΝΤΑ ΜΟΥ · Η τοπική αγορά, δίπλα σου.</span><a href="/privacy">Ιδιωτικότητα</a></footer>
    </main>
  );
}
