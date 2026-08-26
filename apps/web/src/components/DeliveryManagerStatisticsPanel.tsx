"use client";

import { useEffect, useMemo, useState } from "react";
import type { DeliveryManagerStatistics, DeliveryReportKind } from "../lib/delivery-report-runtime";
import styles from "./DeliveryOperations.module.css";

function num(value: number, digits=1) {
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits:digits }).format(value);
}

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

  useEffect(()=>{ void refresh(); },[]);

  const visibleDrivers = useMemo(()=>{
    if (!data) return [];
    return data.drivers;
  },[data]);

  const reports: readonly [DeliveryReportKind,string][] = [
    ["driver-summary","Σύνοψη οδηγών PDF"],
    ["job-detail","Εργασίες διανομής PDF"],
    ["proof-evidence","QR / GPS αποδεικτικά PDF"],
    ["shift-timekeeping","Χρονομέτρηση οδηγών PDF"],
    ["blocked-dispatch","Μπλοκαρισμένες αναθέσεις PDF"],
  ];

  return <section className={styles.grid}>
    <div className={styles.sectionTitle}>
      <div><div className={styles.eyebrow}>Statistics & Reporting</div><h2>Στατιστικά, χρονομέτρηση και αποδεικτικά</h2></div>
      <button className={styles.buttonSecondary} disabled={busy} type="button" onClick={()=>void refresh()}>{busy?"Loading…":"Refresh"}</button>
    </div>
    <p className={styles.muted}>Τα PDF βασίζονται σε server timestamps, append-only QR/GPS proof events, shift events και sampled GPS. Μη επαληθευμένο GPS παραμένει ορατό ως warning και δεν παρουσιάζεται ως verified settlement proof.</p>

    <article className={styles.card}>
      <div className={`${styles.grid} ${styles.three}`}>
        <label className={styles.field}><span>Από</span><input type="date" value={from} onChange={(event)=>setFrom(event.target.value)} /></label>
        <label className={styles.field}><span>Έως</span><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></label>
        <label className={styles.field}><span>Delivery Partner</span><select value={partnerId} onChange={(event)=>{setPartnerId(event.target.value);setDriverId("");}}><option value="">Όλοι</option>{data?.partnerOptions.map((partner)=><option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
        <label className={styles.field}><span>Οδηγός</span><select value={driverId} onChange={(event)=>setDriverId(event.target.value)}><option value="">Όλοι</option>{data?.driverOptions.filter((driver)=>!partnerId||driver.partnerId===partnerId).map((driver)=><option key={driver.id} value={driver.id}>{driver.name} · {driver.partnerName}</option>)}</select></label>
        <div className={styles.field}><span>Apply filters</span><button className={styles.button} disabled={busy} type="button" onClick={()=>void refresh()}>Εφαρμογή</button></div>
      </div>
      {error&&<div className={styles.notice}>{error}</div>}
    </article>

    {data&&<>
      <section className={`${styles.grid} ${styles.three}`}>
        <article className={styles.card}><div className={styles.eyebrow}>Jobs</div><h2>{data.totals.jobs}</h2><p className={styles.muted}>{data.totals.completedJobs} completed · {data.totals.cancelledJobs} cancelled · {data.totals.returnJobs} returns</p></article>
        <article className={styles.card}><div className={styles.eyebrow}>Time & distance</div><h2>{num(data.totals.trackedKm)} km</h2><p className={styles.muted}>{num(data.totals.activeHours)} evidence-backed active hours</p></article>
        <article className={styles.card}><div className={styles.eyebrow}>QR / GPS proof</div><h2>{data.totals.verifiedProofs}/{data.totals.proofEvents}</h2><p className={styles.muted}>{data.totals.proofWarnings} warnings requiring review</p></article>
        <article className={styles.card}><div className={styles.eyebrow}>Dispatch protection</div><h2>{data.totals.unpaidBlocked}</h2><p className={styles.muted}>unpaid blocks · {data.totals.blockedEvents} total eligibility blocks</p></article>
        <article className={styles.card}><div className={styles.eyebrow}>Safety invariant</div><h2>{data.totals.invalidActiveAssignments}</h2><p className={styles.muted}>invalid active assignments — target is always 0</p></article>
      </section>

      <article className={styles.card}>
        <div className={styles.eyebrow}>PDF reports</div><h2>Αναφορές</h2>
        <p className={styles.muted}>Κάθε αναφορά χρησιμοποιεί τα επιλεγμένα φίλτρα και κατεβαίνει απευθείας ως PDF.</p>
        <div className={styles.toolbar}>{reports.map(([kind,label])=><a className={styles.buttonSecondary} key={kind} href={`/api/delivery/manage/reports?${query(kind)}`}>{label}</a>)}</div>
      </article>

      <section>
        <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Driver statistics</div><h2>Απόδοση & settlement evidence</h2></div></div>
        <div className={`${styles.grid} ${styles.two}`}>{visibleDrivers.length===0?<div className={styles.empty}>Δεν υπάρχουν δεδομένα για τα φίλτρα.</div>:visibleDrivers.map((driver)=><article className={styles.card} key={driver.id}>
          <div className={styles.toolbar}><strong>{driver.name}</strong><span className={styles.status}>{driver.partnerName}</span></div>
          <p>{driver.completedJobs}/{driver.jobs} completed · {driver.returnJobs} returns · {num(driver.trackedKm)} km · {num(driver.activeHours)} h</p>
          <div className={styles.toolbar}><span className={styles.badge}>proof {driver.verifiedProofs}/{driver.proofEvents}</span><span className={styles.badge}>{driver.proofWarnings} proof warnings</span><span className={styles.badge}>{driver.farJobs} far</span><span className={styles.badge}>fairness Δ {num(driver.fairnessDebt)}</span></div>
          <p className={styles.muted}>Avg completion {driver.averageCompletionMinutes==null?"—":`${num(driver.averageCompletionMinutes)} min`} · cancelled {driver.cancelledJobs}</p>
        </article>)}</div>
      </section>
    </>}
  </section>;
}
