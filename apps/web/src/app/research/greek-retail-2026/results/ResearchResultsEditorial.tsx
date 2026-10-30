"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

const HEADLINES: readonly { key: string; statement: string }[] = [
  { key: "business_financial_trends_12m.operating_costs.share.increased", statement: "των επιχειρήσεων δηλώνει αύξηση του λειτουργικού κόστους." },
  { key: "business_financial_trends_12m.profitability.share.decreased", statement: "των επιχειρήσεων δηλώνει μείωση κερδοφορίας." },
  { key: "business_optimism_12m.share.pessimistic", statement: "των επιχειρήσεων δηλώνει απαισιοδοξία για το επόμενο 12μηνο." },
  { key: "digital_capabilities.stock_sync.share.yes", statement: "των επιχειρήσεων δηλώνει ψηφιακό συγχρονισμό αποθεμάτων." }
];
const HIGHLIGHT_GROUPS = [
  { id: "economy", label: "Οικονομική πίεση", keys: ["business_financial_trends_12m.operating_costs.share.increased", "business_financial_trends_12m.profitability.share.decreased", "economic_viability_pressures.share.purchasing_power"] },
  { id: "digital", label: "Ψηφιακή μετάβαση", keys: ["digital_capabilities.stock_sync.share.yes", "sales_channels.share.own_eshop", "digital_readiness.mean"] },
  { id: "customers", label: "Τοπική αγορά", keys: ["local_customer_share.share.76_100", "customer_acquisition_sources.share.word_of_mouth"] },
  { id: "confidence", label: "Προοπτικές", keys: ["business_optimism_12m.share.pessimistic", "retail_confidence.mean"] }
] as const;

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

function EditorialMap({ points, geography, countyAvailability=[] }: { points: readonly SafePublicResultPoint[]; geography?: SafeParticipationGeography; countyAvailability?: readonly SafeCountyAvailability[] }) {
  const [geo, setGeo] = useState<Geography | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [chosen, setChosen] = useState("");

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

  return <section id="results-map" className={styles.mapSection} aria-labelledby="results-map-title">
    <div className={styles.sectionHeading}>
      <div><span className={styles.eyebrow}>02 / Η ΓΕΩΓΡΑΦΙΚΗ ΕΙΚΟΝΑ</span>
        <h2 id="results-map-title">Η Ελλάδα, μέσα από τις απαντήσεις της.</h2>
        <p>Δείτε πώς διαμορφώνεται κάθε διαθέσιμος δείκτης ανά νομό. Η απουσία στοιχείων δεν σημαίνει μηδενικό αποτέλεσμα.</p></div>
      <Link href="#research-workbench" className={styles.textLink}>Αναλυτικά γραφήματα <span aria-hidden="true">↗</span></Link>
    </div>
    <div className={styles.mapLayout}>
      <div className={styles.mapNarrative}>
        <span className={styles.eyebrow}>ΔΙΑΔΡΑΣΤΙΚΟΣ ΧΑΡΤΗΣ · 55 ΝΟΜΟΙ</span>
        <h3>{layer?.title ?? "Η γεωγραφία της έρευνας"}</h3>
        <p>{layer?.kind === "survey" ? publicMetricLabel(layer.key) : layer?.kind === "participation"
          ? "Ενάρξεις ερωτηματολογίου ανά νομό — ξεχωριστή μέτρηση από τις ολοκληρωμένες απαντήσεις."
          : "Τα εγκεκριμένα στοιχεία ανά νομό θα εμφανιστούν όταν είναι διαθέσιμα."}</p>
        <div className={styles.layerControls} aria-label="Θεματικά επίπεδα χάρτη">
          {layers.map((item, i) => <button key={item.key} type="button" aria-pressed={i === index}
            className={i === index ? styles.layerActive : styles.layerButton}
            onClick={() => { setActive(i); setChosen(""); setPlaying(false); }}>
            <span className={styles.layerNumber}>0{i + 1}</span>{item.title}
          </button>)}
        </div>
        {layers.length > 1 && <button type="button" className={styles.playButton}
          onClick={() => setPlaying(value => !value)} aria-label={playing ? "Παύση αυτόματης εναλλαγής" : "Αυτόματη εναλλαγή επιπέδων"}>
          {playing ? "Ⅱ  Παύση εναλλαγής" : "▷  Αυτόματη εναλλαγή"}
        </button>}
        <div className={styles.legend} aria-label="Κλίμακα χρωμάτων">
          <span>Χαμηλότερη τιμή</span><i aria-hidden="true" /><span>Υψηλότερη τιμή</span>
        </div>
        <p className={styles.mapCaveat}>Οι χρωματικές κλίμακες προσαρμόζονται ξεχωριστά σε κάθε δείκτη. Νομοί με μικρό δείγμα αλλά χωρίς δημοσιεύσιμη εκτίμηση σημειώνονται με ανοιχτές αποχρώσεις και διακεκομμένο περίγραμμα, όχι ως τιμές του δείκτη. Περιοχές χωρίς καταγραφή παραμένουν γκρίζες. {underFive > 0 ? `${underFive} νομοί έχουν βάση 1–4· οι ατομικές απαντήσεις τους δεν δημοσιοποιούνται. ` : ""}{layer?.kind === "survey" && smallBaseCount > 0 ? `${smallBaseCount} από τους ${layer.entries.size} νομούς με τιμή βασίζονται σε μόλις 5–29 απαντήσεις· δεν αποτελούν αξιόπιστη κατάταξη των νομών.` : ""}</p>
      </div>
      <div className={styles.mapVisual}>
        {failed ? <p role="alert">Ο χάρτης δεν φορτώθηκε. Χρησιμοποιήστε τα αναλυτικά γραφήματα παρακάτω.</p>
          : !geo ? <p role="status" className={styles.mapLoading}>Φόρτωση χάρτη Ελλάδας…</p>
          : <svg viewBox="0 0 810 650" role="img" aria-label={`Χάρτης Ελλάδας ανά νομό. ${layer?.title ?? "Χωρίς γεωγραφικά στοιχεία"}.`} className={styles.greeceSvg}>
            {geo.features.map(feature => {
              const value = layer?.entries.get(feature.properties.name);
              const number = typeof value === "number" ? value : value?.value;
              return <path key={feature.properties.name} d={polygonPath(feature.geometry)} fillRule="evenodd"
                fill={number === undefined ? countyBandColor(feature.properties.name) : heat(number, min, max)} stroke="#fffdf7" strokeWidth="1.35" strokeDasharray={number === undefined && countyBands.has(feature.properties.name) ? "4 2" : undefined}
                className={chosen === feature.properties.name ? styles.countySelected : styles.county}
                role="button" tabIndex={0} aria-label={`${keyNames.get(feature.properties.name) ?? feature.properties.name}: ${value === undefined ? countyBandText(feature.properties.name) : displayValue(value)}`}
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
    </div>
  </section>;
}

export function ResearchResultsEditorial({ points, geography, countyAvailability, children }: { points: readonly SafePublicResultPoint[]; geography?: SafeParticipationGeography; countyAvailability?: readonly SafeCountyAvailability[]; children?: ReactNode }) {
  const overall = points.filter(point => Object.keys(point.segment).length === 0);
  const find = (key: string) => overall.find(p => p.metricKey === key);
  const selected = HIGHLIGHT_GROUPS.map(group => ({
    ...group, point: group.keys.map(find).find((p): p is SafePublicResultPoint => Boolean(p))
  })).filter(item => item.point);
  const extras = overall.filter(point => !selected.some(item => item.point?.metricKey === point.metricKey));
  const featured = selected.length ? selected.slice(0, 4) : extras.slice(0, 4).map(point => ({
    id: point.metricKey, label: "Κύριο εύρημα", point
  }));
  const lead = HEADLINES.map(item => ({ ...item, point: find(item.key) }))
    .find((item): item is typeof item & { point: SafePublicResultPoint } => Boolean(item.point && item.point.format === "proportion"));
  return <>
    <header id="results-top" className={styles.hero}>
      <div className={styles.heroTop}><span className={styles.eyebrow}>KONTA MOY / ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</span>
        <span className={styles.releaseLabel}>ΔΗΜΟΣΙΕΥΜΕΝΗ ΕΡΕΥΝΑ</span></div>
      <span className={styles.heroKicker}>ΤΑ ΚΥΡΙΑ ΕΥΡΗΜΑΤΑ</span>
      <h1>{lead ? <><span>{formatPoint(lead.point)}</span> {lead.statement}</> : "Η πραγματικότητα του ελληνικού λιανεμπορίου, μέσα από τα δεδομένα."}</h1>
      <p className={styles.heroIntro}>Μια καθαρή εικόνα για τις οικονομικές πιέσεις, την ψηφιακή μετάβαση, την τοπική αγορά και τις προοπτικές των επιχειρήσεων — με βάση τις δημοσιευμένες απαντήσεις.</p>
      {lead && <p className={styles.heroBasis}>Για το παραπάνω εύρημα: n={whole.format(lead.point.n)}{lead.point.ciLower != null && lead.point.ciUpper != null ? ` · 95% ΔΕ ${fmt.format(lead.point.ciLower * 100)}–${fmt.format(lead.point.ciUpper * 100)}%` : ""}. Οι απαντήσεις αποτυπώνουν το δείγμα της μελέτης.</p>}
      <nav className={styles.quickNav} aria-label="Περιεχόμενα αποτελεσμάτων">
        <a href="#results-highlights">Κύρια ευρήματα</a>
        <a href="#results-map">Χάρτης Ελλάδας</a>
        <a href="#results-science">Ερμηνεία &amp; μεθοδολογία</a>
        <a href="#results-areas">Θεματικές ενότητες</a>
        <a href="#research-workbench">Αναλυτική εξερεύνηση</a>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία ↗</Link>
      </nav>
    </header>
    <section id="results-highlights" className={styles.highlights} aria-labelledby="results-highlights-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>01 / ΜΕ ΜΙΑ ΜΑΤΙΑ</span>
        <h2 id="results-highlights-title">Οι αριθμοί που αξίζει να προσέξουμε.</h2></div></div>
      {featured.length ? <div className={styles.highlightGrid}>
        {featured.map(item => <article key={item.id} className={styles.highlightCard}>
          <span>{item.label}</span>
          <strong>{formatPoint(item.point!)}</strong>
          <h3>{item.point!.label || publicMetricLabel(item.point!.metricKey)}</h3>
          <small>Βάση n={whole.format(item.point!.n)}{item.point!.ciLower != null && item.point!.ciUpper != null
            ? ` · 95% ΔΕ ${formatPoint({ ...item.point!, value: item.point!.ciLower })}–${formatPoint({ ...item.point!, value: item.point!.ciUpper })}` : ""}</small>
        </article>)}
      </div> : <p>Δεν υπάρχουν διαθέσιμες εγκεκριμένες συνολικές εκτιμήσεις.</p>}
    </section>
    <EditorialMap points={points} geography={geography} countyAvailability={countyAvailability} />
    {children}
    <section id="results-areas" className={styles.areas} aria-labelledby="results-areas-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>04 / Η ΠΛΗΡΗΣ ΕΙΚΟΝΑ</span>
        <h2 id="results-areas-title">Έξι περιοχές. Μία ενιαία ιστορία.</h2>
        <p>Διαβάστε τις βασικές θεματικές και συνεχίστε στα διαγράμματα για αναλυτικές συγκρίσεις.</p></div></div>
      <nav className={styles.chapterNav} aria-label="Μετάβαση σε θεματική ενότητα">
        {PUBLIC_RESULTS_CHAPTERS.map(chapter => <a key={chapter.id} href={`#result-area-${chapter.id}`}>{chapter.number} · {chapter.name}</a>)}
      </nav>
      <div className={styles.areaGrid}>
        {PUBLIC_RESULTS_CHAPTERS.map(chapter => {
          const chapterPoints = chapter.subchapters.flatMap(sub => sub.metrics)
            .map(find).filter((p): p is SafePublicResultPoint => Boolean(p));
          const unique = [...new Map(chapterPoints.map(p => [p.metricKey, p] as const)).values()].slice(0, 3);
          return <article id={`result-area-${chapter.id}`} key={chapter.id} className={styles.areaCard}>
            <div className={styles.areaTop}><span>{chapter.number} / 06</span><span>{chapter.subchapters.length} υποενότητες</span></div>
            <h3>{chapter.name}</h3><p>{chapter.subtitle}</p>
            {unique.length ? <dl className={styles.areaMetrics}>{unique.map(point => <div key={point.metricKey}>
              <dt>{point.label || publicMetricLabel(point.metricKey)} <small>n={whole.format(point.n)}</small></dt>
              <dd>{formatPoint(point)}</dd>
            </div>)}</dl> : <p className={styles.areaEmpty}>Δεν υπάρχουν δημοσιεύσιμες τιμές για αυτή την ενότητα.</p>}
            <a href="#research-workbench" className={styles.areaLink} onClick={() => window.dispatchEvent(new CustomEvent("research:select-chapter", { detail: chapter.id }))}>Αναλυτική εξερεύνηση <span aria-hidden="true">↗</span></a>
          </article>;
        })}
      </div>
    </section>
    <section className={styles.readingNote} aria-labelledby="results-reading-note">
      <span className={styles.eyebrow}>ΠΩΣ ΝΑ ΔΙΑΒΑΣΕΤΕ ΤΑ ΕΥΡΗΜΑΤΑ</span>
      <h2 id="results-reading-note">Κάθε αριθμός έχει τη δική του βάση.</h2>
      <p>Το n είναι οι απαντήσεις που χρησιμοποιήθηκαν για κάθε εκτίμηση. Όπου υπάρχει, το διάστημα εμπιστοσύνης εκφράζει την αβεβαιότητα της εκτίμησης. Οι περιγραφικές διαφορές δεν αποδεικνύουν αιτιότητα ή στατιστική σημαντικότητα, και μικρές γεωγραφικές βάσεις απαιτούν προσοχή.</p>
      <Link href="/research/greek-retail-2026/methodology">Πλήρης μεθοδολογία και περιορισμοί ↗</Link>
    </section>
  </>;
}
