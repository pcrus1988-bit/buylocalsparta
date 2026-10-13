"use client";

import { useEffect, useMemo, useState } from "react";
import type { GeographicMapCell, GreekRegionKey } from "../lib/research-geographic-core";

/** Browser receives only already-suppressed aggregates. Never send raw low-n cells. */
type SafeGeographicMapCell = Omit<GeographicMapCell, "respondents" | "answered" | "selected"> & Readonly<{
  respondents: number | null;
  answered: number | null;
  selected: number | null;
  /** Independently redacted percentage for conditional relationship heatmaps. */
  ratioPercent?: number | null;
}>;
import type { ResearchMapFilters } from "../lib/research-geographic-runtime";

type Geometry = { type: string; coordinates: unknown };
type Feature = { type: string; properties: { name: string; code: string }; geometry: Geometry };
type GeoJSON = { type: "FeatureCollection"; features: Feature[] };

function pathForGeometry(geometry: Geometry): string {
  // Embedded 13-region GeoJSON uses WGS84; project to an unclipped native SVG.
  const point = (lonLat: number[]) => {
    const [lon, lat] = lonLat;
    return `${(55 + (lon - 19) * 65).toFixed(1)},${(18 + (42 - lat) * 78).toFixed(1)}`;
  };
  const ring = (coordinates: number[][]) => coordinates.length
    ? "M" + coordinates.map(point).join("L") + "Z" : "";
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as number[][][]).map(ring).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).flatMap(p => p.map(ring)).join(" ");
  }
  return "";
}

function valueFor(cell: SafeGeographicMapCell, metric: ResearchMapFilters["metric"], max: number) {
  if (metric === "share") {
    if (cell.ratioPercent !== undefined) return cell.ratioPercent == null ? undefined : cell.ratioPercent / 100;
    if (cell.answered == null || cell.selected == null || cell.respondents == null) return undefined;
    return cell.selected / cell.answered;
  }
  if (cell.respondents == null) return undefined;
  return Math.log1p(cell.respondents) / Math.log1p(Math.max(1, max));
}

function heatColor(value?: number) {
  if (value === undefined) return "#d9e2e7";
  const n = Math.max(0, Math.min(1, value));
  const from = [215, 236, 238], to = [5, 103, 119];
  return "rgb(" + from.map((v, i) => Math.round(v + (to[i] - v) * n)).join(",") + ")";
}

export function GreeceResearchHeatmap({ cells, filters, root }: {
  cells: readonly SafeGeographicMapCell[];
  filters: ResearchMapFilters;
  root: string;
}) {
  const [geo, setGeo] = useState<GeoJSON | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/research/greece-regions.geojson", { signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error("Map outlines unavailable"); return res.json(); })
      .then((value: GeoJSON) => {
        if (value.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Unexpected map format");
        setGeo(value);
      })
      .catch(err => { if (err.name !== "AbortError") setLoadError(true); });
    return () => controller.abort();
  }, []);
  const max = Math.max(1, ...cells.map(x => x.respondents ?? 0));
  const cellByRegion = useMemo(() => new Map(cells.map(c => [c.key, c])), [cells]);
  const viewWidth = 810 / zoom, viewHeight = 650 / zoom;
  const viewBox = `${(810 - viewWidth) / 2} ${(650 - viewHeight) / 2} ${viewWidth} ${viewHeight}`;

  return <div style={{ display: "grid", gap: 10 }}>
    <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 14 }}>
      <strong>Χάρτης 13 Περιφερειών</strong>
      <div className="workspace-action-buttons" style={{ gap: 8 }}>
        <button type="button" className="button button-secondary"
          aria-label="Σμίκρυνση χάρτη" disabled={zoom <= 1}
          onClick={() => setZoom(v => Math.max(1, +(v / 1.25).toFixed(2)))}>−</button>
        <button type="button" className="button button-secondary"
          aria-label="Μεγέθυνση χάρτη" disabled={zoom >= 2.5}
          onClick={() => setZoom(v => Math.min(2.5, +(v * 1.25).toFixed(2)))}>+</button>
        <button type="button" className="button button-secondary" onClick={() => setZoom(1)}>Επαναφορά</button>
      </div>
    </div>
    <div style={{ background: "#edf7fa", borderRadius: 16, overflow: "hidden", border: "1px solid #cbdde1" }}>
      {loadError && <div className="workspace-inline-note form-error" role="alert">Τα γεωγραφικά όρια δεν φορτώθηκαν. Οι συγκεντρωτικοί πίνακες παραμένουν διαθέσιμοι.</div>}
      {!geo && !loadError && <div className="workspace-inline-note" role="status">Φόρτωση χάρτη Ελλάδας…</div>}
      {geo && <svg viewBox={viewBox} role="img" aria-label="Διαδραστικός χάρτης συγκεντρωτικών απαντήσεων ανά ελληνική Περιφέρεια"
        style={{ display: "block", width: "100%", maxHeight: 650 }} preserveAspectRatio="xMidYMid meet">
        {geo.features.map(feature => {
          const key = feature.properties.name as GreekRegionKey;
          const cell = cellByRegion.get(key);
          if (!cell) return null;
          const normalized = valueFor(cell, filters.metric, max);
          const valueLabel = filters.metric === "share"
            ? cell.ratioPercent !== undefined
              ? cell.ratioPercent == null ? "ανεπαρκής βάση για ασφαλή απεικόνιση" : cell.ratioPercent + "% (συγκεντρωτικό ποσοστό)"
              : cell.answered == null || cell.selected == null ? "ανεπαρκής βάση (n<10)" : (cell.selected / cell.answered * 100).toFixed(1) + "% (" + cell.selected + "/" + cell.answered + ")"
            : cell.respondents == null ? "ανεπαρκής βάση (n<10)" : cell.respondents + " ερωτηματολόγια";
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(filters)) { if (v && k !== "region") params.set(k, v); }
          params.set("region", key);
          const href = root + "/map?" + params.toString();
          return <a href={href} key={key} aria-label={cell.label + ": " + valueLabel}>
            <path d={pathForGeometry(feature.geometry)} fill={heatColor(normalized)} fillRule="evenodd"
              stroke={filters.region === key ? "#ec7f23" : "#538693"}
              strokeWidth={filters.region === key ? 2.8 : 0.95}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer", transition: "fill 160ms ease" }}>
              <title>{cell.label}: {valueLabel}. Πατήστε για ανάλυση.</title>
            </path>
          </a>;
        })}
      </svg>}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <small>Χαμηλή ένταση <span aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", width: 115, height: 12, borderRadius: 5, background: "linear-gradient(90deg,#d7ecee,#056777)" }} /> Υψηλή ένταση</small>
      <small><span style={{ display: "inline-block", width: 11, height: 11, background: "#d9e2e7", marginRight: 5 }} /> Χωρίς επαρκή βάση · όχι μηδενική τιμή</small>
    </div>
  </div>;
}
