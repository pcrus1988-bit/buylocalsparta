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

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(Math.max(numerator / denominator, 0), 1);
}

function isLiveStatus(status: string): boolean {
  return status === "fielding" || status === "pilot";
}

export function ResearchLiveProgress({ initialStudy }: { initialStudy: PublicResearchStudySummary }) {
  const [study, setStudy] = useState(initialStudy);
  const [lastRefresh, setLastRefresh] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!isLiveStatus(study.status)) return;

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
  }, [initialStudy.slug, initialStudy.waveSlug, study.status]);

  const activeStage = stageIndex(study.status);
  const completion = Math.min(Math.max(study.completionRate, 0), 1);
  const isLive = isLiveStatus(study.status);
  const remaining = study.targetCompletes > 0 ? Math.max(study.targetCompletes - study.completed, 0) : 0;
  const deliveryRate = safeRatio(study.delivered, study.sent);
  const startRate = safeRatio(study.started, study.opened || study.sent);
  const stages = useMemo(() => [
    { title: "Σχεδιασμός", detail: "instrument & sample" },
    { title: "Πιλοτική", detail: "validation" },
    { title: "Συλλογή", detail: "fieldwork" },
    { title: "Ανάλυση", detail: "QA & weighting" },
    { title: "Δημοσίευση", detail: "governed release" }
  ], []);

  const funnel = [
    { label: "Απεστάλησαν", value: study.sent },
    { label: "Παραδόθηκαν", value: study.delivered },
    { label: "Άνοιξαν", value: study.opened },
    { label: "Ξεκίνησαν", value: study.started },
    { label: "Ολοκλήρωσαν", value: study.completed }
  ];
  const funnelMax = Math.max(study.sent, study.selected, 1);

  return <section className={styles.livePanel} aria-live="polite">
    <div className={styles.liveHead}>
      <div>
        <div className={styles.eyebrow}>Live study command center · {study.waveTitle}</div>
        <h2>{statusLabel(study.status)}</h2>
        <div className={styles.heroBadges}>
          <span className={[styles.badge, isLive ? styles.badgeLive : ""].filter(Boolean).join(" ")}>
            {isLive && <span className={styles.dot} aria-hidden="true" />}
            {isLive ? "Live fieldwork" : "Public snapshot"}
          </span>
          <span className={styles.badge}>Privacy-safe aggregates</span>
        </div>
      </div>
      <div className={styles.liveNote}>
        {isLive ? "Αυτόματη ανανέωση ανά 30″" : "Τελευταία δημόσια ενημέρωση"}
        <br />
        <strong>{formatUpdated(study.updatedAt ?? lastRefresh)}</strong>
      </div>
    </div>

    <div className={styles.liveSummary}>
      <div className={styles.completionCard}>
        <span>Ολοκλήρωση στόχου</span>
        <strong>{study.targetCompletes > 0 ? percent(completion) : "—"}</strong>
        <small>
          {study.targetCompletes > 0
            ? study.completed.toLocaleString("el-GR") + " από " + study.targetCompletes.toLocaleString("el-GR") + " ολοκληρώσεις · απομένουν " + remaining.toLocaleString("el-GR")
            : "Ο τελικός στόχος ολοκληρώσεων δεν έχει κλειδώσει ακόμη."}
        </small>
      </div>

      <div>
        <div className={styles.progressTrack} aria-label={"Πρόοδος στόχου " + percent(completion)}>
          <div className={styles.progressFill} style={{ width: (completion * 100).toFixed(1) + "%" }} />
        </div>
        <div className={styles.progressCaption}>
          <span><strong>{study.completed.toLocaleString("el-GR")}</strong> ολοκληρωμένες απαντήσεις</span>
          <span>στόχος <strong>{study.targetCompletes > 0 ? study.targetCompletes.toLocaleString("el-GR") : "—"}</strong></span>
        </div>

        <div className={styles.funnel} aria-label="Fieldwork funnel">
          {funnel.map((item) => <div className={styles.funnelStep} key={item.label}>
            <span>{item.label}</span>
            <div className={styles.funnelBar} aria-hidden="true">
              <div className={styles.funnelFill} style={{ width: (safeRatio(item.value, funnelMax) * 100).toFixed(1) + "%" }} />
            </div>
            <strong>{item.value.toLocaleString("el-GR")}</strong>
          </div>)}
        </div>
      </div>
    </div>

    <div className={styles.metrics}>
      <article className={styles.metric}>
        <span>Επιλεγμένο δείγμα</span>
        <strong>{study.selected.toLocaleString("el-GR")}</strong>
        <small>μονάδες στο ενεργό sample draw</small>
      </article>
      <article className={styles.metric}>
        <span>Delivery rate</span>
        <strong>{study.sent > 0 ? percent(deliveryRate) : "—"}</strong>
        <small>{study.delivered.toLocaleString("el-GR")} από {study.sent.toLocaleString("el-GR")} αποστολές</small>
      </article>
      <article className={styles.metric}>
        <span>Start rate</span>
        <strong>{(study.opened > 0 || study.sent > 0) ? percent(startRate) : "—"}</strong>
        <small>{study.started.toLocaleString("el-GR")} survey starts</small>
      </article>
      <article className={styles.metric}>
        <span>Response rate</span>
        <strong>{study.sent > 0 ? percent(study.responseRate) : "—"}</strong>
        <small>ολοκληρωμένες / απεσταλμένες</small>
      </article>
    </div>

    <div className={styles.timeline} aria-label="Κύκλος ζωής μελέτης">
      {stages.map((stage, index) => <div
        key={stage.title}
        className={[
          styles.timelineStep,
          index < activeStage ? styles.timelineDone : "",
          index === activeStage ? styles.timelineActive : ""
        ].filter(Boolean).join(" ")}
      >
        <strong>{String(index + 1).padStart(2, "0")} · {stage.title}</strong>
        {stage.detail}
      </div>)}
    </div>
  </section>;
}
