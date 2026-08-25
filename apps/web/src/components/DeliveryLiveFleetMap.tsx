"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import live from "./CustomerDeliveryLiveMap.module.css";
import styles from "./DeliveryOperations.module.css";

export type DeliveryMapPoint = Readonly<{
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  receivedAt?: number;
  detail?: string;
}>;

type LeafletMap = {
  setView(point: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: [number, number][], options?: Record<string, unknown>): void;
  remove(): void;
  invalidateSize(): void;
};
type LeafletMarker = { addTo(map: LeafletMap): LeafletMarker };
type LeafletNamespace = {
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  marker(point: [number, number], options?: Record<string, unknown>): LeafletMarker;
  divIcon(options: Record<string, unknown>): unknown;
};
type DeliveryMapWindow = Window & typeof globalThis & {
  L?: LeafletNamespace;
  __blsDeliveryFleetLeafletPromise?: Promise<LeafletNamespace>;
};

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MARKER_HTML = '<span style="display:block;width:24px;height:24px;border-radius:50%;background:#183027;border:4px solid #fff;box-shadow:0 5px 18px rgba(24,48,39,.35)"></span>';

function loadLeaflet(): Promise<LeafletNamespace> {
  const browser = window as DeliveryMapWindow;
  if (browser.L) return Promise.resolve(browser.L);
  if (browser.__blsDeliveryFleetLeafletPromise) return browser.__blsDeliveryFleetLeafletPromise;

  browser.__blsDeliveryFleetLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
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
  return browser.__blsDeliveryFleetLeafletPromise;
}

function stamp(value?: number) {
  return value
    ? new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value)
    : "—";
}

export function DeliveryLiveFleetMap({
  points,
  title = "Live χάρτης",
  emptyMessage = "Δεν υπάρχει ακόμη διαθέσιμη θέση GPS.",
}: {
  points: readonly DeliveryMapPoint[];
  title?: string;
  emptyMessage?: string;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const signature = useMemo(
    () => points.map((point) => `${point.id}:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`).join("|"),
    [points],
  );

  useEffect(() => {
    if (!elementRef.current || !points.length) return undefined;
    let cancelled = false;
    let map: LeafletMap | undefined;
    setFailed(false);

    loadLeaflet().then((leaflet) => {
      if (cancelled || !elementRef.current) return;
      const first = points[0];
      map = leaflet.map(elementRef.current, { scrollWheelZoom: false, zoomControl: true })
        .setView([first.latitude, first.longitude], 15);
      leaflet.tileLayer(OSM_TILE_URL, { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
      const icon = leaflet.divIcon({ className: "", html: MARKER_HTML, iconSize: [32, 32], iconAnchor: [16, 16] });
      const bounds: [number, number][] = [];
      for (const point of points) {
        const coordinates: [number, number] = [point.latitude, point.longitude];
        bounds.push(coordinates);
        leaflet.marker(coordinates, { icon, title: point.label }).addTo(map);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      window.setTimeout(() => map?.invalidateSize(), 0);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      map?.remove();
      if (elementRef.current) elementRef.current.innerHTML = "";
    };
  }, [signature, points.length]);

  if (!points.length) {
    return <div className={live.empty}><strong>{title}</strong><span>{emptyMessage}</span></div>;
  }

  return (
    <div className={live.card}>
      <div className={live.topbar}>
        <div><strong>{title}</strong><div className={styles.muted}>{points.length} ενεργή {points.length === 1 ? "θέση" : "θέσεις"}</div></div>
        <span className={live.liveDot}>LIVE</span>
      </div>
      {failed
        ? <div className={live.empty}><strong>Ο χάρτης δεν φορτώθηκε</strong><span>Οι θέσεις GPS παραμένουν διαθέσιμες. Δοκίμασε ανανέωση της σελίδας.</span></div>
        : <div ref={elementRef} className={live.canvas} aria-label={title} />}
      <div className={styles.stopList}>
        {points.map((point) => (
          <div className={styles.stop} key={point.id}>
            <span className={styles.stopIndex}>●</span>
            <div><strong>{point.label}</strong>{point.detail && <div className={styles.muted}>{point.detail}</div>}</div>
            <span className={styles.status}>{stamp(point.receivedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
