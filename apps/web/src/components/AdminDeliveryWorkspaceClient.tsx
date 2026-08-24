"use client";

import { useState, type FormEvent } from "react";
import type { DeliveryControlWorkspace } from "../lib/delivery-control-runtime";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "medium" }).format(value) : "—";
}
function number(value: number, digits = 1) { return new Intl.NumberFormat("el-GR", { maximumFractionDigits: digits }).format(value); }
function riskLabel(value: string) {
  if (value === "critical") return "RED · κρίσιμο";
  if (value === "shortage") return "ORANGE · έλλειψη";
  if (value === "watch") return "YELLOW · παρακολούθηση";
  return "GREEN · ομαλά";
}
function objectSummary(value: Record<string, unknown>) {
  const entries = Object.entries(value).slice(0, 6);
  return entries.length ? entries.map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`).join(" · ") : "—";
}

export function AdminDeliveryWorkspaceClient({ initial, csrfToken }: { initial: DeliveryControlWorkspace; csrfToken: string }) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ partnerName: "Local Delivery Sparta", displayName: "", email: "", phone: "", password: "" });
  const [managerEmail, setManagerEmail] = useState("");
  const [redForm, setRedForm] = useState({ reason: "", expiresMinutes: 30 });

  async function refresh() {
    const response = await fetch("/api/admin/delivery", { cache: "no-store" });
    if (response.ok) setData(await response.json() as DeliveryControlWorkspace);
  }
  async function action(name: string, payload: Record<string, unknown>) {
    setBusy(name); setNotice("");
    try {
      const response = await fetch("/api/admin/delivery", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: name, ...payload }),
      });
      const body = await response.json() as { error?: string; evaluated?: number; offered?: number };
      if (!response.ok) throw new Error(body.error ?? "Η ενέργεια απέτυχε.");
      setNotice(name === "run_dispatch" ? `Dispatcher: ${body.evaluated ?? 0} αξιολογήσεις · ${body.offered ?? 0} νέες προτάσεις.` : "Η ενέργεια ολοκληρώθηκε.");
      await refresh();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Η ενέργεια απέτυχε.");
      return false;
    } finally { setBusy(""); }
  }
  async function createDriver(event: FormEvent) {
    event.preventDefault();
    const ok = await action("create_driver", form);
    if (ok) setForm((current) => ({ ...current, displayName: "", email: "", phone: "", password: "" }));
  }
  async function resetPassword(driverId: string) {
    const password = window.prompt("Νέος προσωρινός κωδικός (τουλάχιστον 10 χαρακτήρες):");
    if (password) await action("reset_password", { driverId, password });
  }
  async function addManager(event: FormEvent) {
    event.preventDefault();
    if (await action("grant_manager", { email: managerEmail })) setManagerEmail("");
  }
  async function requestRed(event: FormEvent) {
    event.preventDefault();
    if (await action("request_red_mode", { reason: redForm.reason, expiresMinutes: redForm.expiresMinutes, scope: { type: "fleet" } })) {
      setRedForm({ reason: "", expiresMinutes: 30 });
    }
  }

  const activeDrivers = data.drivers.filter((driver) => driver.status === "active");
  const availableDrivers = activeDrivers.filter((driver) => driver.acceptingJobs && ["available", "busy"].includes(driver.operationalStatus));
  const openJobs = data.jobs.filter((job) => !["completed", "cancelled", "failed"].includes(job.status));
  const latestForecast = data.forecasts[0];
  const activeRed = data.redRequests.find((request) => request.state === "approved" && request.expiresAt > Date.now());

  return <div className={styles.grid}>
    {notice && <div className={styles.notice}>{notice}</div>}

    <section className={`${styles.grid} ${styles.three}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Fleet</div><h2>{availableDrivers.length}/{activeDrivers.length}</h2><p className={styles.muted}>οδηγοί διαθέσιμοι / ενεργοί</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Queue</div><h2>{openJobs.length}</h2><p className={styles.muted}>ανοιχτά delivery jobs</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>System health</div><h3>{activeRed ? "RED · manual authority" : latestForecast ? riskLabel(latestForecast.riskLevel) : "GREEN · no forecast alert"}</h3><p className={styles.muted}>{latestForecast ? `Forecast ${stamp(latestForecast.generatedAt)}` : "Δεν υπάρχει ενεργή πρόβλεψη κινδύνου."}</p></article>
    </section>

    <section className={styles.card}>
      <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Autonomous dispatcher</div><h2>Έλεγχος αλγορίθμου</h2></div><button className={styles.button} type="button" disabled={Boolean(busy)} onClick={() => void action("run_dispatch", {})}>Run dispatcher now</button></div>
      <p className={styles.muted}>Η κανονική ανάθεση γίνεται αυτόματα. Το κουμπί εκτελεί άμεση επιπλέον αξιολόγηση και δεν παρακάμπτει SLA, capacity, locked stops ή fairness guardrails.</p>
    </section>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Fleet fairness</div><h2>Οδηγοί · live state & burden</h2></div><button className={styles.buttonSecondary} type="button" onClick={() => void refresh()}>Ανανέωση</button></div>
      <div className={`${styles.grid} ${styles.two}`}>{data.drivers.map((driver) => <article className={styles.card} key={driver.id}>
        <div className={styles.toolbar}><strong>{driver.name}</strong><span className={styles.status}>{driver.status} · {driver.operationalStatus}</span></div>
        <p className={styles.muted}>{driver.partnerName} · {driver.email}{driver.phone ? ` · ${driver.phone}` : ""}</p>
        <div className={styles.formGrid}>
          <div className={styles.field}><span>Dispatcher</span><div>{driver.acceptingJobs ? "δέχεται αναθέσεις" : "εκτός ανάθεσης"} · {driver.activeJobs} active jobs</div></div>
          <div className={styles.field}><span>GPS</span><div>{driver.latestLocationAt ? stamp(driver.latestLocationAt) : "χωρίς πρόσφατη θέση"}</div></div>
          <div className={styles.field}><span>Route</span><div>{driver.routeVersion ? `v${driver.routeVersion} · ${driver.routeState}` : "χωρίς route plan"}</div></div>
          <div className={styles.field}><span>Shift end</span><div>{stamp(driver.shiftEndsAt)}</div></div>
        </div>
        <div className={styles.toolbar}><span className={styles.badge}>Today {number(driver.workloadToday)}</span><span className={styles.badge}>7d {number(driver.workload7d)}</span><span className={styles.badge}>30d {number(driver.workload30d)}</span><span className={styles.badge}>Fairness Δ {number(driver.fairnessDebt)}</span></div>
        <p className={styles.muted}>7d: {driver.farJobs7d} remote/far · {driver.difficultJobs7d} difficult · {number(driver.plannedDistance7d)} km planned</p>
        <div className={styles.actions}><button className={styles.buttonSecondary} type="button" onClick={() => void action("set_driver_status", { driverId: driver.id, status: driver.status === "active" ? "inactive" : "active" })}>{driver.status === "active" ? "Απενεργοποίηση" : "Ενεργοποίηση"}</button><button className={styles.buttonSecondary} type="button" onClick={() => void resetPassword(driver.id)}>Reset password</button></div>
      </article>)}</div>
    </section>

    <section className={`${styles.grid} ${styles.two}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Driver access</div><h2>Δημιουργία οδηγού</h2><form className={styles.form} onSubmit={(event) => void createDriver(event)}><div className={styles.formGrid}><label className={styles.field}><span>Delivery service</span><input value={form.partnerName} onChange={(event) => setForm({ ...form, partnerName: event.target.value })} required /></label><label className={styles.field}><span>Ονοματεπώνυμο</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></label><label className={styles.field}><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className={styles.field}><span>Τηλέφωνο</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div><label className={styles.field}><span>Προσωρινός κωδικός</span><input type="password" minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><button className={styles.button} type="submit" disabled={busy === "create_driver"}>Δημιουργία οδηγού</button></form></article>
      <article className={styles.card}><div className={styles.eyebrow}>Delivery Manager</div><h2>Operational management role</h2><p className={styles.muted}>Ο Delivery Manager χρησιμοποιεί κανονικό ΚΟΝΤΑ ΜΟΥ account και αποκτά μόνο delivery-control πρόσβαση. Δεν αποκτά Admin δικαιώματα.</p><form className={styles.manual} onSubmit={(event) => void addManager(event)}><input type="email" value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} placeholder="manager@email.gr" required /><button className={styles.button} type="submit">Grant role</button></form><div className={styles.stopList}>{data.managers.map((manager) => <div className={styles.stop} key={manager.id}><span className={styles.stopIndex}>M</span><div><strong>{manager.email}</strong><div className={styles.muted}>{manager.active ? "Active" : "Revoked"} · από {stamp(manager.createdAt)}</div></div>{manager.active && <button className={styles.buttonSecondary} type="button" onClick={() => void action("revoke_manager", { managerId: manager.id })}>Revoke</button>}</div>)}</div></article>
    </section>

    <section className={`${styles.grid} ${styles.two}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Red Button</div><h2>Αίτημα έκτακτης χειροκίνητης εξουσίας</h2><p className={styles.muted}>Δεν ενεργοποιείται με ένα κλικ. Απαιτούνται δύο διαφορετικοί άνθρωποι: Admin + Delivery Manager. Η έγκριση λήγει αυτόματα.</p><form className={styles.form} onSubmit={(event) => void requestRed(event)}><label className={styles.field}><span>Αιτιολογία</span><textarea value={redForm.reason} onChange={(event) => setRedForm({ ...redForm, reason: event.target.value })} minLength={8} required /></label><label className={styles.field}><span>Λήξη σε λεπτά</span><input type="number" min={5} max={120} value={redForm.expiresMinutes} onChange={(event) => setRedForm({ ...redForm, expiresMinutes: Number(event.target.value) })} /></label><button className={styles.button} type="submit">Create Red request</button></form></article>
      <article className={styles.card}><div className={styles.eyebrow}>Four-eyes approval</div><h2>Red Mode requests</h2><div className={styles.stopList}>{data.redRequests.length === 0 ? <div className={styles.empty}>Κανένα αίτημα.</div> : data.redRequests.map((request) => <div className={styles.stop} key={request.id}><span className={styles.stopIndex}>!</span><div><strong>{request.state.toUpperCase()} · {request.reason}</strong><div className={styles.muted}>expires {stamp(request.expiresAt)} · Admin: {request.adminApprover ?? "pending"} · Manager: {request.managerApprover ?? "pending"}</div></div>{request.state === "requested" && !request.adminApprover && <button className={styles.buttonSecondary} type="button" onClick={() => void action("approve_red_mode", { requestId: request.id })}>Admin approve</button>}</div>)}</div></article>
    </section>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Forecast & Next Best Action</div><h2>Capacity outlook</h2></div></div>{data.forecasts.length === 0 ? <div className={styles.empty}>Δεν έχουν παραχθεί ακόμη forecasts.</div> : <div className={`${styles.grid} ${styles.three}`}>{data.forecasts.slice(0, 9).map((forecast) => <article className={styles.card} key={forecast.id}><div className={styles.toolbar}><strong>{forecast.bucket.slice(0, 5)} · {forecast.zone}</strong><span className={styles.status}>{riskLabel(forecast.riskLevel)}</span></div><p>{number(forecast.expectedJobs)} jobs · {number(forecast.expectedPackages)} packages</p><p className={styles.muted}>{number(forecast.availableDrivers ?? 0)} driver equivalents · capacity {number(forecast.expectedCapacity ?? 0)} · confidence {forecast.confidence == null ? "—" : `${Math.round(forecast.confidence * 100)}%`}</p>{forecast.nextBestActions.map((item, index) => <div className={styles.notice} key={index}>{objectSummary(item)}</div>)}</article>)}</div>}</section>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Explainability</div><h2>Γιατί ανατέθηκε / απορρίφθηκε</h2></div></div>{data.decisions.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν ακόμη dispatch decisions.</div> : <div className={styles.grid}>{data.decisions.slice(0, 36).map((decision) => <article className={styles.card} key={decision.id}><div className={styles.toolbar}><span className={styles.badge}>{decision.decisionType}</span><strong>{decision.jobId ?? "fleet"} → {decision.driverName ?? decision.driverId ?? "—"}</strong><span className={styles.status}>{decision.chosen ? "CHOSEN" : decision.feasible ? "candidate" : "rejected"}{decision.score == null ? "" : ` · ${number(decision.score, 2)}`}</span></div>{decision.rejectionReasons.length > 0 && <p className={styles.muted}>Reject: {decision.rejectionReasons.join(" · ")}</p>}<p className={styles.muted}>Scoring: {objectSummary(decision.scoring)}</p><p className={styles.muted}>Reason: {objectSummary(decision.rationale)} · {stamp(decision.createdAt)}</p></article>)}</div>}</section>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Operations</div><h2>Delivery jobs</h2></div><button className={styles.buttonSecondary} type="button" onClick={() => void action("sync", {})}>Sync orders / returns</button></div>{data.jobs.length === 0 ? <div className={styles.empty}>Δεν υπάρχουν delivery jobs.</div> : <div className={styles.grid}>{data.jobs.map((job) => <article className={styles.card} key={job.id}><div className={styles.toolbar}><span className={styles.badge}>{job.type}</span><strong>{job.orderId}</strong><span className={styles.status}>{job.status}</span></div><div className={styles.progress}><span style={{ width: `${job.progress.total ? Math.round(job.progress.completed / job.progress.total * 100) : 0}%` }} /></div><div className={styles.formGrid}><label className={styles.field}><span>Manual audited override</span><select defaultValue={job.driverId ?? ""} onChange={(event) => { if (event.target.value) void action("assign_job", { jobId: job.id, driverId: event.target.value }); }}><option value="">Μη ανατεθειμένο</option>{activeDrivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name} · {driver.partnerName}</option>)}</select></label><div className={styles.field}><span>Customer tracking</span><div>{job.liveTracking ? "Ενεργό" : "Ανενεργό"}{job.latestLocation ? ` · sample ${stamp(job.latestLocation.receivedAt)}` : ""}</div></div></div><div className={styles.stopList}>{job.stops.map((stop) => <div className={`${styles.stop} ${stop.status === "completed" ? styles.stopDone : ""}`} key={stop.id}><span className={styles.stopIndex}>{stop.sequence}</span><div><strong>{stop.vendorName || stop.kind}</strong><div className={styles.muted}>{stop.kind}</div>{stop.completedAt && <small>{stamp(stop.completedAt)}</small>}</div><span className={styles.status}>{stop.status}</span></div>)}</div></article>)}</div>}</section>
  </div>;
}
