"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PublicResearchStudySummary } from "../lib/research-observatory-runtime";
import styles from "./ResearchParticipationHeatmap.module.css";

type Geometry = { type: string; coordinates: unknown };
type Feature = { properties: { name: string }; geometry: Geometry };
type Outline = { key: string; path: string };

function project(geometry: Geometry): string {
  const ring = (points: number[][]) => points.length ? "M" + points.map(([lon, lat]) =>
    `${(55 + (lon - 19) * 65).toFixed(1)},${(18 + (42 - lat) * 78).toFixed(1)}`).join("L") + "Z" : "";
  if (geometry.type === "Polygon") return (geometry.coordinates as number[][][]).map(ring).join(" ");
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as number[][][][]).flatMap(p => p.map(ring)).join(" ");
  return "";
}

const format = (value: number) => value.toLocaleString("el-GR");
function color(count: number, maximum: number): string {
  if (count === 0) return "#e4e9e6";
  const intensity = Math.sqrt(count / Math.max(1, maximum));
  return `rgb(${[220, 239, 221].map((v, i) => Math.round(v + ([20, 94, 65][i] - v) * intensity)).join(",")})`;
}

export function ResearchParticipationHeatmap({ geography }: {
  geography: PublicResearchStudySummary["participationGeography"];
}) {
  const mapId = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 405, y: 325 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [outlines, setOutlines] = useState<Outline[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/research/greece-regions.geojson", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Map unavailable");
        const data = await response.json() as { type: string; features: Feature[] };
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid map");
        setOutlines(data.features.map(feature => ({ key: feature.properties.name, path: project(feature.geometry) })));
      })
      .catch(error => { if (error.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);
  const regions = geography?.regions;
  const byKey = useMemo(() => new Map(regions?.map(region => [region.key, region])), [regions]);
  const ranked = useMemo(() => regions ? [...regions].sort((a, b) => b.started - a.started) : [], [regions]);
  const maximum = Math.max(1, ...ranked.map(region => region.started));
  const mapped = ranked.reduce((sum, region) => sum + region.started, 0);
  const width = 810 / zoom, height = 650 / zoom;
  const viewBox = `${center.x - width / 2} ${center.y - height / 2} ${width} ${height}`;
  const hasDensity = Boolean(geography?.densityImage);

  return <section className={styles.panel} aria-labelledby="participation-map-title">
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>Η συμμετοχή στον χάρτη</span>
        <h2 id="participation-map-title">Από κάθε γωνιά της Ελλάδας</h2>
        <p>Από πού προέρχονται οι επιχειρήσεις που ξεκίνησαν το ερωτηματολόγιο.</p>
      </div>
      {geography && <div className={styles.total}><strong>{format(mapped)}</strong><span>ενάρξεις με γνωστή Περιφέρεια</span></div>}
    </header>
    {!geography ? <p role="status">Τα γεωγραφικά στοιχεία δεν είναι διαθέσιμα αυτή τη στιγμή.</p> : <>
      <div className={styles.layout}>
        <div>
          <div className={styles.mapTools} aria-label="Χειρισμός χάρτη">
            <span>Πυκνότητα συμμετοχής</span>
            <div>
              <button type="button" aria-label="Σμίκρυνση χάρτη" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 1.5))}>−</button>
              <button type="button" aria-label="Μεγέθυνση χάρτη" disabled={zoom >= 4} onClick={() => {
                setZoom(value => Math.min(4, value * 1.5));
              }}>+</button>
              <button type="button" onClick={() => { setZoom(1); setCenter({x:405,y:325}); }}>Όλη η Ελλάδα</button>
            </div>
          </div>
          <div className={styles.map}>
            {failed ? <p role="status">Ο χάρτης δεν φορτώθηκε. Δείτε τις Περιφέρειες στον πίνακα.</p>
              : !outlines ? <p role="status">Φόρτωση χάρτη Ελλάδας…</p>
              : <svg viewBox={viewBox} role="img" aria-label="Ομαλός θερμικός χάρτης πυκνότητας συμμετοχής από ταχυδρομικούς κώδικες"
                style={{ touchAction: zoom > 1 ? "none" : "pan-y", cursor: zoom > 1 ? "grab" : undefined }}
                onPointerDown={event => {
                  if (zoom <= 1) return;
                  drag.current = { x: event.clientX, y: event.clientY, cx: center.x, cy: center.y };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }} onPointerMove={event => {
                  if (!drag.current) return;
                  const box = event.currentTarget.getBoundingClientRect();
                  const scale = Math.max(width / box.width, height / box.height);
                  setCenter({ x: Math.max(width / 2, Math.min(810 - width / 2, drag.current.cx - (event.clientX - drag.current.x) * scale)),
                    y: Math.max(height / 2, Math.min(650 - height / 2, drag.current.cy - (event.clientY - drag.current.y) * scale)) });
                }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <defs>
                  <clipPath id={mapId + "land"}>{outlines.map(outline => <path key={outline.key} d={outline.path} fillRule="evenodd" clipRule="evenodd" />)}</clipPath>
                </defs>
                {outlines.map(outline => {
                  const region = byKey.get(outline.key);
                  if (!region) return null;
                  return <path key={outline.key} d={outline.path} fill={hasDensity ? "#e5eee7" : color(region.started, maximum)} fillRule="evenodd"
                    className={selected === region.key ? styles.active : undefined}
                    stroke="#6b9282" strokeWidth="0.8" vectorEffect="non-scaling-stroke"
                    />;
                })}
                {hasDensity && <image href={geography.densityImage} x="0" y="0" width="810" height="650"
                  preserveAspectRatio="none" clipPath={`url(#${mapId}land)`} pointerEvents="none" />}
              </svg>}
          </div>
          <div className={styles.legend}><span>Λιγότερες</span><i aria-hidden="true" className={hasDensity ? styles.densityLegend : undefined} /><span>Περισσότερες ενάρξεις</span></div>
          <p className={styles.detail}>Μεγεθύνετε και σύρετε τον χάρτη για να δείτε την πυκνότητα συμμετοχής.</p>
        </div>
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption>Ερωτηματολόγια που ξεκίνησαν ανά Περιφέρεια</caption>
          <thead><tr><th scope="col">Περιφέρεια</th><th scope="col">Ξεκίνησαν</th></tr></thead>
          <tbody>{ranked.map(region => <tr key={region.key} className={selected === region.key ? styles.selectedRow : undefined}>
            <th scope="row"><button type="button" onClick={() => { setSelected(region.key); }} aria-pressed={selected === region.key}>
              <span aria-hidden="true" style={{ background: color(region.started, maximum) }} />{region.label}</button></th>
            <td>{format(region.started)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <p className={styles.note}>Περιλαμβάνονται όλα τα ερωτηματολόγια που ξεκίνησαν στην κύρια έρευνα, ακόμη κι αν δεν έχουν ολοκληρωθεί. Η πιλοτική δοκιμή εξαιρείται. Η περιοχή αφορά την έδρα της επιχείρησης από τα στοιχεία του ΓΕΜΗ, όχι την τοποθεσία της συσκευής.</p>
      <p className={styles.note}>Η ένταση υπολογίζεται από όλες τις ενάρξεις με αξιόπιστη αντιστοίχιση Τ.Κ., στις συντεταγμένες αναφοράς κάθε ταχυδρομικής περιοχής. Δεν απεικονίζονται μεμονωμένες επιχειρήσεις ή ακριβείς διευθύνσεις.</p>
      {geography.densityMapped !== undefined && <p className={styles.note}>{format(geography.densityMapped)} ενάρξεις στον θερμικό χάρτη · {format(geography.postcodeUnmatched ?? 0)} χωρίς αξιόπιστη αντιστοίχιση Τ.Κ.</p>}
      <p className={styles.note}>Γεωγραφικά σημεία: <a href="https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units/postal-codes" target="_blank" rel="noreferrer">© Ευρωπαϊκή Ένωση — GISCO, 2024 · Τ.Κ. 2025</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Προσαρμογή ονομάτων και στρογγυλοποίηση συντεταγμένων. <a href="/research/greece-postcode-points.json">Γεωγραφικό αρχείο</a>.</p>
      {geography.unresolved > 0 && <p className={styles.note}>{format(geography.unresolved)} ενάρξεις χωρίς διαθέσιμη αντιστοίχιση Περιφέρειας δεν τοποθετούνται στον χάρτη.</p>}
    </>}
  </section>;
}
