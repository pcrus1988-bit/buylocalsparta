"use client";

import { useState, type FormEvent } from "react";
import type { DeliveryControlWorkspace } from "../lib/delivery-control-runtime";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) { return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "medium" }).format(value) : "—"; }
function num(value: number, digits = 1) { return new Intl.NumberFormat("el-GR", { maximumFractionDigits: digits }).format(value); }
function risk(value: string) { return value === "critical" ? "RED" : value === "shortage" ? "ORANGE" : value === "watch" ? "YELLOW" : "GREEN"; }

export function DeliveryManagerWorkspaceClient({ initial, csrfToken }: { initial: DeliveryControlWorkspace; csrfToken: string }) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [red, setRed] = useState({ reason: "", expiresMinutes: 30 });

  async function refresh() {
    const response = await fetch("/api/delivery/manage", { cache: "no-store" });
    if (response.ok) setData(await response.json() as DeliveryControlWorkspace);
  }
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
      setNotice(name === "run_dispatch" ? `Dispatcher: ${body.evaluated ?? 0} αξιολογήσεις · ${body.offered ?? 0} offers.` : "Η ενέργεια καταγράφηκε.");
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
  const available = data.drivers.filter((driver) => driver.status === "active" && driver.acceptingJobs && ["available", "busy"].includes(driver.operationalStatus));

  return <div className={styles.grid}>
    {notice && <div className={styles.notice}>{notice}</div>}
    <section className={`${styles.grid} ${styles.three}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Fleet</div><h2>{available.length}/{data.drivers.filter((d) => d.status === "active").length}</h2><p className={styles.muted}>drivers operational</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Work queue</div><h2>{openJobs.length}</h2><p className={styles.muted}>open jobs</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Forecast</div><h2>{latestForecast ? risk(latestForecast.riskLevel) : "GREEN"}</h2><p className={styles.muted}>{latestForecast ? stamp(latestForecast.generatedAt) : "No active warning"}</p></article>
    </section>

    <section className={styles.card}><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Autonomous operations</div><h2>Dispatcher oversight</h2></div><button className={styles.button} disabled={busy} type="button" onClick={() => void action("run_dispatch", {})}>Re-evaluate fleet now</button></div><p className={styles.muted}>Η ενέργεια ζητά από τον αλγόριθμο νέα αξιολόγηση. Δεν αποτελεί manual dispatch και δεν παρακάμπτει constraints.</p></section>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Live fleet</div><h2>Route & fairness state</h2></div><button className={styles.buttonSecondary} type="button" onClick={() => void refresh()}>Refresh</button></div><div className={`${styles.grid} ${styles.two}`}>{data.drivers.map((driver) => <article className={styles.card} key={driver.id}><div className={styles.toolbar}><strong>{driver.name}</strong><span className={styles.status}>{driver.operationalStatus}</span></div><p className={styles.muted}>{driver.partnerName} · {driver.activeJobs} active · GPS {driver.latestLocationAt ? stamp(driver.latestLocationAt) : "missing"}</p><div className={styles.toolbar}><span className={styles.badge}>7d burden {num(driver.workload7d)}</span><span className={styles.badge}>fairness Δ {num(driver.fairnessDebt)}</span><span className={styles.badge}>{driver.farJobs7d} far</span><span className={styles.badge}>{driver.difficultJobs7d} difficult</span></div><p className={styles.muted}>Route {driver.routeVersion ? `v${driver.routeVersion} · ${driver.routeState}` : "—"} · 7d {num(driver.plannedDistance7d)} planned km</p></article>)}</div></section>

    <section className={`${styles.grid} ${styles.two}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Red Button request</div><h2>Escalation</h2><p className={styles.muted}>Red Mode ενεργοποιείται μόνο αφού εγκρίνουν δύο διαφορετικοί άνθρωποι: Delivery Manager + Admin.</p><form className={styles.form} onSubmit={(event) => void requestRed(event)}><label className={styles.field}><span>Operational reason</span><textarea minLength={8} value={red.reason} onChange={(event) => setRed({ ...red, reason: event.target.value })} required /></label><label className={styles.field}><span>Expires in minutes</span><input type="number" min={5} max={120} value={red.expiresMinutes} onChange={(event) => setRed({ ...red, expiresMinutes: Number(event.target.value) })} /></label><button className={styles.button} type="submit" disabled={busy}>Request Red Mode</button></form></article>
      <article className={styles.card}><div className={styles.eyebrow}>Four-eyes</div><h2>Approval queue</h2><div className={styles.stopList}>{data.redRequests.length === 0 ? <div className={styles.empty}>No requests.</div> : data.redRequests.map((request) => <div className={styles.stop} key={request.id}><span className={styles.stopIndex}>!</span><div><strong>{request.state.toUpperCase()} · {request.reason}</strong><div className={styles.muted}>Admin: {request.adminApprover ?? "pending"} · Manager: {request.managerApprover ?? "pending"} · expires {stamp(request.expiresAt)}</div></div>{request.state === "requested" && !request.managerApprover && <button className={styles.buttonSecondary} disabled={busy} type="button" onClick={() => void action("approve_red_mode", { requestId: request.id })}>Manager approve</button>}</div>)}</div></article>
    </section>

    <section><div className={styles.eyebrow}>Forecast / Next Best Action</div><h2>Operational outlook</h2>{data.forecasts.length === 0 ? <div className={styles.empty}>No forecasts yet.</div> : <div className={`${styles.grid} ${styles.three}`}>{data.forecasts.slice(0, 9).map((forecast) => <article className={styles.card} key={forecast.id}><div className={styles.toolbar}><strong>{forecast.bucket.slice(0, 5)} · {forecast.zone}</strong><span className={styles.status}>{risk(forecast.riskLevel)}</span></div><p>{num(forecast.expectedJobs)} jobs · {num(forecast.expectedPackages)} packages</p><p className={styles.muted}>{num(forecast.availableDrivers ?? 0)} driver equivalents · capacity {num(forecast.expectedCapacity ?? 0)}</p>{forecast.nextBestActions.map((item, index) => <div className={styles.notice} key={index}>{Object.entries(item).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</div>)}</article>)}</div>}</section>

    <section><div className={styles.eyebrow}>Algorithm explanations</div><h2>Recent dispatch decisions</h2>{data.decisions.length === 0 ? <div className={styles.empty}>No decisions yet.</div> : <div className={styles.grid}>{data.decisions.slice(0, 30).map((decision) => <article className={styles.card} key={decision.id}><div className={styles.toolbar}><span className={styles.badge}>{decision.decisionType}</span><strong>{decision.jobId ?? "fleet"} → {decision.driverName ?? "—"}</strong><span className={styles.status}>{decision.chosen ? "CHOSEN" : decision.feasible ? "candidate" : "rejected"}{decision.score == null ? "" : ` · ${num(decision.score, 2)}`}</span></div>{decision.rejectionReasons.length > 0 && <p className={styles.muted}>{decision.rejectionReasons.join(" · ")}</p>}<p className={styles.muted}>{stamp(decision.createdAt)}</p></article>)}</div>}</section>
  </div>;
}
