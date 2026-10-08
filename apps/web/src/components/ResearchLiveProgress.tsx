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
    fielding: "Κύρια συλλογή απαντήσεων",
    closed: "Η συλλογή ολοκληρώθηκε",
    analysis: "Ανάλυση",
    published: "Δημοσιευμένη",
    archived: "Αρχειοθετημένη"
  } as Record<string, string>)[status] ?? "Ενημέρωση σε εξέλιξη";
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
        // Keep the last successful public data visible.
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
  const isLive = study.status === "fielding";
  const remaining = study.targetCompletes > 0 ? Math.max(study.targetCompletes - study.completed, 0) : 0;
  const deliveryRate = safeRatio(study.delivered, study.sent);
  const startRate = safeRatio(study.started, study.opened || study.sent);
  const stages = useMemo(() => [
    { title: "Σχεδιασμός", detail: "ερωτήματα και δείγμα" },
    { title: "Πιλοτική", detail: "δοκιμή της έρευνας" },
    { title: "Συλλογή", detail: "συγκέντρωση απαντήσεων" },
    { title: "Ανάλυση", detail: "έλεγχος και υπολογισμοί" },
    { title: "Δημοσίευση", detail: "τελικά αποτελέσματα" }
  ], []);

  const participation = [
    { label: "Απεστάλησαν", value: study.sent },
    { label: "Παραδόθηκαν", value: study.delivered },
    { label: "Άνοιξαν", value: study.opened },
    { label: "Ξεκίνησαν", value: study.started },
    { label: "Ολοκλήρωσαν", value: study.completed }
  ];
  const participationMax = Math.max(study.sent, study.selected, 1);

  return <section className={styles.livePanel} aria-live="polite">
    <div className={styles.liveHead}>
      <div>
        <div className={styles.eyebrow}>Πρόοδος μελέτης</div>
        <h2>{statusLabel(study.status)}</h2>
        <div className={styles.heroBadges}>
          <span className={[styles.badge, isLive ? styles.badgeLive : ""].filter(Boolean).join(" ")}>
            {isLive && <span className={styles.dot} aria-hidden="true" />}
            {isLive ? "Σε εξέλιξη" : "Τελευταία διαθέσιμη ενημέρωση"}
          </span>
          <span className={styles.badge}>Συγκεντρωτικά στοιχεία</span>
        </div>
      </div>
      <div className={styles.liveNote}>
        {isLive ? "Αυτόματη ανανέωση ανά 30″" : "Τελευταία ενημέρωση"}
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
            ? study.completed.toLocaleString("el-GR") + " από " + study.targetCompletes.toLocaleString("el-GR") + " ολοκληρωμένες απαντήσεις · απομένουν " + remaining.toLocaleString("el-GR")
            : "Ο τελικός στόχος δεν έχει οριστεί ακόμη."}
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

        <div className={styles.funnel} aria-label="Πορεία συμμετοχής">
          {participation.map((item) => <div className={styles.funnelStep} key={item.label}>
            <span>{item.label}</span>
            <div className={styles.funnelBar} aria-hidden="true">
              <div className={styles.funnelFill} style={{ width: (safeRatio(item.value, participationMax) * 100).toFixed(1) + "%" }} />
            </div>
            <strong>{item.value.toLocaleString("el-GR")}</strong>
          </div>)}
        </div>
      </div>
    </div>

    <div className={styles.metrics}>
      <article className={styles.metric}>
        <span>Επιχειρήσεις κύριας έρευνας</span>
        <strong>{study.selected.toLocaleString("el-GR")}</strong>
        <small>μονάδες των ενεργών ομάδων της κύριας συλλογής</small>
      </article>
      <article className={styles.metric}>
        <span>Ποσοστό παράδοσης</span>
        <strong>{study.sent > 0 ? percent(deliveryRate) : "—"}</strong>
        <small>{study.delivered.toLocaleString("el-GR")} από {study.sent.toLocaleString("el-GR")} προσκλήσεις</small>
      </article>
      <article className={styles.metric}>
        <span>Ποσοστό έναρξης</span>
        <strong>{(study.opened > 0 || study.sent > 0) ? percent(startRate) : "—"}</strong>
        <small>{study.started.toLocaleString("el-GR")} συμμετέχοντες ξεκίνησαν</small>
      </article>
      <article className={styles.metric}>
        <span>Ποσοστό ανταπόκρισης</span>
        <strong>{study.sent > 0 ? percent(study.responseRate) : "—"}</strong>
        <small>ολοκληρωμένες απαντήσεις σε σχέση με τις προσκλήσεις</small>
      </article>
    </div>

    <div className={styles.timeline} aria-label="Στάδια μελέτης">
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
