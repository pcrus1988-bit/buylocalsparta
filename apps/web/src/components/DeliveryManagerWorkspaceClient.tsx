"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DeliveryControlWorkspace } from "../lib/delivery-control-runtime";
import { DeliveryLiveFleetMap, type DeliveryMapPoint } from "./DeliveryLiveFleetMap";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) { return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "medium" }).format(value) : "—"; }
function num(value: number, digits = 1) { return new Intl.NumberFormat("el-GR", { maximumFractionDigits: digits }).format(value); }
function risk(value: string) { return value === "critical" ? "RED" : value === "shortage" ? "ORANGE" : value === "watch" ? "YELLOW" : "GREEN"; }

export function DeliveryManagerWorkspaceClient({ initial, csrfToken }: { initial: DeliveryControlWorkspace; csrfToken: string }) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [red, setRed] = useState({ reason: "", expiresMinutes: 30 });
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  async function refresh() {
    const response = await fetch("/api/delivery/manage", { cache: "no-store" });
    if (response.ok) {
      setData(await response.json() as DeliveryControlWorkspace);
      setLastRefresh(Date.now());
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 8_000);
    const manualRefresh = () => void refresh();
    window.addEventListener("delivery-manager-refresh", manualRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("delivery-manager-refresh", manualRefresh);
    };
  }, []);

  async function action(name: string, payload: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/delivery/manage", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: name, ...payload }),
      });
      const body = await response.json() as { error?: string; evaluated?: number; offered?: number };
      if (!response.ok) throw new Error(body.error ?? "Η ενέργεια απέτυχε.");
      setNotice(name === "run_dispatch" ? `Dispatcher: ${body.evaluated ?? 0} αξιολογήσεις · ${body.offered ?? 0} νέες προτάσεις.` : "Η ενέργεια καταγράφηκε.");
      await refresh();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Η ενέργεια απέτυχε.");
      return false;
    } finally { setBusy(false); }
  }

  async function requestRed(event: FormEvent) {
    event.preventDefault();
    if (await action("request_red_mode", { reason: red.reason, expiresMinutes: red.expiresMinutes, scope: { type: "fleet" } })) setRed({ reason: "", expiresMinutes: 30 });
  }

  const latestForecast = data.forecasts[0];
  const openJobs = data.jobs.filter((job) => !["completed", "cancelled", "failed"].includes(job.status));
  const activeDrivers = data.drivers.filter((driver) => driver.status === "active");
  const available = activeDrivers.filter((driver) => driver.acceptingJobs && ["available", "busy"].includes(driver.operationalStatus));
  const liveMapPoints = useMemo(() => {
    const points = new Map<string, DeliveryMapPoint>();
    for (const job of data.jobs) {
      if (!job.latestLocation || !job.driverId || ["completed", "cancelled", "failed"].includes(job.status)) continue;
      points.set(job.driverId, {
        id: job.driverId,
        label: job.driverName ?? job.orderId,
        latitude: job.latestLocation.latitude,
        longitude: job.latestLocation.longitude,
        receivedAt: job.latestLocation.receivedAt,
        detail: `${job.orderId} · ${job.status}`,
      });
    }
    return [...points.values()];
  }, [data.jobs]);

  return <div className={styles.managerWorkspace}>
    {notice && <div className={`${styles.notice} ${styles.managerNotice}`}>{notice}</div>}

    <section id="dm-overview" className={styles.managerSection}>
      <div className={styles.managerSectionHead}>
        <div><div className={styles.eyebrow}>Live overview</div><h2>Η εικόνα της διανομής τώρα</h2></div>
        <span className={styles.managerFreshness}>↻ {stamp(lastRefresh)}</span>
      </div>
      <div className={styles.managerMetricGrid}>
        <article className={styles.metricCard}><span>Διαθέσιμος στόλος</span><strong>{available.length}<small> / {activeDrivers.length}</small></strong><p>οδηγοί online & accepting</p></article>
        <article className={styles.metricCard}><span>Ανοιχτές εργασίες</span><strong>{openJobs.length}</strong><p>σε queue, assigned ή in progress</p></article>
        <article className={styles.metricCard} data-risk={latestForecast ? risk(latestForecast.riskLevel) : "GREEN"}><span>Operational health</span><strong>{latestForecast ? risk(latestForecast.riskLevel) : "GREEN"}</strong><p>{latestForecast ? `forecast ${stamp(latestForecast.generatedAt)}` : "χωρίς ενεργή προειδοποίηση"}</p></article>
      </div>

      <article className={`${styles.card} ${styles.managerActionCard}`}>
        <div>
          <div className={styles.eyebrow}>Autonomous dispatcher</div>
          <h3>Επανεκτίμηση στόλου</h3>
          <p className={styles.muted}>Ζητά νέα αξιολόγηση από τον αλγόριθμο. Δεν κάνει manual assignment και δεν παρακάμπτει payment, safety ή capacity constraints.</p>
        </div>
        <button className={styles.button} disabled={busy} type="button" onClick={() => void action("run_dispatch", {})}>{busy ? "Εκτελείται…" : "Re-evaluate now"}</button>
      </article>
    </section>

    <section id="dm-map" className={styles.managerSection}>
      <div className={styles.managerSectionHead}>
        <div><div className={styles.eyebrow}>Live operations map</div><h2>Πού βρίσκονται οι ενεργοί οδηγοί</h2></div>
        <button className={styles.buttonSecondary} type="button" onClick={() => void refresh()}>↻ Refresh</button>
      </div>
      <DeliveryLiveFleetMap points={liveMapPoints} title="Live στόλος" emptyMessage="Δεν υπάρχει πρόσφατη GPS θέση από οδηγό σε ενεργή εργασία." />
    </section>

    <section id="dm-fleet" className={styles.managerSection}>
      <div className={styles.managerSectionHead}><div><div className={styles.eyebrow}>Fleet</div><h2>Οδηγοί, route state & fairness</h2></div><span className={styles.managerCount}>{data.drivers.length} οδηγοί</span></div>
      <div className={styles.managerDriverGrid}>{data.drivers.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν οδηγοί.</div> : data.drivers.map((driver) => <article className={`${styles.card} ${styles.driverCard}`} key={driver.id}>
        <div className={styles.driverCardHead}>
          <div><strong>{driver.name}</strong><span>{driver.partnerName}</span></div>
          <span className={styles.statusPill} data-state={driver.operationalStatus}>{driver.operationalStatus}</span>
        </div>
        <div className={styles.driverMiniStats}>
          <div><span>Active</span><strong>{driver.activeJobs}</strong></div>
          <div><span>7d burden</span><strong>{num(driver.workload7d)}</strong></div>
          <div><span>Fairness Δ</span><strong>{num(driver.fairnessDebt)}</strong></div>
          <div><span>7d km</span><strong>{num(driver.plannedDistance7d)}</strong></div>
        </div>
        <p className={styles.muted}>GPS {driver.latestLocationAt ? stamp(driver.latestLocationAt) : "missing"} · Route {driver.routeVersion ? `v${driver.routeVersion} · ${driver.routeState}` : "—"}</p>
        <div className={styles.compactBadges}><span className={styles.badge}>{driver.farJobs7d} far</span><span className={styles.badge}>{driver.difficultJobs7d} difficult</span></div>
      </article>)}</div>
    </section>

    <section id="dm-alerts" className={styles.managerSection}>
      <div className={styles.managerSectionHead}><div><div className={styles.eyebrow}>Exception control</div><h2>Red Mode & four-eyes approval</h2></div></div>
      <div className={styles.managerTwoColumn}>
        <article className={`${styles.card} ${styles.redModeCard}`}>
          <div className={styles.eyebrow}>Red Button request</div><h3>Operational escalation</h3>
          <p className={styles.muted}>Red Mode ενεργοποιείται μόνο μετά από έγκριση δύο διαφορετικών ανθρώπων: Delivery Manager + Admin.</p>
          <form className={styles.form} onSubmit={(event) => void requestRed(event)}>
            <label className={styles.field}><span>Operational reason</span><textarea minLength={8} value={red.reason} onChange={(event) => setRed({ ...red, reason: event.target.value })} required /></label>
            <label className={styles.field}><span>Λήξη σε λεπτά</span><input type="number" min={5} max={120} value={red.expiresMinutes} onChange={(event) => setRed({ ...red, expiresMinutes: Number(event.target.value) })} /></label>
            <button className={styles.danger} type="submit" disabled={busy}>Request Red Mode</button>
          </form>
        </article>
        <article className={styles.card}>
          <div className={styles.eyebrow}>Four-eyes</div><h3>Approval queue</h3>
          <div className={styles.stopList}>{data.redRequests.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν αιτήματα.</div> : data.redRequests.map((request) => <div className={styles.managerApprovalRow} key={request.id}>
            <span className={styles.stopIndex}>!</span>
            <div><strong>{request.state.toUpperCase()} · {request.reason}</strong><p className={styles.muted}>Admin: {request.adminApprover ?? "pending"} · Manager: {request.managerApprover ?? "pending"}<br/>expires {stamp(request.expiresAt)}</p></div>
            {request.state === "requested" && !request.managerApprover && <button className={styles.buttonSecondary} disabled={busy} type="button" onClick={() => void action("approve_red_mode", { requestId: request.id })}>Approve</button>}
          </div>)}</div>
        </article>
      </div>
    </section>

    <section id="dm-forecast" className={styles.managerSection}>
      <div className={styles.managerSectionHead}><div><div className={styles.eyebrow}>Forecast / Next Best Action</div><h2>Τι αναμένεται στη συνέχεια</h2></div></div>
      {data.forecasts.length === 0 ? <div className={styles.empty}>Δεν υπάρχει forecast ακόμη.</div> : <div className={styles.managerForecastGrid}>{data.forecasts.slice(0, 9).map((forecast) => <article className={`${styles.card} ${styles.forecastCard}`} key={forecast.id}>
        <div className={styles.driverCardHead}><strong>{forecast.bucket.slice(0, 5)} · {forecast.zone}</strong><span className={styles.statusPill} data-risk={risk(forecast.riskLevel)}>{risk(forecast.riskLevel)}</span></div>
        <div className={styles.forecastNumbers}><strong>{num(forecast.expectedJobs)} jobs</strong><span>{num(forecast.expectedPackages)} packages</span></div>
        <p className={styles.muted}>{num(forecast.availableDrivers ?? 0)} driver equivalents · capacity {num(forecast.expectedCapacity ?? 0)}</p>
        {forecast.nextBestActions.map((item, index) => <div className={styles.nextAction} key={index}>{Object.entries(item).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</div>)}
      </article>)}</div>}
    </section>

    <section id="dm-decisions" className={styles.managerSection}>
      <details className={styles.managerDetails}>
        <summary><div><div className={styles.eyebrow}>Algorithm explanations</div><strong>Πρόσφατες αποφάσεις dispatcher</strong></div><span>{data.decisions.length} records</span></summary>
        {data.decisions.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν αποφάσεις ακόμη.</div> : <div className={styles.decisionList}>{data.decisions.slice(0, 30).map((decision) => <article className={styles.decisionRow} key={decision.id}>
          <div className={styles.decisionTop}><span className={styles.badge}>{decision.decisionType}</span><strong>{decision.jobId ?? "fleet"} → {decision.driverName ?? "—"}</strong><span className={styles.status}>{decision.chosen ? "CHOSEN" : decision.feasible ? "candidate" : "rejected"}{decision.score == null ? "" : ` · ${num(decision.score, 2)}`}</span></div>
          {decision.rejectionReasons.length > 0 && <p className={styles.muted}>{decision.rejectionReasons.join(" · ")}</p>}
          <p className={styles.muted}>{stamp(decision.createdAt)}</p>
        </article>)}</div>}
      </details>
    </section>
  </div>;
}
