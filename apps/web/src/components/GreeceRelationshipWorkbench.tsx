"use client";

import { useMemo, useState } from "react";
import { GreeceResearchHeatmap } from "./GreeceResearchHeatmap";
import { GREECE_REGIONS, type GreekRegionKey } from "../lib/research-geographic-core";
import type { SafeRelationshipRegion } from "../lib/research-geographic-relations-core";
import type { RelationshipFilters } from "../lib/research-geographic-relations-runtime";
import {
  relationshipRegionValue, relationshipMapCellValue, sortedRelationshipRegions,
  type RelationshipMapView
} from "../lib/research-geographic-relations-view";

type Order = "highest" | "lowest" | "alphabetical";

const VIEWS: readonly { key: RelationshipMapView; label: string; detail: string }[] = [
  { key: "segment", label: "Ομάδα Α", detail: "Ποσοστό απάντησης Β στην ομάδα Α" },
  { key: "other", label: "Λοιπές", detail: "Ποσοστό απάντησης Β στις υπόλοιπες επιχειρήσεις" },
  { key: "gap", label: "Διαφορά Α − λοιπών", detail: "Διαφορά ποσοστών σε ποσοστιαίες μονάδες (π.μ.)" }
];

function safePercent(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("el-GR") + "%";
}

function GroupCard({ title, detail, base, percent }: {
  title: string; detail: string; base: number | null; percent: number | null;
}) {
  return <div className="relation-explorer-group">
    <div><strong>{title}</strong><small>{detail}</small></div>
    <strong className="relation-explorer-group-value">{safePercent(percent)}</strong>
    <div className="research-relation-bar" aria-hidden="true">
      <span style={{ width: (percent ?? 0) + "%" }} />
    </div>
    <small>{base === null ? "Ανεπαρκές δείγμα (n<15)" : "Απαντήσεις και στα δύο: n=" + base.toLocaleString("el-GR")}</small>
  </div>;
}

function RegionCard({ region, aLabel, bLabel, compact = false }: {
  region: SafeRelationshipRegion; aLabel: string; bLabel: string; compact?: boolean;
}) {
  const a = region.segment;
  const b = region.other;
  const delta = a.percent === null || b.percent === null ? null : a.percent - b.percent;
  return <div className="relation-explorer-region-card" aria-label={region.label}>
    <h3>{region.label}</h3>
    <p>{bLabel}</p>
    <div className={"relation-explorer-pair" + (compact ? " is-compact" : "")}>
      <GroupCard title="Ομάδα Α" detail={aLabel} base={a.base} percent={a.percent} />
      <GroupCard title="Λοιπές επιχειρήσεις" detail="Εκτός ομάδας Α" base={b.base} percent={b.percent} />
    </div>
    <div className="relation-explorer-difference">
      <span>Διαφορά ομάδων</span>
      <strong>{relationshipMapCellValue(delta, "gap")}</strong>
    </div>
  </div>;
}

function selectRegion(value: string, regions: readonly SafeRelationshipRegion[]): GreekRegionKey | "" {
  return regions.some(r => r.key === value) ? value as GreekRegionKey : "";
}

export function GreeceRelationshipWorkbench({ root, filters, regions, aLabel, bLabel,
  initialView = "segment", initialCompare = "" }: {
  root: string;
  filters: RelationshipFilters;
  regions: readonly SafeRelationshipRegion[];
  aLabel: string;
  bLabel: string;
  initialView?: RelationshipMapView;
  initialCompare?: string;
}) {
  const [view, setView] = useState<RelationshipMapView>(initialView);
  const [region, setRegion] = useState<GreekRegionKey | "">(selectRegion(filters.region, regions));
  const [compare, setCompare] = useState<GreekRegionKey | "">(selectRegion(initialCompare, regions));
  const [order, setOrder] = useState<Order>("highest");
  const [search, setSearch] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const normalizedCompare = compare !== region ? compare : "";
  const selected = regions.find(r => r.key === region);
  const compared = regions.find(r => r.key === normalizedCompare);

  const mapCells = useMemo(() => regions.map(r => ({
    key: r.key, label: r.label,
    respondents: view === "gap" ? null : (view === "segment" ? r.segment.base : r.other.base),
    answered: view === "gap" ? null : (view === "segment" ? r.segment.base : r.other.base),
    selected: null,
    ratioPercent: view === "gap" ? null : (view === "segment" ? r.segment.percent : r.other.percent),
    differencePoints: relationshipRegionValue(r, "gap").value
  })), [regions, view]);

  const ranked = useMemo(() => sortedRelationshipRegions(regions, view, order)
    .filter(r => (!onlyAvailable || relationshipRegionValue(r, view).available)
      && (!search.trim() || r.label.toLocaleLowerCase("el-GR").includes(search.trim().toLocaleLowerCase("el-GR")))),
    [regions, view, order, search, onlyAvailable]);

  const mapFilters = {
    ...filters, metric: "share" as const, question: filters.b, answer: filters.bv,
    kad: filters.kad, prefecture: "", municipality: "", region
  };
  const shareHref = useMemo(() => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, region, compare: normalizedCompare, view })) {
      if (value) query.set(key, value);
    }
    return root + "?" + query.toString();
  }, [root, filters, region, normalizedCompare, view]);

  async function copyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(new URL(shareHref, window.location.href).href);
        setShareMessage("Ο σύνδεσμος αντιγράφηκε.");
        return;
      } catch { /* Provide the manual link below. */ }
    }
    setShareMessage("Ανοίξτε τον σύνδεσμο παρακάτω για να τον μοιραστείτε.");
  }

  return <div className="relation-explorer-workbench">
    <div className="relation-explorer-toolbar">
      <div>
        <strong>3. Αλλάξτε τι δείχνει ο χάρτης</strong>
        <p>Οι αλλαγές χρώματος και Περιφέρειας γίνονται αμέσως, χωρίς φόρτωση νέας σελίδας.</p>
      </div>
      <div className="relation-explorer-toolbar-actions">
        <button type="button" className="button button-secondary" onClick={() => {
          setView("segment"); setRegion(""); setCompare(""); setOrder("highest"); setSearch("");
          setOnlyAvailable(false);
        }}>Επαναφορά χάρτη</button>
        <button type="button" className="button button-secondary" onClick={copyLink}>Αντιγραφή προβολής</button>
      </div>
    </div>
    <div className="relation-explorer-segments" role="group" aria-label="Τι εμφανίζει ο θερμικός χάρτης">
      {VIEWS.map(item => <button key={item.key} type="button"
        className={view === item.key ? "is-active" : ""}
        aria-pressed={view === item.key}
        title={item.detail} onClick={() => setView(item.key)}>
        {item.label}
      </button>)}
    </div>
    <p className="research-relation-small-note">{VIEWS.find(item => item.key === view)?.detail}.
      Οι μη διαθέσιμες τιμές παραμένουν κρυφές, όχι μηδενικές.</p>
    {shareMessage && <div role="status" className="relation-explorer-share">
      {shareMessage} <a href={shareHref}>Άνοιγμα συνδέσμου με τις επιλογές σας</a>
    </div>}
    <div className="research-relation-layout relation-explorer-layout">
      <div className="relation-explorer-map">
        <GreeceResearchHeatmap
          cells={mapCells}
          filters={mapFilters}
          root={root}
          visualization={view === "gap" ? "difference" : "standard"}
          onRegionSelect={key => {
            setRegion(prev => prev === key ? "" : key);
            if (key === compare) setCompare("");
          }}
        />
        <p className="relation-explorer-map-instruction">
          <strong>Δοκιμάστε:</strong> Πατήστε πάνω σε μία Περιφέρεια για να δείτε τις δύο ομάδες της.
          Πατήστε ξανά για να επιστρέψετε στην Ελλάδα.
        </p>
      </div>
      <section className="relation-explorer-sidebar" aria-label="Περιφερειακή ανάλυση">
        <div className="relation-explorer-sidebar-head">
          <h3>{selected ? "Η Περιφέρεια που επιλέξατε" : "Επιλογή Περιφέρειας"}</h3>
          {selected && <button className="button button-secondary" type="button" onClick={() => setRegion("")}>
            Όλη η Ελλάδα
          </button>}
        </div>
        <label className="relation-explorer-select">Επιλεγμένη Περιφέρεια
          <select value={region} onChange={event => {
            const next = selectRegion(event.target.value, regions);
            setRegion(next);
            if (compare === next) setCompare("");
          }}>
            <option value="">Επιλέξτε από τον χάρτη ή εδώ</option>
            {GREECE_REGIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {selected ? <RegionCard region={selected} aLabel={aLabel} bLabel={bLabel} />
          : <p className="research-relation-small-note">Η σύγκριση εμφανίζεται εδώ αμέσως μόλις επιλέξετε Περιφέρεια.</p>}
        <div className="relation-explorer-divider" />
        <label className="relation-explorer-select">Συγκρίνετε με Περιφέρεια Β
          <select value={normalizedCompare} onChange={event => setCompare(selectRegion(event.target.value, regions))}>
            <option value="">Χωρίς δεύτερη Περιφέρεια</option>
            {GREECE_REGIONS.filter(r => r.key !== region).map(r =>
              <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        {compared && <RegionCard region={compared} aLabel={aLabel} bLabel={bLabel} compact />}
        {selected && compared && <div className="relation-explorer-cross-compare" role="status">
          <strong>Διαφορά Περιφερειών · Ομάδα Α</strong>
          <span>{selected.segment.percent !== null && compared.segment.percent !== null
            ? relationshipMapCellValue(selected.segment.percent - compared.segment.percent, "gap")
            : "Ανεπαρκής βάση για τη σύγκριση"}</span>
          <small>{selected.label} σε σχέση με {compared.label}.</small>
        </div>}
      </section>
    </div>
    <section className="relation-explorer-ranking">
      <div className="relation-explorer-toolbar">
        <div><strong>4. Κατάταξη Περιφερειών</strong>
          <p>Πατήστε μια γραμμή για να δείτε τη σχέση πάνω στον χάρτη.</p></div>
        <small>{ranked.length} από {regions.length} Περιφέρειες</small>
      </div>
      <div className="relation-explorer-ranking-filters">
        <label>Αναζήτηση Περιφέρειας
          <input value={search} onChange={e => setSearch(e.target.value)}
            type="search" placeholder="π.χ. Πελοπόννησος" />
        </label>
        <label>Ταξινόμηση
          <select value={order} onChange={e => setOrder(e.target.value as Order)}>
            <option value="highest">Υψηλότερο πρώτα</option>
            <option value="lowest">Χαμηλότερο πρώτα</option>
            <option value="alphabetical">Αλφαβητικά</option>
          </select>
        </label>
        <label className="relation-explorer-check">
          <input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} />
          Μόνο επαρκές δείγμα
        </label>
      </div>
      {ranked.length ? <div className="relation-explorer-rank-list">
        {ranked.map(item => {
          const { value } = relationshipRegionValue(item, view);
          const active = region === item.key;
          return <button key={item.key} type="button" className={active ? "is-active" : ""}
            aria-pressed={active} onClick={() => setRegion(previous => previous === item.key ? "" : item.key)}>
            <span className="relation-explorer-rank-label">{item.label}</span>
            <span className="relation-explorer-rank-meter" aria-hidden="true">
              <span style={{ width: value === null ? "0%" : Math.min(100, view === "gap"
                ? Math.abs(value) * 2.5 : value) + "%" }} />
            </span>
            <strong>{relationshipMapCellValue(value, view)}</strong>
          </button>;
        })}
      </div> : <p role="status" className="workspace-inline-note">
        Δεν υπάρχουν Περιφέρειες που να ικανοποιούν αυτά τα κριτήρια.
        Αφαιρέστε τον περιορισμό ή αλλάξτε αναζήτηση.
      </p>}
    </section>
    <p className="research-relation-small-note">
      <strong>Μεθοδολογία:</strong> Οι συγκρίσεις δείχνουν περιγραφικές, μη σταθμισμένες συσχετίσεις.
      Όλες οι τιμές έχουν ελεγχθεί για επαρκές δείγμα στο διακομιστή πριν φτάσουν στον χάρτη.
      Η διαφορά εκφράζεται σε ποσοστιαίες μονάδες, όχι σε σχετική ποσοστιαία μεταβολή.
    </p>
  </div>;
}
