"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GreeceResearchHeatmap } from "./GreeceResearchHeatmap";
import { GREECE_REGIONS, type GreekRegionKey } from "../lib/research-geographic-core";
import type { SingleQuestionDistribution, SingleQuestionFilters } from "../lib/research-geographic-distribution-runtime";
import type { SafeDistributionRegion } from "../lib/research-geographic-distribution-core";
import type { ResearchMapFilters } from "../lib/research-geographic-runtime";

export type DistributionMetric = "prevalence" | "footprint" | "count";
const metricOptions: readonly { id: DistributionMetric; title: string; detail: string }[] = [
  { id: "prevalence", title: "% ανά Περιφέρεια",
    detail: "Από όσους απάντησαν σε αυτή την ερώτηση μέσα στην Περιφέρεια, τι ποσοστό διάλεξε αυτή την απάντηση;" },
  { id: "footprint", title: "Γεωγραφική κατανομή",
    detail: "Από όλους τους συμμετέχοντες με την επιλεγμένη απάντηση και γνωστή Περιφέρεια, τι μερίδιο βρίσκεται σε κάθε Περιφέρεια;" },
  { id: "count", title: "Πλήθος απαντήσεων",
    detail: "Πόσοι συμμετέχοντες στην Περιφέρεια επέλεξαν την απάντηση, με χρωματική ένταση βάσει πλήθους;" }
];
const number = (v: number | null) => v === null ? "—" : v.toLocaleString("el-GR");
const ratio = (v: number | null) => v === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: 1 }) + "%";

function hrefFor(root: string, filters: SingleQuestionFilters,
  changes: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries({ ...filters, ...changes })) if (val) p.set(key, val);
  return root + "?" + p.toString();
}
function metricValue(r: SafeDistributionRegion, metric: DistributionMetric): number | null {
  return metric === "count" ? r.matched : metric === "footprint" ? r.distribution : r.prevalence;
}
function metricLabel(v: number | null, metric: DistributionMetric) {
  return metric === "count" ? (v === null ? "—" : "n=" + number(v)) : ratio(v);
}

export function GreeceSingleQuestionDistributionExplorer({
  root, data, initialMetric = "prevalence", initialRegion = ""
}: {
  root: string; data: SingleQuestionDistribution;
  initialMetric?: DistributionMetric; initialRegion?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<DistributionMetric>(initialMetric);
  const [region, setRegion] = useState<GreekRegionKey | "">(
    GREECE_REGIONS.some(r => r.key === initialRegion) ? initialRegion as GreekRegionKey : "");
  const [sort, setSort] = useState<"high" | "low" | "alphabetical">("high");
  const [heatStyle,setHeatStyle]=useState<"fluid"|"regions">(
    data.postcodeDensity?.hasDetail ? "fluid" : "regions");
  const [search, setSearch] = useState("");
  const selected = data.regions.find(r => r.key === region);

  function changeFilters(changes: Record<string, string>) {
    const url = hrefFor(root, data.filters, { metric, region, ...changes });
    startTransition(() => router.push(url));
  }
  const cells = useMemo(() => data.regions.map(r => ({
    key: r.key, label: r.label,
    respondents: metric === "count" ? r.matched : r.answered,
    answered: r.answered,
    selected: r.matched,
    ratioPercent: metric === "footprint" ? r.distribution : r.prevalence
  })), [data.regions, metric]);
  const mapFilters: ResearchMapFilters = {
    mode: data.filters.mode, phase: data.filters.phase,
    metric: metric === "count" ? "density" : "share",
    question: data.question.code, answer: data.answer.key,
    sector: data.filters.sector, kad: data.filters.kad, prefecture: "", municipality: "", region
  };
  const sorted = useMemo(() => [...data.regions]
    .filter(r => r.label.toLocaleLowerCase("el-GR").includes(search.toLocaleLowerCase("el-GR").trim()))
    .sort((a,b) => {
      if (sort === "alphabetical") return a.label.localeCompare(b.label, "el");
      const av = metricValue(a, metric), bv = metricValue(b, metric);
      if (av === null) return bv === null ? a.label.localeCompare(b.label, "el") : 1;
      if (bv === null) return -1;
      return (sort === "high" ? bv-av : av-bv) || a.label.localeCompare(b.label, "el");
    }), [data.regions, metric, sort, search]);

  const shareLink = hrefFor(root, data.filters, { region, metric });

  return <div className="relation-explorer-workbench">
    <section className="research-relation-controls" aria-label="Επιλογή μίας ερώτησης και απάντησης">
      <div className="research-relation-control-header">
        <div>
          <strong>1. Επιλέξτε μία ερώτηση και μία απάντηση</strong>
          <p>Χωρίς δεύτερη ερώτηση, ομάδες Α/Β ή προϋπόθεση σύγκρισης.</p>
        </div>
        {pending && <small role="status">Ανανέωση πραγματικών απαντήσεων…</small>}
      </div>
      <div className="research-relation-filter-grid">
        <label className="research-distribution-wide">Ερώτηση
          <select value={data.question.code} onChange={e => {
            const q = data.questions.find(x => x.code === e.target.value);
            changeFilters({ question: e.target.value, answer: q?.options[0]?.key ?? "", region: "" });
          }}>
            {data.questions.map(q => <option key={q.code} value={q.code}>{q.code} · {q.label}</option>)}
          </select>
        </label>
        <label>Απάντηση
          <select value={data.answer.key} onChange={e => changeFilters({ answer: e.target.value, region: "" })}>
            {data.question.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label>Κατάσταση
          <select value={data.filters.mode} onChange={e => changeFilters({ mode: e.target.value, region: "" })}>
            <option value="all">Όλες οι καταγεγραμμένες</option>
            <option value="completed">Οριστικές</option>
            <option value="draft">Σε εξέλιξη</option>
          </select>
        </label>
        <label>Κλάδος
          <select value={data.filters.sector} onChange={e => changeFilters({ sector: e.target.value, kad: "", region: "" })}>
            <option value="">Όλοι οι κλάδοι</option>
            {data.sectors.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label>ΚΑΔ
          <select value={data.filters.kad} onChange={e => changeFilters({ kad: e.target.value, region: "" })}>
            <option value="">Όλοι οι ΚΑΔ</option>
            {data.kads.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label>Φάση
          <select value={data.filters.phase} onChange={e => changeFilters({ phase: e.target.value, region: "" })}>
            <option value="main">Κύρια έρευνα</option>
            <option value="pilot">Πιλοτική</option>
          </select>
        </label>
      </div>
      <div className="research-distribution-answer-pills" aria-label="Απαντήσεις της επιλεγμένης ερώτησης">
        {data.question.options.map(choice => <button key={choice.key} type="button"
          aria-pressed={choice.key === data.answer.key}
          className={choice.key === data.answer.key ? "is-active" : ""}
          onClick={() => changeFilters({ answer: choice.key })}>{choice.label}</button>)}
      </div>
      <p className="research-relation-disclaimer">Τα στοιχεία αφορούν μόνο την ερώτηση {data.question.code}.
        Οι μη οριστικές αποθηκευμένες απαντήσεις δεν θεωρούνται τυπικά υποβληθείσες.
        Οι αποσυρμένες συμμετοχές αποκλείονται.</p>
    </section>

    <section className="research-distribution-summary">
      <div className="research-relation-control-header">
        <div><strong>{data.question.label}</strong>
          <p>Επιλεγμένη απάντηση: <strong>{data.answer.label}</strong></p></div>
      </div>
      <div className="research-distribution-statgrid">
        <article className="research-relation-stat">
          <small>Απάντησαν σε αυτή την ερώτηση · πραγματικό n</small>
          <strong>{number(data.national.answered)}</strong>
        </article>
        <article className="research-relation-stat">
          <small>Έδωσαν την επιλεγμένη απάντηση</small>
          <strong>{number(data.national.matched)}</strong>
        </article>
        <article className="research-relation-stat">
          <small>Ποσοστό επί όσων απάντησαν</small>
          <strong>{ratio(data.national.prevalence)}</strong>
          {data.national.answered !== null && data.national.answered > 0 && data.national.answered < 15 &&
            <small>Προσοχή: πολύ μικρή βάση, μη αντιπροσωπευτική.</small>}
        </article>
      </div>
    </section>

    <section>
      <div className="relation-explorer-toolbar">
        <div><strong>2. Πώς θέλετε να δείτε την κατανομή;</strong>
          <p>Αλλάξτε τη μέτρηση αμέσως, χωρίς νέα ανάγνωση της βάσης.</p></div>
        <div className="relation-explorer-toolbar-actions">
          <button type="button" className="button button-secondary" onClick={() => {
            setMetric("prevalence");setRegion("");setSort("high");setSearch("");
            setHeatStyle(data.postcodeDensity?.hasDetail?"fluid":"regions");
          }}>Επαναφορά προβολής</button>
          <a className="button button-secondary" href={shareLink}>Σύνδεσμος προβολής</a>
        </div>
      </div>
      <div className="relation-explorer-segments" role="group" aria-label="Τύπος γεωγραφικής απεικόνισης">
        {metricOptions.map(option => <button key={option.id} type="button"
          aria-pressed={metric === option.id} className={metric === option.id ? "is-active" : ""}
          onClick={() => setMetric(option.id)}>{option.title}</button>)}
      </div>
      <p className="research-relation-small-note">
        {metricOptions.find(option => option.id === metric)?.detail}
      </p>
      <div className="research-distribution-map-style" role="group" aria-label="Είδος θερμικού χάρτη">
        <button type="button" aria-pressed={heatStyle==="fluid"}
          disabled={!data.postcodeDensity?.hasDetail} className={heatStyle==="fluid"?"is-active":""}
          onClick={()=>setHeatStyle("fluid")}>Ομαλός χάρτης Τ.Κ.</button>
        <button type="button" aria-pressed={heatStyle==="regions"}
          className={heatStyle==="regions"?"is-active":""} onClick={()=>setHeatStyle("regions")}>
          Συγκεντρωτικός ανά Περιφέρεια</button>
      </div>
      {!data.postcodeDensity?.hasDetail && <p className="research-relation-small-note" role="status">
        Για τη συγκεκριμένη επιλογή δεν υπάρχουν ακόμη αρκετές προστατευμένες
        ταχυδρομικές ομάδες για ασφαλή τοπική απεικόνιση.
        Τα πλήρη n και οι συγκεντρωτικές Περιφέρειες παραμένουν διαθέσιμα.
      </p>}
    </section>

    <div className="research-relation-layout relation-explorer-layout">
      <div>
        <GreeceResearchHeatmap cells={cells} filters={mapFilters} root={root}
          densityImage={heatStyle==="fluid"
            ? (metric==="prevalence"
              ? data.postcodeDensity?.prevalenceImage
              : data.postcodeDensity?.countImage)
            : undefined}
          densityKind={metric==="prevalence"?"prevalence":"count"}
          onRegionSelect={key => setRegion(prev => prev === key ? "" : key)} />
        <p className="relation-explorer-map-instruction">
          Πατήστε Περιφέρεια για πραγματικό πλήθος, συνολικές απαντήσεις και το ποσοστό.
          Ο ομαλός χάρτης χρησιμοποιεί ταχυδρομικές περιοχές συγχωνευμένες σε
          ευρύτερες γεωγραφικές ομάδες και Gaussian εξομάλυνση, όπως στη δημόσια μελέτη.
          Δεν υπάρχουν κουκκίδες, ονόματα πόλεων, μεμονωμένα Τ.Κ., επιχειρήσεις
          ή συντεταγμένες στο πρόγραμμα περιήγησης.
          Ορισμένες αραιές ομάδες αποκρύπτονται από τη λεπτομερή εικόνα για προστασία,
          αλλά <strong>όλες οι πραγματικές απαντήσεις</strong> παραμένουν στο εθνικό
          και περιφερειακό n. Το γκρι δεν σημαίνει αναγκαστικά μηδενική συμμετοχή.
        </p>
      </div>
      <div className="relation-explorer-sidebar">
        <div className="relation-explorer-sidebar-head">
          <h3>{selected?.label ?? "Ανάλυση Περιφέρειας"}</h3>
          {selected && <button type="button" className="button button-secondary"
            onClick={() => setRegion("")}>Όλη η Ελλάδα</button>}
        </div>
        <label className="relation-explorer-select">Επιλογή Περιφέρειας
          <select value={region} onChange={e=>setRegion(e.target.value as GreekRegionKey|"")}>
            <option value="">Επιλέξτε Περιφέρεια</option>
            {GREECE_REGIONS.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {selected ? <div className="research-distribution-regional-cards">
          <div><span>Απάντησαν στην ερώτηση</span><strong>{number(selected.answered)}</strong></div>
          <div><span>Επέλεξαν «{data.answer.label}»</span><strong>{number(selected.matched)}</strong></div>
          <div><span>Ποσοστό στην Περιφέρεια</span><strong>{ratio(selected.prevalence)}</strong></div>
          <div><span>Μερίδιο από όλες τις γεωγραφικά εντοπισμένες απαντήσεις αυτής της επιλογής</span>
            <strong>{ratio(selected.distribution)}</strong></div>
          {selected.answered !== null && selected.answered > 0 && selected.answered < 15 &&
            <p className="research-relation-small-note" role="note">Μικρή βάση n={number(selected.answered)}. Περιγραφικό εύρημα, όχι ασφαλές γενικό συμπέρασμα.</p>}
        </div> : <div className="workspace-inline-note">
          Επιλέξτε μια Περιφέρεια πάνω στον χάρτη ή από το αναπτυσσόμενο μενού
          για να δείτε αποκλειστικά αυτή την ερώτηση, χωρίς καμία σύγκριση.
        </div>}
      </div>
    </div>

    <section className="relation-explorer-ranking">
      <div className="relation-explorer-toolbar">
        <div><strong>3. Περιφέρειες ανά {metric === "count" ? "πλήθος" : "ποσοστό"}</strong>
          <p>Οι γραμμές επιλέγουν αντίστοιχα την Περιφέρεια του χάρτη.</p></div>
        <small>{sorted.length} από 13 Περιφέρειες</small>
      </div>
      <div className="relation-explorer-ranking-filters">
        <label>Αναζήτηση
          <input type="search" placeholder="π.χ. Θεσσαλία" value={search}
            onChange={e => setSearch(e.target.value)} />
        </label>
        <label>Ταξινόμηση
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
            <option value="high">Υψηλότερα πρώτα</option>
            <option value="low">Χαμηλότερα πρώτα</option>
            <option value="alphabetical">Αλφαβητικά</option>
          </select>
        </label>
      </div>
      <div className="relation-explorer-rank-list">
        {sorted.map(r => <button key={r.key} type="button"
          className={region === r.key ? "is-active" : ""} aria-pressed={region === r.key}
          onClick={() => setRegion(region === r.key ? "" : r.key)}>
          <span className="relation-explorer-rank-label">{r.label}</span>
          <span className="relation-explorer-rank-meter" aria-hidden="true"><span
            style={{ width: (metric === "count"
              ? (r.matched === null ? 0 : Math.max(0, Math.min(100,
                r.matched * 100 / Math.max(1,...data.regions.map(c => c.matched ?? 0)))))
              : Math.max(0,Math.min(100,metricValue(r, metric) ?? 0))) + "%" }} /></span>
          <strong>{metricLabel(metricValue(r, metric), metric)}</strong>
        </button>)}
      </div>
    </section>
  </div>;
}
