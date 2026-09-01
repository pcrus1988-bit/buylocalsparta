"use client";

import { useState, type FormEvent } from "react";
import type { DeliveryManagerReportingSnapshot, DeliveryShiftView } from "../lib/delivery-operations-reporting";
import styles from "./DeliveryOperations.module.css";

function stamp(value?: number) { return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short" }).format(value) : "—"; }
function duration(minutes: number) { const value=Math.max(0,Math.round(minutes)); const h=Math.floor(value/60),m=value%60; return h?`${h}ω ${m}λ`:`${m}λ`; }
function num(value?: number, digits=1) { return value==null?"—":new Intl.NumberFormat("el-GR",{maximumFractionDigits:digits}).format(value); }
function pct(value?: number) { return value==null?"—":`${Math.round(value*100)}%`; }
function localInput(value?: number) {
  if (!value) return "";
  const date=new Date(value); const pad=(v:number)=>String(v).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function typeLabel(value:string){return value==="return"?"Επιστροφή":"Παράδοση";}

type EditState = { shiftId:string; driverName:string; startedAt:string; endedAt:string; reason:string };

export function DeliveryManagerReportingClient({ initial, csrfToken }: { initial: DeliveryManagerReportingSnapshot; csrfToken:string }) {
  const [data,setData]=useState(initial);
  const [days,setDays]=useState(initial.rangeDays);
  const [driverFilter,setDriverFilter]=useState("all");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [edit,setEdit]=useState<EditState|null>(null);

  async function refresh(nextDays=days){
    setBusy(true);
    try{
      const response=await fetch(`/api/delivery/manage/reporting?days=${nextDays}`,{cache:"no-store"});
      const body=await response.json() as DeliveryManagerReportingSnapshot & {error?:string};
      if(!response.ok) throw new Error(body.error??"Η αναφορά δεν ήταν διαθέσιμη.");
      setData(body); setNotice("");
    }catch(error){setNotice(error instanceof Error?error.message:"Η αναφορά δεν ήταν διαθέσιμη.");}
    finally{setBusy(false);}
  }
  function beginEdit(shift:DeliveryShiftView){setEdit({shiftId:shift.id,driverName:shift.driverName??"Οδηγός",startedAt:localInput(shift.startedAt),endedAt:localInput(shift.endedAt),reason:""});}
  async function saveEdit(event:FormEvent){
    event.preventDefault(); if(!edit)return; setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/delivery/manage/reporting",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({action:"adjust_shift",shiftId:edit.shiftId,startedAt:edit.startedAt,endedAt:edit.endedAt,reason:edit.reason})});
      const body=await response.json() as {error?:string}; if(!response.ok)throw new Error(body.error??"Η διόρθωση απέτυχε.");
      setNotice("Η διόρθωση βάρδιας καταγράφηκε με audit trail."); setEdit(null); await refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Η διόρθωση απέτυχε.");}finally{setBusy(false);}
  }

  const filteredHistory=driverFilter==="all"?data.history:data.history.filter((job)=>job.driverId===driverFilter);
  const filteredShifts=driverFilter==="all"?data.recentShifts:data.recentShifts.filter((shift)=>shift.driverId===driverFilter);
  const filteredExceptions=driverFilter==="all"?data.exceptions:data.exceptions.filter((job)=>job.driverId===driverFilter);

  return <section className={styles.grid}>
    <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Operations reporting</div><h2>Timekeeping, απόδοση & ιστορικό</h2></div><div className={styles.toolbar}>
      <label className={styles.field}><span>Περίοδος</span><select value={days} onChange={(event)=>{const next=Number(event.target.value);setDays(next);void refresh(next);}}><option value={7}>7 ημέρες</option><option value={30}>30 ημέρες</option><option value={90}>90 ημέρες</option></select></label>
      <label className={styles.field}><span>Οδηγός</span><select value={driverFilter} onChange={(event)=>setDriverFilter(event.target.value)}><option value="all">Όλοι</option>{data.drivers.map((driver)=><option key={driver.driverId} value={driver.driverId}>{driver.driverName}</option>)}</select></label>
      <button className={styles.buttonSecondary} disabled={busy} type="button" onClick={()=>void refresh()}>Refresh</button>
    </div></div>
    {notice&&<div className={styles.notice}>{notice}</div>}

    <div className={`${styles.grid} ${styles.three}`}>
      <article className={styles.card}><div className={styles.eyebrow}>Ώρες στόλου · {data.rangeDays}d</div><h2>{duration(data.totals.workedMinutes)}</h2><p className={styles.muted}>{data.totals.completed} ολοκληρωμένες · {data.totals.assigned} αναθέσεις</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>SLA / productivity</div><h2>{pct(data.totals.onTimeRate)}</h2><p className={styles.muted}>{num(data.totals.deliveriesPerHour,2)} deliveries/ώρα · μ.ό. {num(data.totals.averageDeliveryMinutes,0)} λεπτά</p></article>
      <article className={styles.card}><div className={styles.eyebrow}>Exceptions</div><h2>{data.totals.overdueOpenJobs+data.totals.failed}</h2><p className={styles.muted}>{data.totals.overdueOpenJobs} overdue ανοικτές · {data.totals.failed} failed</p></article>
    </div>

    <article className={styles.card}><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Reports</div><h2>Εξαγωγές</h2></div><div className={styles.toolbar}><button className={styles.buttonSecondary} type="button" onClick={()=>{window.location.href=`/api/delivery/manage/reporting?format=csv&dataset=deliveries&days=${days}`;}}>CSV παραδόσεων</button><button className={styles.buttonSecondary} type="button" onClick={()=>{window.location.href=`/api/delivery/manage/reporting?format=csv&dataset=timekeeping&days=${days}`;}}>CSV βαρδιών</button><button className={styles.buttonSecondary} type="button" onClick={()=>window.print()}>Εκτύπωση</button></div></div><p className={styles.muted}>Οι εξαγωγές χρησιμοποιούν τα πραγματικά delivery jobs/stops και το νέο timekeeping ledger. Δεν δημιουργείται δεύτερη πηγή δεδομένων.</p></article>

    <section><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Driver statistics</div><h2>Απόδοση ανά οδηγό</h2></div></div><div className={`${styles.grid} ${styles.two}`}>{data.drivers.map((driver)=><article className={styles.card} key={driver.driverId}><div className={styles.toolbar}><strong>{driver.driverName}</strong><span className={styles.status}>{duration(driver.workedMinutes)}</span></div><p className={styles.muted}>{driver.partnerName}</p><div className={styles.toolbar}><span className={styles.badge}>{driver.completed} completed</span><span className={styles.badge}>{pct(driver.onTimeRate)} on-time</span><span className={styles.badge}>{num(driver.deliveriesPerHour,2)}/h</span><span className={styles.badge}>{num(driver.actualDistanceKm)} km</span></div><p className={styles.muted}>{driver.completedStops} stops · {driver.failed} failed · {driver.farJobs} far · {driver.difficultJobs} difficult · μ.ό. {num(driver.averageDeliveryMinutes,0)} λεπτά/job</p></article>)}</div></section>

    <article className={styles.card}><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Exception desk</div><h2>Καθυστερήσεις & αποτυχίες</h2></div></div><div className={styles.stopList}>{filteredExceptions.length===0?<div className={styles.empty}>Δεν υπάρχουν exceptions στην επιλεγμένη περίοδο.</div>:filteredExceptions.slice(0,60).map((job)=><div className={styles.stop} key={job.id}><span className={styles.stopIndex}>!</span><div><strong>{job.orderId} · {job.driverName??"χωρίς οδηγό"}</strong><div className={styles.muted}>{typeLabel(job.type)} · {job.status} · {job.late?"εκτός SLA":"failed"} · promised {stamp(job.promisedBy)} · completed {stamp(job.completedAt)}</div></div></div>)}</div></article>

    <article className={styles.card}><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Timesheets</div><h2>Ιστορικό βαρδιών</h2></div></div><div className={styles.stopList}>{filteredShifts.length===0?<div className={styles.empty}>Δεν υπάρχουν βάρδιες.</div>:filteredShifts.map((shift)=><div className={styles.stop} key={shift.id}><span className={styles.stopIndex}>⏱</span><div><strong>{shift.driverName} · {stamp(shift.startedAt)} → {shift.endedAt?stamp(shift.endedAt):"OPEN"}</strong><div className={styles.muted}>Καθαρά {duration(shift.netMinutes)} · breaks {duration(shift.breakMinutes)}{shift.adjusted?" · ADJUSTED":""}</div></div><button className={styles.buttonSecondary} type="button" onClick={()=>beginEdit(shift)}>Διόρθωση</button></div>)}</div></article>

    {edit&&<article className={styles.card}><div className={styles.eyebrow}>Audited correction</div><h2>Διόρθωση βάρδιας · {edit.driverName}</h2><form className={styles.form} onSubmit={(event)=>void saveEdit(event)}><label className={styles.field}><span>Έναρξη</span><input type="datetime-local" required value={edit.startedAt} onChange={(event)=>setEdit({...edit,startedAt:event.target.value})}/></label><label className={styles.field}><span>Λήξη (κενό = ανοικτή)</span><input type="datetime-local" value={edit.endedAt} onChange={(event)=>setEdit({...edit,endedAt:event.target.value})}/></label><label className={styles.field}><span>Αιτιολογία</span><textarea required minLength={8} value={edit.reason} onChange={(event)=>setEdit({...edit,reason:event.target.value})}/></label><div className={styles.toolbar}><button className={styles.button} disabled={busy} type="submit">Αποθήκευση με audit</button><button className={styles.buttonSecondary} type="button" onClick={()=>setEdit(null)}>Άκυρο</button></div></form></article>}

    <article className={styles.card}><div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Delivery history</div><h2>Ιστορικό παραδόσεων / επιστροφών</h2></div></div><div className={styles.stopList}>{filteredHistory.length===0?<div className={styles.empty}>Δεν υπάρχουν εργασίες.</div>:filteredHistory.slice(0,120).map((job)=><div className={styles.stop} key={job.id}><span className={styles.stopIndex}>{job.late?"!":"✓"}</span><div><strong>{job.orderId} · {job.driverName??"χωρίς οδηγό"}</strong><div className={styles.muted}>{typeLabel(job.type)} · {job.status} · {job.completedStops}/{job.totalStops} stops · {job.packageCount} packages · {job.completedAt?stamp(job.completedAt):job.startedAt?`started ${stamp(job.startedAt)}`:"not started"}{job.late?" · SLA BREACH":""}</div></div></div>)}</div></article>
  </section>;
}
