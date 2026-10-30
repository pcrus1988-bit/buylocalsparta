"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PUBLIC_RESULTS_CHAPTERS, publicMetricLabel } from "../../../../lib/research-public-results-sections";
import { GREECE_PREFECTURES } from "../../../../lib/research-prefectures";
import type { SafeParticipationGeography, SafePublicResultPoint, SafeCountyAvailability } from "../../../../lib/research-public-results-data";
import styles from "./ResultsEditorial.module.css";

type Feature = { properties: { name: string }; geometry: { type: string; coordinates: unknown } };
type Geography = { type: string; features: Feature[] };
type MapLayer = { key: string; title: string; kind: "survey" | "participation"; format: "proportion" | "mean" | "count"; entries: Map<string, SafePublicResultPoint | number> };
const fmt = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });
const keyNames: ReadonlyMap<string, string> = new Map<string, string>(GREECE_PREFECTURES.map(p => [p.key, p.label]));

function formatPoint(point: SafePublicResultPoint): string {
  return point.format === "proportion" ? fmt.format(point.value * 100) + "%" : fmt.format(point.value);
}
function polygonPath(geometry: Feature["geometry"]): string {
  const ringPath = (ring: number[][]): string => ring.length
    ? "M" + ring.map(([lon, lat]) => `${(55 + (lon - 19) * 65).toFixed(1)},${(18 + (42 - lat) * 78).toFixed(1)}`).join("L") + "Z"
    : "";
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(ringPath).join(" ");
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as number[][][][]).flatMap(p => p.map(ringPath)).join(" ");
  return "";
}
function heat(value: number | undefined, min: number, max: number): string {
  if (value === undefined) return "#e5e9e4";
  const strength = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.55;
  const low = [253, 224, 148], high = [168, 49, 52];
  return "rgb(" + low.map((v, i) => Math.round(v + (high[i]! - v) * strength)).join(",") + ")";
}

const CountyAvailabilityContext = createContext<readonly SafeCountyAvailability[]>([]);
function EditorialMap({ points, geography }: { points: readonly SafePublicResultPoint[]; geography?: SafeParticipationGeography }) {
  const countyAvailability=useContext(CountyAvailabilityContext);
  const [geo, setGeo] = useState<Geography | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [chosen, setChosen] = useState("");
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/research/greece-prefectures.geojson", { signal: ctrl.signal })
      .then(res => { if (!res.ok) throw new Error("Map unavailable"); return res.json(); })
      .then((data: Geography) => { if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid map"); setGeo(data); })
      .catch(error => { if (error?.name !== "AbortError") setFailed(true); });
    return () => ctrl.abort();
  }, []);

  const layers = useMemo(() => {
    const result: MapLayer[] = [];
    for (const chapter of PUBLIC_RESULTS_CHAPTERS) {
      const keys = chapter.subchapters.flatMap(sub => sub.metrics);
      const candidates = keys.map(key => ({
        key, entries: points.filter(p => p.metricKey === key && typeof p.segment.prefectureCode === "string" && Object.keys(p.segment).length === 1)
      })).sort((a, b) => b.entries.length - a.entries.length);
      const best = candidates.find(candidate => candidate.entries.length >= 2);
      if (!best) continue;
      result.push({
        key: best.key, title: chapter.name, kind: "survey",
        format: best.entries[0]!.format,
        entries: new Map(best.entries.map(p => [p.segment.prefectureCode!, p] as const))
      });
      if (result.length >= 5) break;
    }
    if (geography?.prefectures?.length) result.push({
      key: "participation", title: "Ενάρξεις ερωτηματολογίου", kind: "participation", format: "count",
      entries: new Map(geography.prefectures.map(p => [p.key, p.started] as const))
    });
    return result;
  }, [points, geography]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) { setPlaying(false); return; }
    if (!playing || layers.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") { setActive(index => (index + 1) % layers.length); setChosen(""); }
    }, 6500);
    return () => window.clearInterval(timer);
  }, [playing, layers.length]);

  const countyBands = new Map(countyAvailability.map(c => [c.key, c.band] as const));
  const underFive = countyAvailability.filter(c => c.band === "under5").length;
  const countyBandText = (key:string) => countyBands.get(key)==="under5"?"Βάση 1–4 · χωρίς δημοσιεύσιμο αποτέλεσμα":
    countyBands.get(key)==="5to9"?"Βάση 5–9 · χωρίς αποτέλεσμα για τον δείκτη":
    countyBands.get(key)==="10to29"?"Βάση 10–29 · χωρίς αποτέλεσμα για τον δείκτη":
    "Χωρίς δημοσιεύσιμα στοιχεία";
  const countyBandColor = (key:string) => countyBands.get(key)==="under5"?"#fff1b4":
    countyBands.get(key)==="5to9"?"#ffe0a1":
    countyBands.get(key)==="10to29"?"#f4d7a5":"#e5e9e4";
  const index = Math.min(active, Math.max(layers.length - 1, 0));
  const layer = layers[index];
  const smallBaseCount = layer?.kind === "survey"
    ? [...layer.entries.values()].filter(value => typeof value !== "number" && value.n >= 5 && value.n < 30).length
    : 0;
  const values = layer ? [...layer.entries.values()].map(v => typeof v === "number" ? v : v.value) : [];
  const min = layer?.format === "proportion" ? 0 : values.length ? Math.min(...values) : 0;
  const max = layer?.format === "proportion" ? 1 : values.length ? Math.max(...values) : 1;
  const selected = chosen && layer ? layer.entries.get(chosen) : undefined;
  const displayValue = (value: SafePublicResultPoint | number | undefined): string => {
    if (value === undefined) return "Χωρίς δημοσιεύσιμα στοιχεία";
    return typeof value === "number" ? whole.format(value) + " ενάρξεις" : formatPoint(value);
  };

  const changeLayer = (next: number) => {
    if (!layers.length) return;
    setActive((next + layers.length) % layers.length);
    setChosen("");
    setPlaying(false);
  };
  const swipeEnd = (x: number) => {
    if (swipeStart.current === null) return;
    const distance = x - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) > 55 && layers.length > 1) changeLayer(index + (distance < 0 ? 1 : -1));
  };
  return <section id="results-map" className={styles.mapSection} aria-labelledby="results-map-title">
    <header className={styles.mapHeading}>
      <div>
        <span className={styles.eyebrow}>KONTA MOY RESEARCH <span aria-hidden="true">/</span> ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</span>
        <h1 id="results-map-title">Η Ελλάδα, μέσα από τις απαντήσεις της.</h1>
        <p>Εξερευνήστε τα δημοσιευμένα ευρήματα ανά νομό. Επιλέξτε θέμα ή σύρετε οριζόντια για να αλλάξετε την εικόνα.</p>
      </div>
      <span className={styles.publishedLabel}><span aria-hidden="true">●</span> Δημοσιευμένη έρευνα</span>
    </header>
    <div className={styles.mapVisual}>
      <div className={styles.mapOverlay}>
        <div className={styles.mapOverlayHead}>
          <div>
            <span className={styles.eyebrow}>ΔΙΑΔΡΑΣΤΙΚΟΣ ΧΑΡΤΗΣ · 55 ΝΟΜΟΙ</span>
            <h2>{layer?.title ?? "Γεωγραφική εικόνα"}</h2>
            <p>{layer?.kind === "survey" ? publicMetricLabel(layer.key) : layer?.kind === "participation"
              ? "Ενάρξεις ερωτηματολογίου — όχι ολοκληρωμένες απαντήσεις."
              : "Επιλέξτε ένα διαθέσιμο θέμα."}</p>
          </div>
          {layers.length > 1 && <button type="button" className={styles.playButton}
            onClick={() => setPlaying(value => !value)}
            aria-label={playing ? "Παύση αυτόματης εναλλαγής" : "Ενεργοποίηση αυτόματης εναλλαγής"}>
            {playing ? "Ⅱ Παύση" : "▷ Εναλλαγή"}
          </button>}
        </div>
        <div className={styles.layerToolbar} aria-label="Επιλογή θεματικού επιπέδου χάρτη">
          <button type="button" className={styles.layerArrow} onClick={() => changeLayer(index - 1)}
            aria-label="Προηγούμενο θέμα" disabled={layers.length < 2}>‹</button>
          <div className={styles.layerControls}
            onTouchStart={event => { swipeStart.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={event => swipeEnd(event.changedTouches[0]?.clientX ?? 0)}
            onTouchCancel={() => { swipeStart.current = null; }}>
            {layers.map((item, i) => <button key={item.key} type="button" aria-pressed={i === index}
              className={i === index ? styles.layerActive : styles.layerButton}
              onClick={() => changeLayer(i)}>
              <span className={styles.layerNumber}>{String(i + 1).padStart(2, "0")}</span>
              <span>{item.title}</span>
            </button>)}
          </div>
          <button type="button" className={styles.layerArrow} onClick={() => changeLayer(index + 1)}
            aria-label="Επόμενο θέμα" disabled={layers.length < 2}>›</button>
        </div>
      </div>
      {failed ? <p role="alert" className={styles.mapLoading}>Ο χάρτης δεν φορτώθηκε. Τα δημοσιευμένα στοιχεία παραμένουν διαθέσιμα στα αναλυτικά γραφήματα.</p>
        : !geo ? <p role="status" className={styles.mapLoading}>Φόρτωση χάρτη Ελλάδας…</p>
        : <svg viewBox="0 0 810 650" role="img" aria-label={`Χάρτης Ελλάδας ανά νομό. ${layer?.title ?? "Χωρίς γεωγραφικά στοιχεία"}.`}
          className={styles.greeceSvg}>
          {geo.features.map(feature => {
            const value = layer?.entries.get(feature.properties.name);
            const number = typeof value === "number" ? value : value?.value;
            return <path key={feature.properties.name} d={polygonPath(feature.geometry)} fillRule="evenodd"
              fill={number === undefined ? countyBandColor(feature.properties.name) : heat(number, min, max)}
              stroke="#fffdf7" strokeWidth="1.35"
              strokeDasharray={number === undefined && countyBands.has(feature.properties.name) ? "4 2" : undefined}
              className={chosen === feature.properties.name ? styles.countySelected : styles.county}
              role="button" tabIndex={0}
              aria-label={`${keyNames.get(feature.properties.name) ?? feature.properties.name}: ${value === undefined ? countyBandText(feature.properties.name) : displayValue(value)}`}
              onClick={() => setChosen(feature.properties.name)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setChosen(feature.properties.name); } }}>
              <title>{keyNames.get(feature.properties.name) ?? feature.properties.name}: {value === undefined ? countyBandText(feature.properties.name) : displayValue(value)}</title>
            </path>;
          })}
        </svg>}
      <div className={styles.mapBottom}>
        <label htmlFor="results-county">Επιλέξτε νομό
          <select id="results-county" value={chosen} onChange={e => setChosen(e.target.value)}>
            <option value="">Όλη η Ελλάδα</option>
            {GREECE_PREFECTURES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <div aria-live="polite" className={styles.mapDetail}>
          <strong>{chosen ? (keyNames.get(chosen) ?? chosen) : "Σύνολο Ελλάδας"}</strong>
          <span>{chosen && selected === undefined ? countyBandText(chosen) : chosen ? displayValue(selected) : `${layer?.entries.size ?? 0} / 55 νομοί με διαθέσιμη τιμή`}</span>
          {typeof selected === "object" && <small>Βάση n={whole.format(selected.n)}</small>}
        </div>
      </div>
    </div>
    <div className={styles.mapFoot}>
      <div className={styles.legend} aria-label="Κλίμακα χρωμάτων"><span>Χαμηλότερη τιμή</span><i aria-hidden="true"/><span>Υψηλότερη τιμή</span></div>
      <p className={styles.mapCaveat}>Οι κλίμακες προσαρμόζονται σε κάθε δείκτη. Οι νομοί χωρίς δημοσιεύσιμη εκτίμηση δεν έχουν τιμή μηδέν. {underFive > 0 ? `${underFive} νομοί έχουν βάση 1–4, χωρίς δημοσιοποίηση ατομικών απαντήσεων. ` : ""}{layer?.kind === "survey" && smallBaseCount > 0 ? `${smallBaseCount} από τους ${layer.entries.size} νομούς με τιμή έχουν βάση n=5–29. Δεν συνιστούν αξιόπιστη κατάταξη.` : ""}</p>
      <Link href="#research-workbench" className={styles.textLink}>Εξερεύνηση όλων των ευρημάτων <span aria-hidden="true">↗</span></Link>
    </div>
  </section>;
}

export function ResearchResultsEditorial({ points, geography, countyAvailability, children }: {
  points: readonly SafePublicResultPoint[];
  geography?: SafeParticipationGeography;
  countyAvailability?: readonly SafeCountyAvailability[];
  children?: ReactNode;
}) {
  return <CountyAvailabilityContext.Provider value={countyAvailability ?? []}>
    <EditorialMap points={points} geography={geography} />
    {children}
  </CountyAvailabilityContext.Provider>;
}
