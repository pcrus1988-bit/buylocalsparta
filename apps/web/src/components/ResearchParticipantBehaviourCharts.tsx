"use client";

import { useState } from "react";

type Point = Readonly<{ label: string; started: number; saved?: number }>;
type Bucket = Readonly<{ key: string; label: string; count: number }>;

const integer = (x: number) => new Intl.NumberFormat("el-GR").format(x);
const colorStarted = "#18634a";
const colorSaved = "#c28a23";

function TrendChart({ rows, twoSeries, title, description }: {
  rows: readonly Point[];
  twoSeries?: boolean;
  title: string;
  description: string;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const [showStarted, setShowStarted] = useState(true);
  const [showSaved, setShowSaved] = useState(true);
  const max = Math.max(1, ...rows.flatMap(row => [
    ...(showStarted ? [row.started] : []),
    ...(twoSeries && showSaved ? [row.saved ?? 0] : [])
  ]));
  const ceiling = max <= 10 ? Math.ceil(max) : Math.ceil(max / 10) * 10;
  const width = 860, height = 282, left = 47, right = 17, top = 22, bottom = 53;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (i: number) => left + (rows.length <= 1 ? plotWidth / 2 : i * plotWidth / (rows.length - 1));
  const y = (v: number) => top + plotHeight * (1 - v / ceiling);
  const line = (key: "started" | "saved") => rows.map((row, i) => 
    (i ? "L" : "M") + x(i).toFixed(1) + " " + y(row[key] ?? 0).toFixed(1)
  ).join(" ");
  const selected = focus !== null ? rows[focus] : undefined;
  const tickStep = Math.max(1, Math.ceil(rows.length / 9));
  return <article className="workspace-queue-card" style={{ minWidth: 0, padding: "clamp(12px, 2vw, 24px)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div>
        <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
        <small>{description}</small>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} role="group" aria-label="Show chart series">
        <button type="button" aria-pressed={showStarted} onClick={() => setShowStarted(v => !v)}
          style={{ cursor: "pointer", border: 0, padding: 4, background: "transparent", opacity: showStarted ? 1 : .4, color: "inherit" }}>
          <span aria-hidden style={{ display: "inline-block", width: 17, borderTop: "3px solid " + colorStarted, verticalAlign: "middle", marginRight: 6 }} />
          Starts
        </button>
        {twoSeries && <button type="button" aria-pressed={showSaved} onClick={() => setShowSaved(v => !v)}
          style={{ cursor: "pointer", border: 0, padding: 4, background: "transparent", opacity: showSaved ? 1 : .4, color: "inherit" }}>
          <span aria-hidden style={{ display: "inline-block", width: 17, borderTop: "3px solid " + colorSaved, verticalAlign: "middle", marginRight: 6 }} />
          Final saves
        </button>}
      </div>
    </div>
    {rows.length === 0 ? <p>No activity in this period.</p> : <>
      <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title}
        style={{ width: "100%", minWidth: 600, height: "auto", display: "block", marginTop: 14, overflow: "visible" }}>
        {[0,1,2,3,4].map(index => {
          const v = ceiling * index / 4;
          const yy = y(v);
          return <g key={index}>
            <line x1={left} x2={width-right} y1={yy} y2={yy} stroke="currentColor" opacity=".11" strokeDasharray={index === 0 ? undefined : "3 5"} />
            <text x={left-8} y={yy+4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".7">{Number.isInteger(v) ? integer(v) : v.toFixed(1)}</text>
          </g>;
        })}
        {rows.map((p, i) => (i % tickStep === 0 || i === rows.length - 1)
          ? <text key={i} x={x(i)} y={height-18} fontSize="11" textAnchor="middle" fill="currentColor" opacity=".75">{p.label}</text> : null)}
        {showStarted && <path d={line("started")} fill="none" stroke={colorStarted} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {twoSeries && showSaved && <path d={line("saved")} fill="none" stroke={colorSaved} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {focus !== null && <line x1={x(focus)} x2={x(focus)} y1={top} y2={height-bottom}
          stroke="currentColor" strokeDasharray="4 4" opacity=".4" />}
        {rows.map((point, i) => <g key={i}>
          {showStarted && <circle cx={x(i)} cy={y(point.started)} r={focus === i ? 5.5 : 3}
            fill={colorStarted} stroke="var(--surface, white)" strokeWidth="1.5" />}
          {twoSeries && showSaved && <circle cx={x(i)} cy={y(point.saved ?? 0)} r={focus === i ? 5.5 : 3}
            fill={colorSaved} stroke="var(--surface, white)" strokeWidth="1.5" />}
          <rect x={x(i) - (rows.length > 1 ? Math.min(16, plotWidth/(rows.length-1)/2) : 16)}
            y={top} width={rows.length > 1 ? Math.min(32, plotWidth/(rows.length-1)) : 32}
            height={plotHeight} fill="transparent" style={{ cursor: "pointer" }}
            tabIndex={0} role="button" aria-label={point.label + ": " + integer(point.started) + " starts" +
              (twoSeries ? ", " + integer(point.saved ?? 0) + " final saves" : "")}
            onFocus={() => setFocus(i)} onMouseEnter={() => setFocus(i)}
            onClick={() => setFocus(focus === i ? null : i)}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocus(i); } }} />
        </g>)}
      </svg>
      </div>
      <div aria-live="polite" style={{ minHeight: 32, borderRadius: 8, background: "var(--surface-muted, rgba(100,100,100,.07))",
        padding: "8px 12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        {selected ? <>
          <strong>{selected.label}</strong>
          <span>Started: <strong>{integer(selected.started)}</strong></span>
          {twoSeries && <span>Final saves: <strong>{integer(selected.saved ?? 0)}</strong></span>}
        </> : <small>Tap, hover or focus a point to see its exact counts.</small>}
      </div>
    </>}
  </article>;
}

function DurationBars({ rows }: { rows: readonly Bucket[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map(r => r.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <article className="workspace-queue-card" style={{ minWidth: 0, padding: "clamp(12px, 2vw, 24px)" }}>
    <h3 style={{ marginTop: 0 }}>Completion-time distribution</h3>
    <p><small>Start → last save for completed questionnaires. Includes breaks and return visits; not actual active screen time.</small></p>
    <div style={{ display: "grid", gap: 13 }}>
      {rows.map(row => <button key={row.key} type="button" aria-pressed={selected === row.key}
        onClick={() => setSelected(selected === row.key ? null : row.key)}
        style={{ display: "grid", gridTemplateColumns: "minmax(112px, 180px) minmax(30px, 1fr) 58px",
          alignItems: "center", gap: 9, cursor: "pointer", textAlign: "left", color: "inherit",
          background: selected === row.key ? "var(--surface-muted, rgba(100,100,100,.08))" : "transparent",
          border: 0, borderRadius: 9, padding: "6px 4px" }}>
        <span style={{ fontSize: 12 }}>{row.label}</span>
        <span style={{ height: 18, borderRadius: 6, overflow: "hidden", background: "var(--surface-muted, #e7e7e7)" }}>
          <span style={{ height: "100%", display: "block", borderRadius: 6,
            background: row.key === selected ? colorSaved : colorStarted,
            width: (row.count / max * 100) + "%", minWidth: row.count > 0 ? 2 : 0 }} />
        </span>
        <strong style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{integer(row.count)}</strong>
      </button>)}
    </div>
    <div aria-live="polite" style={{ marginTop: 12 }}><small>
      {selected ? (() => {
        const bucket = rows.find(row => row.key === selected);
        return bucket ? bucket.label + ": " + integer(bucket.count) + " questionnaires · " +
          (total ? (bucket.count / total * 100).toLocaleString("el-GR", { maximumFractionDigits: 1 }) : "0") + "%" : "";
      })() : "Select a duration band to see the share of completed questionnaires."}
    </small></div>
  </article>;
}

export function ResearchParticipantBehaviourCharts({ days, hours, duration }: {
  days: readonly { date: string; started: number; lastSavedCompleted: number }[];
  hours: readonly { hour: number; started: number }[];
  duration: readonly Bucket[];
}) {
  return <div style={{ display: "grid", gap: 20 }}>
    <TrendChart title="Daily questionnaire activity" twoSeries
      description="Daily starts versus final saves for questionnaires currently completed · Athens time."
      rows={days.map(d => ({
        label: new Date(d.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
        started: d.started, saved: d.lastSavedCompleted
      }))} />
    <TrendChart title="Questionnaire starts by hour" description="Hours of the day (Athens). Counts reflect the selected date window."
      rows={hours.map(h => ({ label: String(h.hour).padStart(2, "0") + ":00", started: h.started }))} />
    <DurationBars rows={duration} />
  </div>;
}
