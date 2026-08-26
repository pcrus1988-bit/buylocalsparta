"use client";

import { useEffect, useState } from "react";
import type { DeliveryDriverOperationsSnapshot } from "../lib/delivery-operations-reporting";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(value) : "—";
}
function duration(minutes: number) {
  const value = Math.max(0, Math.round(minutes));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}ω ${mins}λ` : `${mins}λ`;
}
function num(value?: number, digits = 1) {
  return value == null ? "—" : new Intl.NumberFormat("el-GR", { maximumFractionDigits: digits }).format(value);
}
function pct(value?: number) { return value == null ? "—" : `${Math.round(value * 100)}%`; }
function jobType(value: string) { return value === "return" ? "Επιστροφή" : "Παράδοση"; }

export function DeliveryDriverInsightsClient({ initial }: { initial: DeliveryDriverOperationsSnapshot }) {
  const [data, setData] = useState(initial);
  const [days, setDays] = useState(initial.rangeDays);
  const [notice, setNotice] = useState("");

  async function refresh(nextDays = days) {
    try {
      const response = await fetch(`/api/driver/insights?days=${nextDays}`, { cache: "no-store" });
      const body = await response.json() as DeliveryDriverOperationsSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Δεν ήταν δυνατή η ανανέωση.");
      setData(body);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Δεν ήταν δυνατή η ανανέωση.");
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [days]);

  const performance = data.performance;
  return <section className={styles.grid}>
    <div className={styles.sectionTitle}>
      <div><div className={styles.eyebrow}>My operations</div><h2>Ώρες, στατιστικά & ιστορικό</h2></div>
      <div className={styles.toolbar}>
        <label className={styles.field}><span>Περίοδος</span><select value={days} onChange={(event) => { const next = Number(event.target.value); setDays(next); void refresh(next); }}><option value={7}>7 ημέρες</option><option value={30}>30 ημέρες</option><option value={90}>90 ημέρες</option></select></label>
        <button className={styles.buttonSecondary} type="button" onClick={() => window.print()}>Εκτύπωση</button>
      </div>
    </div>
    {notice && <div className={styles.notice}>{notice}</div>}

    <div className={`${styles.grid} ${styles.three}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Σήμερα</div><h2>{duration(data.todayWorkedMinutes)}</h2><p className={styles.muted}>καθαρός χρόνος εργασίας</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Αυτή την εβδομάδα</div><h2>{duration(data.weekWorkedMinutes)}</h2><p className={styles.muted}>χωρίς καταγεγραμμένες παύσεις</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Τρέχουσα βάρδια</div><h2>{data.currentShift ? duration(data.currentShift.netMinutes) : "Εκτός βάρδιας"}</h2><p className={styles.muted}>{data.currentBreakStartedAt ? `Σε παύση από ${stamp(data.currentBreakStartedAt)}` : data.currentShift ? `Έναρξη ${stamp(data.currentShift.startedAt)}` : "Δεν υπάρχει ανοικτή βάρδια"}</p></article>
    </div>

    <div className={`${styles.grid} ${styles.three}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Ολοκληρώθηκαν · {data.rangeDays}d</div><h2>{performance.completed}</h2><p className={styles.muted}>{performance.completedStops} ολοκληρωμένα stops · {performance.assigned} αναθέσεις</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>On-time</div><h2>{pct(performance.onTimeRate)}</h2><p className={styles.muted}>σε εργασίες με promised-by χρόνο</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Ρυθμός</div><h2>{num(performance.deliveriesPerHour, 2)}/ώρα</h2><p className={styles.muted}>μ.ό. {num(performance.averageDeliveryMinutes, 0)} λεπτά/ολοκληρωμένη εργασία</p></article>
    </div>

    <article className={styles.card}>
      <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Timekeeping</div><h2>Πρόσφατες βάρδιες</h2></div></div>
      <div className={styles.stopList}>{data.recentShifts.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ακόμη καταγεγραμμένες βάρδιες.</div> : data.recentShifts.map((shift) => <div className={styles.stop} key={shift.id}><span className={styles.stopIndex}>⏱</span><div><strong>{stamp(shift.startedAt)} → {shift.endedAt ? stamp(shift.endedAt) : "σε εξέλιξη"}</strong><div className={styles.muted}>Καθαρά {duration(shift.netMinutes)} · παύσεις {duration(shift.breakMinutes)}{shift.adjusted ? " · διορθώθηκε από manager" : ""}</div></div></div>)}</div>
    </article>

    <article className={styles.card}>
      <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Delivery history</div><h2>Ιστορικό εργασιών</h2></div></div>
      <div className={styles.stopList}>{data.history.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν εργασίες στην επιλεγμένη περίοδο.</div> : data.history.map((job) => <div className={styles.stop} key={job.id}><span className={styles.stopIndex}>{job.late ? "!" : "✓"}</span><div><strong>{jobType(job.type)} · {job.orderId}</strong><div className={styles.muted}>{job.status} · {job.completedStops}/{job.totalStops} stops · {job.packageCount} δέματα{job.completedAt ? ` · ${stamp(job.completedAt)}` : job.startedAt ? ` · έναρξη ${stamp(job.startedAt)}` : ""}{job.late ? " · ΕΚΤΟΣ SLA" : ""}</div></div></div>)}</div>
    </article>
  </section>;
}
