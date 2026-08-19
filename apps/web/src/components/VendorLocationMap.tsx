"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./VendorStorefront.module.css";

type Coordinates = Readonly<{ latitude: number; longitude: number }>;
type LeafletMap = {
  setView(latLng: [number, number], zoom: number): LeafletMap;
  remove(): void;
  invalidateSize(): void;
};
type LeafletMarker = { addTo(map: LeafletMap): LeafletMarker; bindTooltip(label: string, options?: Record<string, unknown>): LeafletMarker };
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  marker(latLng: [number, number], options?: Record<string, unknown>): LeafletMarker;
  divIcon(options: Record<string, unknown>): unknown;
};
type LeafletWindow = Window & typeof globalThis & {
  L?: LeafletNamespace;
  __blsLeafletPromise?: Promise<LeafletNamespace>;
};

const LEAFLET_VERSION = "1.9.4";
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MARKER_HTML = '<span style="display:block;width:24px;height:24px;border-radius:50% 50% 50% 0;background:#183027;border:3px solid #fff;box-shadow:0 5px 16px rgba(24,48,39,.28);transform:rotate(-45deg)"></span>';

function loadLeaflet(): Promise<LeafletNamespace> {
  const browser = window as LeafletWindow;
  if (browser.L) return Promise.resolve(browser.L);
  if (browser.__blsLeafletPromise) return browser.__blsLeafletPromise;

  browser.__blsLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const cssHref = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }

    const finish = () => browser.L ? resolve(browser.L) : reject(new Error("Leaflet did not initialise"));
    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-leaflet="true"]');
    if (existing) {
      if (browser.L) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.dataset.blsLeaflet = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
    document.head.appendChild(script);
  });

  return browser.__blsLeafletPromise;
}

export function VendorLocationMap({ vendorId, vendorName, address, coordinates }: {
  vendorId: string;
  vendorName: string;
  address: string;
  coordinates?: Coordinates;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [failed, setFailed] = useState(false);
  const mapHref = `/shops/map?vendor=${encodeURIComponent(vendorId)}`;

  useEffect(() => {
    if (!coordinates || !elementRef.current) return undefined;
    let cancelled = false;

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !elementRef.current || mapRef.current) return;
        const point: [number, number] = [coordinates.latitude, coordinates.longitude];
        const map = leaflet.map(elementRef.current, { scrollWheelZoom: false, zoomControl: true }).setView(point, 16);
        leaflet.tileLayer(OSM_TILE_URL, { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
        const icon = leaflet.divIcon({ className: "", html: MARKER_HTML, iconSize: [30, 30], iconAnchor: [15, 24] });
        leaflet.marker(point, { icon }).addTo(map).bindTooltip(vendorName, { permanent: false, direction: "top" });
        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [coordinates, vendorName]);

  if (!coordinates || failed) {
    return (
      <div className={styles.mapCard}>
        <div className={styles.mapFallback}>
          <div>
            <h3>{vendorName}</h3>
            <p>{coordinates ? "Ο διαδραστικός χάρτης δεν μπόρεσε να φορτώσει." : "Δεν υπάρχουν ακόμη επαληθευμένες συντεταγμένες για αυτό το κατάστημα."} Η φυσική διεύθυνση παραμένει διαθέσιμη στα στοιχεία καταστήματος.</p>
            <a className="button button-secondary" href={mapHref}>Άνοιξε τον χάρτη καταστημάτων</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapCard}>
      <div ref={elementRef} className={styles.mapCanvas} aria-label={`Χάρτης φυσικού καταστήματος ${vendorName}`} />
      <div className={styles.mapOverlay}>
        <div>
          <strong>{vendorName}</strong>
          <span>{address}</span>
        </div>
        <a className={styles.mapLink} href={mapHref}>Μεγαλύτερος χάρτης →</a>
      </div>
    </div>
  );
}