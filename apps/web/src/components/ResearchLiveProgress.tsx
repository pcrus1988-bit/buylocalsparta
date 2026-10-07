"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicResearchObservatorySnapshot, PublicResearchStudySummary } from "../lib/research-observatory-runtime";
import styles from "./ResearchObservatory.module.css";

function percent(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function stageIndex(status: string): number {
  if (status === "published") return 4;
  if (status === "analysis" || status === "closed") return 3;
  if (status === "fielding") return 2;
  if (status === "pilot") return 1;
  return 0;
}

function statusLabel(status: string): string {
  return ({
    draft: "Σχεδιασμός",
    pilot: "Πιλοτική φάση",
    fielding: "Συλλογή δεδομένων",
    closed: "Η συλλογή έκλεισε",
    analysis: "Ανάλυση",
    published: "Δημοσιευμένη",
    archived: "Αρχειοθετημένη"
  } as Record<string, string>)[status] ?? status;
}

function formatUpdated(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("el-GR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ResearchLiveProgress({ initialStudy }: { initialStudy: PublicResearchStudySummary }) {
  const [study, setStudy] = useState(initialStudy);
  const [lastRefresh, setLastRefresh] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/research/observatory", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = await response.json() as PublicResearchObservatorySnapshot;
        const next = snapshot.studies.find((item) => item.waveSlug === initialStudy.waveSlug)
          ?? snapshot.studies.find((item) => item.slug === initialStudy.slug && item.isCurrentWave);
        if (!cancelled && next) {
          setStudy(next);
          setLastRefresh(snapshot.generatedAt);
        }
      } catch {
        // Keep the last successful public snapshot visible.
      }
    }

    const interval = window.setInterval(refresh, 30_000);
    void refresh();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [initialStudy.slug, initialStudy.waveSlug]);

  const activeStage = stageIndex(study.status);
  const completion = Math.min(Math.max(study.completionRate, 0), 1);
  const isLive = study.status === "fielding" || study.status === "pilot";
  const stages = useMemo(() => ["Σχεδιασμός", "Πιλοτική", "Συλλογή", "Ανάλυση", "Δημοσίευση"], []);

  return <section className={styles.livePanel} aria-live="polite">
    <div className={styles.liveHead}>
      <div>
        <div className={styles.eyebrow}>Πρόοδος μελέτης · {study.waveTitle}</div>
        <h2>{statusLabel(study.status)}</h2>
      </div>
      <div className={styles.liveNote}>
        {isLive ? <><span className={styles.dot} aria-hidden="true" /> Ζωντανή ενημέρωση ανά 30″</> : "Τελευταία ενημέρωση"}
        <br />
        {formatUpdated(study.updatedAt ?? lastRefresh)}
      </div>
    </div>

    <div className={styles.progressTrack} aria-label={"Πρόοδος στόχου " + percent(completion)}>
      <div className={styles.progressFill} style={{ width: (completion * 100).toFixed(1) + "%" }} />
    </div>
    <div className={styles.progressCaption}>
      <span><strong>{study.completed.toLocaleString("el-GR")}</strong> ολοκληρωμένες απαντήσεις</span>
      <span>στόχος <strong>{study.targetCompletes > 0 ? study.targetCompletes.toLocaleString("el-GR") : "—"}</strong> · {study.targetCompletes > 0 ? percent(completion) : "ο στόχος δεν έχει κλειδώσει"}</span>
    </div>

    <div className={styles.metrics}>
      <article className={styles.metric}>
        <span>Επιλεγμένο δείγμα</span>
        <strong>{study.selected.toLocaleString("el-GR")}</strong>
        <small>μονάδες στο ενεργό sample draw</small>
      </article>
      <article className={styles.metric}>
        <span>Προσκλήσεις</span>
        <strong>{study.sent.toLocaleString("el-GR")}</strong>
        <small>{study.delivered.toLocaleString("el-GR")} παραδόθηκαν</small>
      </article>
      <article className={styles.metric}>
        <span>Έναρξη</span>
        <strong>{study.started.toLocaleString("el-GR")}</strong>
        <small>{study.opened.toLocaleString("el-GR")} άνοιξαν πρόσκληση</small>
      </article>
      <article className={styles.metric}>
        <span>Response rate</span>
        <strong>{study.sent > 0 ? percent(study.responseRate) : "—"}</strong>
        <small>ολοκληρωμένες / απεσταλμένες</small>
      </article>
    </div>

    <div className={styles.timeline} aria-label="Κύκλος ζωής μελέτης">
      {stages.map((label, index) => <div
        key={label}
        className={[
          styles.timelineStep,
          index < activeStage ? styles.timelineDone : "",
          index === activeStage ? styles.timelineActive : ""
        ].filter(Boolean).join(" ")}
      >
        {String(index + 1).padStart(2, "0")} · {label}
      </div>)}
    </div>
  </section>;
}
