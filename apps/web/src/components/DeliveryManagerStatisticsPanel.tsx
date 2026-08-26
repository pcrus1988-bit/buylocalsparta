"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeliveryManagerStatistics, DeliveryReportKind } from "../lib/delivery-report-runtime";
import styles from "./DeliveryOperations.module.css";

function num(value: number, digits=1) {
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits:digits }).format(value);
}
function athensDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Athens", year:"numeric", month:"2-digit", day:"2-digit" }).format(value);
}

const reports: readonly [DeliveryReportKind,string,string][] = [
  ["driver-summary","Σύνοψη οδηγών","Jobs, ώρες, km, fairness και proof quality ανά οδηγό."],
  ["job-detail","Εργασίες διανομής","Αναλυτικό ιστορικό jobs, χρόνων, statuses και assignments."],
  ["proof-evidence","QR / GPS αποδεικτικά","Timestamps, coordinates, accuracy, distance-to-stop και evidence status."],
  ["shift-timekeeping","Χρονομέτρηση οδηγών","Shift start/pause/resume/end και evidence-backed active time."],
  ["blocked-dispatch","Blocked dispatch","Unpaid, cancelled ή μη επιλέξιμες αναθέσεις που μπλοκαρίστηκαν."],
];

export function DeliveryManagerStatisticsPanel() {
  const [data,setData] = useState<DeliveryManagerStatistics | null>(null);
  const [from,setFrom] = useState("");
  const [to,setTo] = useState("");
  const [driverId,setDriverId] = useState("");
  const [partnerId,setPartnerId] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");

  function query(kind?: DeliveryReportKind) {
    const params = new URLSearchParams();
    if (from) params.set("from",from);
    if (to) params.set("to",to);
    if (driverId) params.set("driverId",driverId);
    if (partnerId) params.set("partnerId",partnerId);
    if (kind) params.set("kind",kind);
    return params.toString();
  }

  async function refresh() {
    setBusy(true);setError("");
    try {
      const response = await fetch(`/api/delivery/manage/statistics?${query()}`,{ cache:"no-store" });
      const body = await response.json() as DeliveryManagerStatistics & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Αποτυχία φόρτωσης στατιστικών.");
      setData(body);
      setFrom(body.filters.from);
      setTo(body.filters.to);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Αποτυχία φόρτωσης στατιστικών.");
    } finally { setBusy(false); }
  }

  useEffect(()=>{
    void refresh();
    const manualRefresh = () => void refresh();
    window.addEventListener("delivery-manager-refresh",manualRefresh);
    return () => window.removeEventListener("delivery-manager-refresh",manualRefresh);
  },[]);

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate()-(days-1));
    setFrom(athensDate(start));
    setTo(athensDate(end));
  }

  const visibleDrivers = useMemo(()=>data?.drivers ?? [],[data]);

  return <section id="dm-reports" className={`${styles.managerSection} ${styles.reportSection}`}>
    <div className={styles.managerSectionHead}>
      <div><div className={styles.eyebrow}>Statistics & PDF reporting</div><h2>Απόδοση, χρονομέτρηση & settlement evidence</h2></div>
      <button className={styles.buttonSecondary} disabled={busy} type="button" onClick={()=>void refresh()}>{busy?"Loading…":"↻ Refresh"}</button>
    </div>
    <p className={styles.managerSectionIntro}>Τα στοιχεία βασίζονται σε server timestamps, append-only QR/GPS proof events, shift events και sampled GPS. Μη επαληθευμένο GPS παραμένει ορατό ως warning και δεν εμφανίζεται ως verified settlement proof.</p>

    <article className={`${styles.card} ${styles.reportFilterCard}`}>
      <div className={styles.reportPresetRow}>
        <span>Γρήγορο διάστημα</span>
        <button type="button" onClick={()=>preset(1)}>Σήμερα</button>
        <button type="button" onClick={()=>preset(7)}>7 ημέρες</button>
        <button type="button" onClick={()=>preset(30)}>30 ημέρες</button>
      </div>
      <div className={styles.reportFilterGrid}>
        <label className={styles.field}><span>Από</span><input type="date" value={from} onChange={(event)=>setFrom(event.target.value)} /></label>
        <label className={styles.field}><span>Έως</span><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></label>
        <label className={styles.field}><span>Delivery Partner</span><select value={partnerId} onChange={(event)=>{setPartnerId(event.target.value);setDriverId("");}}><option value="">Όλοι</option>{data?.partnerOptions.map((partner)=><option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
        <label className={styles.field}><span>Οδηγός</span><select value={driverId} onChange={(event)=>setDriverId(event.target.value)}><option value="">Όλοι</option>{data?.driverOptions.filter((driver)=>!partnerId||driver.partnerId===partnerId).map((driver)=><option key={driver.id} value={driver.id}>{driver.name} · {driver.partnerName}</option>)}</select></label>
        <button className={styles.button} disabled={busy} type="button" onClick={()=>void refresh()}>Εφαρμογή φίλτρων</button>
      </div>
      {error&&<div className={`${styles.notice} ${styles.error}`}>{error}</div>}
    </article>

    {data&&<>
      <div className={styles.managerMetricGrid}>
        <article className={styles.metricCard}><span>Jobs</span><strong>{data.totals.jobs}</strong><p>{data.totals.completedJobs} completed · {data.totals.cancelledJobs} cancelled · {data.totals.returnJobs} returns</p></article>
        <article className={styles.metricCard}><span>Time & distance</span><strong>{num(data.totals.trackedKm)} <small>km</small></strong><p>{num(data.totals.activeHours)} evidence-backed active hours</p></article>
        <article className={styles.metricCard}><span>QR / GPS proof</span><strong>{data.totals.verifiedProofs}<small> / {data.totals.proofEvents}</small></strong><p>{data.totals.proofWarnings} warnings για review</p></article>
        <article className={styles.metricCard}><span>Dispatch protection</span><strong>{data.totals.unpaidBlocked}</strong><p>unpaid · {data.totals.blockedEvents} total eligibility blocks</p></article>
        <article className={styles.metricCard} data-risk={data.totals.invalidActiveAssignments===0?"GREEN":"RED"}><span>Safety invariant</span><strong>{data.totals.invalidActiveAssignments}</strong><p>invalid active assignments · στόχος πάντα 0</p></article>
      </div>

      <section className={styles.reportLibrary}>
        <div className={styles.managerSectionHead}><div><div className={styles.eyebrow}>PDF library</div><h3>Δημιουργία αναφοράς</h3></div><span className={styles.managerCount}>PDF only</span></div>
        <div className={styles.reportGrid}>{reports.map(([kind,label,description])=><a className={styles.reportCard} key={kind} href={`/api/delivery/manage/reports?${query(kind)}`}>
          <span className={styles.reportIcon}>PDF</span><div><strong>{label}</strong><p>{description}</p></div><span className={styles.reportArrow}>↓</span>
        </a>)}</div>
      </section>

      <section className={styles.reportDrivers}>
        <div className={styles.managerSectionHead}><div><div className={styles.eyebrow}>Driver statistics</div><h3>Απόδοση ανά οδηγό</h3></div><span className={styles.managerCount}>{visibleDrivers.length}</span></div>
        <div className={styles.managerDriverGrid}>{visibleDrivers.length===0?<div className={styles.empty}>Δεν υπάρχουν δεδομένα για τα φίλτρα.</div>:visibleDrivers.map((driver)=><article className={`${styles.card} ${styles.driverCard}`} key={driver.id}>
          <div className={styles.driverCardHead}><div><strong>{driver.name}</strong><span>{driver.partnerName}</span></div><span className={styles.statusPill}>{driver.completedJobs}/{driver.jobs} completed</span></div>
          <div className={styles.driverMiniStats}>
            <div><span>km</span><strong>{num(driver.trackedKm)}</strong></div>
            <div><span>active h</span><strong>{num(driver.activeHours)}</strong></div>
            <div><span>proof</span><strong>{driver.verifiedProofs}/{driver.proofEvents}</strong></div>
            <div><span>fairness Δ</span><strong>{num(driver.fairnessDebt)}</strong></div>
          </div>
          <div className={styles.compactBadges}><span className={styles.badge}>{driver.proofWarnings} proof warnings</span><span className={styles.badge}>{driver.farJobs} far</span><span className={styles.badge}>{driver.returnJobs} returns</span></div>
          <p className={styles.muted}>Avg completion {driver.averageCompletionMinutes==null?"—":`${num(driver.averageCompletionMinutes)} min`} · cancelled {driver.cancelledJobs}</p>
        </article>)}</div>
      </section>
    </>}
  </section>;
}
