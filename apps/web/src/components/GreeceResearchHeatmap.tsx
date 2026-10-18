"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GeographicMapCell, GreekRegionKey } from "../lib/research-geographic-core";

/** Browser receives only already-suppressed aggregates. Never send raw low-n cells. */
type SafeGeographicMapCell = Omit<GeographicMapCell, "respondents" | "answered" | "selected"> & Readonly<{
  respondents: number | null;
  answered: number | null;
  selected: number | null;
  /** Independently redacted percentage for conditional relationship heatmaps. */
  ratioPercent?: number | null;
  /** Only computed from already-disclosed percentages, never low-sample counts. */
  differencePoints?: number | null;
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


function differenceColor(delta?: number): string {
  if (delta === undefined) return "#d9e2e7";
  const t = Math.min(1, Math.abs(delta) / 40);
  const from = [245, 245, 238];
  const to = delta < 0 ? [168, 81, 82] : [8, 119, 131];
  return "rgb(" + from.map((n, index) => Math.round(n + t * (to[index] - n))).join(",") + ")";
}

export function GreeceResearchHeatmap({ cells, filters, root, onRegionSelect, visualization = "standard", densityImage, densityKind = "count" }: {
  cells: readonly SafeGeographicMapCell[];
  filters: ResearchMapFilters;
  root: string;
  onRegionSelect?: (region: GreekRegionKey) => void;
  visualization?: "standard" | "difference";
  /** Optional server-rendered Gaussian raster: no postcode points are sent to client. */
  densityImage?: string;
  densityKind?: "count" | "prevalence";
}) {
  const imageId = useId().replace(/:/g,"");
  const drag = useRef<{x:number;y:number;cx:number;cy:number;active:boolean}|null>(null);
  const suppressNextClick = useRef(false);
  const [center,setCenter] = useState({x:405,y:325});
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
  const viewBox = `${center.x-viewWidth/2} ${center.y-viewHeight/2} ${viewWidth} ${viewHeight}`;
  function changeZoom(next:number) {
    const z=Math.max(1,Math.min(4,next));
    setZoom(z);
    if(z===1)setCenter({x:405,y:325});
    else setCenter(p=>({x:Math.max(810/z/2,Math.min(810-810/z/2,p.x)),
      y:Math.max(650/z/2,Math.min(650-650/z/2,p.y))}));
  }

  return <div style={{ display: "grid", gap: 10 }}>
    <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 14 }}>
      <strong>{densityImage ? "Ομαλός θερμικός χάρτης Τ.Κ. · χωρίς σημεία" : "Χάρτης 13 Περιφερειών"}</strong>
      <div className="workspace-action-buttons" style={{ gap: 8 }}>
        <button type="button" className="button button-secondary"
          aria-label="Σμίκρυνση χάρτη" disabled={zoom <= 1}
          onClick={() => changeZoom(+(zoom / 1.25).toFixed(2))}>−</button>
        <button type="button" className="button button-secondary"
          aria-label="Μεγέθυνση χάρτη" disabled={zoom >= 4}
          onClick={() => changeZoom(+(zoom * 1.25).toFixed(2))}>+</button>
        <button type="button" className="button button-secondary" onClick={() => changeZoom(1)}>Επαναφορά</button>
      </div>
    </div>
    <div style={{ background: "#edf7fa", borderRadius: 16, overflow: "hidden", border: "1px solid #cbdde1" }}>
      {loadError && <div className="workspace-inline-note form-error" role="alert">Τα γεωγραφικά όρια δεν φορτώθηκαν. Οι συγκεντρωτικοί πίνακες παραμένουν διαθέσιμοι.</div>}
      {!geo && !loadError && <div className="workspace-inline-note" role="status">Φόρτωση χάρτη Ελλάδας…</div>}
      {geo && <svg viewBox={viewBox} role={onRegionSelect ? "group" : "img"}
        aria-label={densityImage ? "Συνεχής ομαλός θερμικός χάρτης από προστατευμένες ομάδες ταχυδρομικών περιοχών, χωρίς ακριβείς τοποθεσίες" : "Διαδραστικός χάρτης συγκεντρωτικών απαντήσεων ανά ελληνική Περιφέρεια"}
        style={{display:"block",width:"100%",maxHeight:650,
          touchAction:densityImage&&zoom>1?"none":"pan-y",
          cursor:densityImage&&zoom>1?"grab":undefined}}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={densityImage && zoom>1 ? event=>{
          drag.current={x:event.clientX,y:event.clientY,cx:center.x,cy:center.y,active:false};
          event.currentTarget.setPointerCapture(event.pointerId);
        }:undefined}
        onPointerMove={densityImage && zoom>1 ? event=>{
          const prior=drag.current;if(!prior)return;
          if(Math.abs(event.clientX-prior.x)>4||Math.abs(event.clientY-prior.y)>4)
            prior.active=true;
          if(!prior.active)return;
          const box=event.currentTarget.getBoundingClientRect();
          const scale=Math.max(viewWidth/box.width,viewHeight/box.height);
          setCenter({
            x:Math.max(viewWidth/2,Math.min(810-viewWidth/2,prior.cx-(event.clientX-prior.x)*scale)),
            y:Math.max(viewHeight/2,Math.min(650-viewHeight/2,prior.cy-(event.clientY-prior.y)*scale))
          });
        }:undefined}
        onPointerUp={densityImage ? ()=>{
          suppressNextClick.current=Boolean(drag.current?.active);
          drag.current=null;
        }:undefined}
        onPointerCancel={densityImage ? ()=>{drag.current=null;}:undefined}>
        {densityImage && <><defs><clipPath id={imageId+"land"}>
          {geo.features.map(feature=><path key={feature.properties.name}
            d={pathForGeometry(feature.geometry)} fillRule="evenodd" clipRule="evenodd"/>)}
        </clipPath></defs>
        {geo.features.map(feature=><path key={feature.properties.name}
          d={pathForGeometry(feature.geometry)} fill="#e5eee7" fillRule="evenodd"/>)}
        <image href={densityImage} x="0" y="0" width="810" height="650"
          preserveAspectRatio="none" clipPath={`url(#${imageId}land)`}
          pointerEvents="none" />
        </>}
        {geo.features.map(feature => {
          const key = feature.properties.name as GreekRegionKey;
          const cell = cellByRegion.get(key);
          if (!cell) return null;
          const normalized = valueFor(cell, filters.metric, max);
          const difference = visualization === "difference" ? cell.differencePoints : undefined;
          const clippedDifference = difference == null ? undefined : Math.max(-40, Math.min(40, difference));
          const color = densityImage ? "transparent" : visualization === "difference" ? differenceColor(clippedDifference) : heatColor(normalized);
          const valueLabel = filters.metric === "share"
            ? cell.ratioPercent !== undefined
              ? cell.ratioPercent == null ? "ανεπαρκής βάση για ασφαλή απεικόνιση" : cell.ratioPercent + "% (συγκεντρωτικό ποσοστό)"
              : cell.answered == null || cell.selected == null ? "ανεπαρκής βάση (n<10)" : (cell.selected / cell.answered * 100).toFixed(1) + "% (" + cell.selected + "/" + cell.answered + ")"
            : cell.respondents == null ? "ανεπαρκής βάση (n<10)" : cell.respondents + " ερωτηματολόγια";
          const label = visualization === "difference"
            ? difference == null ? "ανεπαρκής βάση" : (difference > 0 ? "+" : "") + difference + " ποσοστιαίες μονάδες"
            : valueLabel;
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(filters)) { if (v && k !== "region") params.set(k, v); }
          params.set("region", key);
          const href = (root.endsWith("/map/relations") || root.endsWith("/map/distribution") ? root : root + "/map") + "?" + params.toString();
          return <a href={href} key={key} aria-label={cell.label + ": " + label}
            onClick={onRegionSelect ? event => {
              event.preventDefault();
              if(suppressNextClick.current){suppressNextClick.current=false;return;}
              onRegionSelect(key);
            } : undefined}>
            <path d={pathForGeometry(feature.geometry)} fill={color} fillRule="evenodd"
              stroke={filters.region === key ? "#ec7f23" : "#538693"}
              strokeWidth={filters.region === key ? 2.8 : 0.95}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer", transition: "fill 160ms ease" }}>
              <title>{cell.label}: {label}. Πατήστε για ανάλυση.</title>
            </path>
          </a>;
        })}
      </svg>}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      {densityImage ? <small>{densityKind === "prevalence" ? "Χαμηλότερο τοπικό ποσοστό" : "Μικρότερη συγκέντρωση"} <span aria-hidden="true" style={{display:"inline-block",verticalAlign:"middle",width:115,height:12,borderRadius:5,background:"linear-gradient(90deg,#69a772,#dfc24d,#e2832b,#b4321e)"}}/> {densityKind === "prevalence" ? "Υψηλότερο τοπικό ποσοστό" : "Μεγαλύτερη συγκέντρωση"}</small> : visualization === "difference" ? <small>−40 π.μ. <span aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", width: 115, height: 12, borderRadius: 5, background: "linear-gradient(90deg,#a85152,#f5f5ee,#087783)" }} /> +40 π.μ.</small> : <small>Χαμηλή ένταση <span aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", width: 115, height: 12, borderRadius: 5, background: "linear-gradient(90deg,#d7ecee,#056777)" }} /> Υψηλή ένταση</small>}
      <small><span style={{ display: "inline-block", width: 11, height: 11, background: "#d9e2e7", marginRight: 5 }} /> Χωρίς επαρκή βάση · όχι μηδενική τιμή</small>
    </div>
  </div>;
}
