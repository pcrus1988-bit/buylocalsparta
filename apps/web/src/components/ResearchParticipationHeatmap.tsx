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
  const [townKey, setTownKey] = useState<string | null>(null);
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
  const towns = geography?.towns ?? [];
  const activeTown = towns.find(town => town.key === townKey);
  const point = (town: { longitude: number; latitude: number }) => ({
    x: 55 + (town.longitude - 19) * 65, y: 18 + (42 - town.latitude) * 78
  });
  const width = 810 / zoom, height = 650 / zoom;
  const viewBox = `${center.x - width / 2} ${center.y - height / 2} ${width} ${height}`;
  const hasTowns = towns.length > 0;
  const active = byKey.get(selected ?? "");
  const label = (region: NonNullable<typeof regions>[number]) => `${region.label}: ${format(region.started)} ερωτηματολόγια που ξεκίνησαν`;

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
            <span>Πόλεις και περιοχές Τ.Κ.</span>
            <div>
              <button type="button" aria-label="Σμίκρυνση χάρτη" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 1.5))}>−</button>
              <button type="button" aria-label="Μεγέθυνση χάρτη" disabled={zoom >= 4} onClick={() => {
                if (activeTown) setCenter(point(activeTown));
                setZoom(value => Math.min(4, value * 1.5));
              }}>+</button>
              <button type="button" onClick={() => { setZoom(1); setCenter({x:405,y:325}); setTownKey(null); }}>Όλη η Ελλάδα</button>
            </div>
          </div>
          <div className={styles.map}>
            {failed ? <p role="status">Ο χάρτης δεν φορτώθηκε. Δείτε τις Περιφέρειες στον πίνακα.</p>
              : !outlines ? <p role="status">Φόρτωση χάρτη Ελλάδας…</p>
              : <svg viewBox={viewBox} role="group" aria-label="Χάρτης πυκνότητας συμμετοχής ανά πόλη από ταχυδρομικούς κώδικες"
                style={{ touchAction: zoom > 1 ? "none" : "pan-y", cursor: zoom > 1 ? "grab" : undefined }}
                onPointerDown={event => {
                  if (zoom <= 1 || (event.target as Element).tagName.toLowerCase() === "circle") return;
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
                  <radialGradient id={mapId + "heat"}>
                    <stop offset="0%" stopColor="#d35b26" stopOpacity=".85" />
                    <stop offset="28%" stopColor="#e6a833" stopOpacity=".7" />
                    <stop offset="60%" stopColor="#71aa6c" stopOpacity=".42" />
                    <stop offset="100%" stopColor="#71aa6c" stopOpacity="0" />
                  </radialGradient>
                </defs>
                {outlines.map(outline => {
                  const region = byKey.get(outline.key);
                  if (!region) return null;
                  return <path key={outline.key} d={outline.path} fill={hasTowns ? "#e5eee7" : color(region.started, maximum)} fillRule="evenodd"
                    className={selected === region.key ? styles.active : undefined}
                    stroke="#6b9282" strokeWidth="0.8" vectorEffect="non-scaling-stroke"
                    tabIndex={0} role="button" aria-label={label(region)} aria-pressed={selected === region.key}
                    onMouseEnter={() => setSelected(region.key)} onFocus={() => setSelected(region.key)}
                    onClick={() => setSelected(region.key)} onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(region.key); }
                    }}><title>{label(region)}</title></path>;
                })}
                {hasTowns && <g clipPath={`url(#${mapId}land)`} pointerEvents="none">
                  {towns.map(town => { const p = point(town); return <circle key={town.key} cx={p.x} cy={p.y}
                    r={15 + 12 * Math.log1p(town.started)} fill={`url(#${mapId}heat)`} />; })}
                </g>}
                {towns.map((town, index) => {
                  const p = point(town);
                  const townLabel = `${town.label}: ${format(town.started)} ερωτηματολόγια που ξεκίνησαν`;
                  return <g key={town.key}>
                    <circle cx={p.x} cy={p.y} r={Math.max(3, 5 / zoom)} fill="#184d38" stroke="#fff" strokeWidth={1 / zoom}
                      role="button" tabIndex={0} aria-label={townLabel} aria-pressed={town.key === townKey}
                      onClick={() => { setTownKey(town.key); setSelected(town.region); }}
                      onFocus={() => { setTownKey(town.key); setSelected(town.region); }}
                      onMouseEnter={() => { setTownKey(town.key); setSelected(town.region); }}
                      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setTownKey(town.key); setSelected(town.region); } }}>
                      <title>{townLabel}</title>
                    </circle>
                    {(town.key === townKey || (zoom === 1 && index < 7) || (zoom > 1 && town.started >= 5)) && <text
                      x={p.x + 7 / zoom} y={p.y - 7 / zoom} fontSize={11 / zoom} className={styles.townLabel}
                      pointerEvents="none">{town.label}</text>}
                  </g>;
                })}
              </svg>}
          </div>
          <div className={styles.legend}><span>Λιγότερες</span><i aria-hidden="true" className={hasTowns ? styles.densityLegend : undefined} /><span>Περισσότερες ενάρξεις</span></div>
          <p className={styles.detail} aria-live="polite">{activeTown ? `${activeTown.label}: ${format(activeTown.started)} ερωτηματολόγια που ξεκίνησαν` : active ? label(active) : "Αγγίξτε μια πόλη για λεπτομέρειες. Μεγεθύνετε και σύρετε τον χάρτη."}</p>
        </div>
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption>Ερωτηματολόγια που ξεκίνησαν ανά Περιφέρεια</caption>
          <thead><tr><th scope="col">Περιφέρεια</th><th scope="col">Ξεκίνησαν</th></tr></thead>
          <tbody>{ranked.map(region => <tr key={region.key} className={selected === region.key ? styles.selectedRow : undefined}>
            <th scope="row"><button type="button" onClick={() => { setSelected(region.key); setTownKey(null); }} aria-pressed={selected === region.key}>
              <span aria-hidden="true" style={{ background: color(region.started, maximum) }} />{region.label}</button></th>
            <td>{format(region.started)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <p className={styles.note}>Περιλαμβάνονται όλα τα ερωτηματολόγια που ξεκίνησαν στην κύρια έρευνα, ακόμη κι αν δεν έχουν ολοκληρωθεί. Η πιλοτική δοκιμή εξαιρείται. Η περιοχή αφορά την έδρα της επιχείρησης από τα στοιχεία του ΓΕΜΗ, όχι την τοποθεσία της συσκευής.</p>
      <p className={styles.note}>Η ομαλή ένταση δείχνει συγκέντρωση συμμετοχών σε προσεγγιστικές περιοχές ταχυδρομικών κωδίκων, όχι διευθύνσεις επιχειρήσεων. Εμφανίζονται ομάδες τουλάχιστον 3 συμμετοχών ανά πόλη/περιοχή. Ο πίνακας Περιφερειών περιλαμβάνει όλες τις ενάρξεις.</p>
      {geography.towns !== undefined && <p className={styles.note}>{format(towns.reduce((sum, town) => sum + town.started, 0))} ενάρξεις στην τοπική απεικόνιση · {format(geography.postcodeUnmatched ?? 0)} χωρίς αξιόπιστη αντιστοίχιση Τ.Κ. · {format(geography.townWithheld ?? 0)} σε μικρότερες ομάδες που δεν εμφανίζονται χωριστά.</p>}
      <p className={styles.note}>Γεωγραφικά σημεία: <a href="https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units/postal-codes" target="_blank" rel="noreferrer">© Ευρωπαϊκή Ένωση — GISCO, 2024 · Τ.Κ. 2025</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Προσαρμογή ονομάτων και στρογγυλοποίηση συντεταγμένων. <a href="/research/greece-postcode-points.json">Γεωγραφικό αρχείο</a>.</p>
      {geography.unresolved > 0 && <p className={styles.note}>{format(geography.unresolved)} ενάρξεις χωρίς διαθέσιμη αντιστοίχιση Περιφέρειας δεν τοποθετούνται στον χάρτη.</p>}
    </>}
  </section>;
}
