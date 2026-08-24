"use client";

import QRCode from "react-qr-code";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeliveryJobView } from "../lib/delivery-driver-runtime";
import { QrScannerOverlay } from "./QrScannerOverlay";
import styles from "./DeliveryOperations.module.css";

type DriverState = Readonly<{
  operationalStatus: string;
  acceptingJobs: boolean;
  shiftStartedAt?: number;
  shiftEndsAt?: number;
  latestLocation?: Readonly<{ latitude:number; longitude:number; accuracy?:number; heading?:number; speed?:number; receivedAt:number }>;
}>;

type Workspace = Readonly<{
  csrfToken: string;
  assigned: readonly DeliveryJobView[];
  available: readonly DeliveryJobView[];
  driver: DriverState;
}>;

const DECLINE_REASONS = [
  ["vehicle_issue", "Πρόβλημα οχήματος"],
  ["capacity_issue", "Ανεπαρκής χωρητικότητα"],
  ["safety_issue", "Θέμα ασφάλειας"],
  ["personal_emergency", "Προσωπικό επείγον"],
  ["inaccessible_shop", "Μη προσβάσιμο κατάστημα"],
  ["bad_parcel_data", "Λανθασμένα στοιχεία δέματος"],
] as const;

function addressText(address: Record<string, unknown>): string {
  return [address.line1,address.line2,address.locality,address.postcode]
    .filter((item)=>typeof item==="string"&&item.trim())
    .join(", ");
}
function stamp(value?: number) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "medium" }).format(value) : "";
}

export function DeliveryDriverWorkspaceClient({ initial }: { initial: Workspace }) {
  const [workspace,setWorkspace]=useState(initial);
  const [scanner,setScanner]=useState(false);
  const [manual,setManual]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [declineReasons,setDeclineReasons]=useState<Record<string,string>>({});
  const watchRef=useRef<number|null>(null);
  const trackingKeyRef=useRef<string|null>(null);
  const lastPresenceSentRef=useRef(0);

  const refresh=useCallback(async()=>{
    const response=await fetch("/api/driver/operations",{cache:"no-store"});
    if(response.ok)setWorkspace(await response.json() as Workspace);
  },[]);

  async function action(name:string,payload:Record<string,unknown>){
    setBusy(`${name}:${String(payload.jobId??payload.availability??"")}`);
    setNotice("");
    try{
      const response=await fetch("/api/driver/operations",{
        method:"POST",
        headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},
        body:JSON.stringify({action:name,...payload}),
      });
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error??"Η ενέργεια απέτυχε.");
      await refresh();
      return true;
    }catch(error){
      setNotice(error instanceof Error?error.message:"Η ενέργεια απέτυχε.");
      return false;
    }finally{setBusy("");}
  }

  const stopWatch=useCallback(()=>{
    if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current=null;
    trackingKeyRef.current=null;
    lastPresenceSentRef.current=0;
  },[]);

  const startWatch=useCallback((jobId?:string)=>{
    if(!navigator.geolocation){setNotice("Η συσκευή δεν υποστηρίζει GPS.");return;}
    const trackingKey=jobId??"presence";
    if(watchRef.current!==null&&trackingKeyRef.current===trackingKey)return;
    stopWatch();
    trackingKeyRef.current=trackingKey;
    watchRef.current=navigator.geolocation.watchPosition((position)=>{
      if(position.timestamp-lastPresenceSentRef.current<10_000)return;
      lastPresenceSentRef.current=position.timestamp;
      void fetch("/api/driver/location",{
        method:"POST",
        headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},
        body:JSON.stringify({
          ...(jobId?{jobId}:{}),
          latitude:position.coords.latitude,
          longitude:position.coords.longitude,
          accuracy:position.coords.accuracy,
          heading:position.coords.heading,
          speed:position.coords.speed,
          deviceRecordedAt:position.timestamp,
        }),
      });
    },(error)=>setNotice(`GPS: ${error.message}`),{enableHighAccuracy:true,maximumAge:8000,timeout:20000});
  },[stopWatch,workspace.csrfToken]);

  useEffect(()=>{
    const live=workspace.assigned.find((job)=>job.liveTracking);
    if(workspace.driver.acceptingJobs)startWatch(live?.id);
    else stopWatch();
    return()=>stopWatch();
  },[workspace.assigned,workspace.driver.acceptingJobs,startWatch,stopWatch]);

  async function toggleTracking(job:DeliveryJobView){
    const enabled=!job.liveTracking;
    const ok=await action("tracking",{jobId:job.id,enabled});
    if(ok&&enabled)startWatch(job.id);
  }
  async function scan(value:string){
    setScanner(false);
    setManual(value);
    const ok=await action("scan",{token:value});
    if(ok){setNotice("Το QR επιβεβαιώθηκε.");setManual("");}
  }

  const shiftActive=workspace.driver.acceptingJobs;
  return <div className={styles.grid}>
    {notice&&<div className={styles.notice}>{notice}</div>}

    <section className={styles.card}>
      <div className={styles.sectionTitle}>
        <div><div className={styles.eyebrow}>Shift & GPS presence</div><h2>Κατάσταση οδηγού</h2></div>
        <span className={styles.status}>{workspace.driver.operationalStatus}</span>
      </div>
      <p className={styles.muted}>{shiftActive?"Ο dispatcher μπορεί να χρησιμοποιεί την τρέχουσα θέση σου για νέες αναθέσεις. Η ακριβής θέση δεν εμφανίζεται αυτόματα στους πελάτες.":"Εκτός ενεργής βάρδιας ο dispatcher δεν σου αναθέτει νέες εργασίες."}</p>
      {workspace.driver.latestLocation&&<div className={styles.location}><span>Τελευταίο GPS · {stamp(workspace.driver.latestLocation.receivedAt)}</span><span>±{Math.round(workspace.driver.latestLocation.accuracy??0)}m</span></div>}
      <div className={styles.toolbar}>
        <button className={styles.button} type="button" disabled={Boolean(busy)||shiftActive} onClick={()=>void action("availability",{availability:"available"})}>Έναρξη / συνέχιση βάρδιας</button>
        <button className={styles.buttonSecondary} type="button" disabled={Boolean(busy)||!shiftActive} onClick={()=>void action("availability",{availability:"paused"})}>Παύση</button>
        <button className={styles.buttonSecondary} type="button" disabled={Boolean(busy)||workspace.driver.operationalStatus==="off_shift"} onClick={()=>void action("availability",{availability:"off_shift"})}>Λήξη βάρδιας</button>
      </div>
    </section>

    <section>
      <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Assigned</div><h2>Οι εργασίες μου</h2></div><button className={styles.buttonSecondary} type="button" onClick={()=>void refresh()}>Ανανέωση</button></div>
      {workspace.assigned.length===0?<div className={styles.empty}>Δεν έχεις ανατεθειμένες εργασίες.</div>:<div className={`${styles.grid} ${styles.two}`}>{workspace.assigned.map((job)=><article className={styles.card} key={job.id}>
        <div className={styles.toolbar}><span className={styles.badge}>{job.type==="outbound"?"Παράδοση":"Επιστροφή"}</span><strong>{job.orderId}</strong><span className={styles.status}>{job.status}</span></div>
        <div className={styles.progress}><span style={{width:`${job.progress.total?Math.round(job.progress.completed/job.progress.total*100):0}%`}}/></div><p className={styles.muted}>{job.progress.completed}/{job.progress.total} σημεία ολοκληρώθηκαν.</p>
        {job.pickupQr&&<div className={styles.qrWrap}><strong>Κοινό QR παραλαβής</strong><QRCode value={job.pickupQr} size={220}/><span className={styles.muted}>Δείξε το ίδιο QR σε κάθε κατάστημα. Κάθε κατάστημα ολοκληρώνει μόνο το δικό του σημείο.</span></div>}
        <div className={styles.stopList}>{job.stops.map((stop)=><div className={`${styles.stop} ${stop.status==="completed"?styles.stopDone:""}`} key={stop.id}><span className={styles.stopIndex}>{stop.sequence}</span><div><strong>{stop.vendorName||(stop.kind==="customer_dropoff"?"Πελάτης · παράδοση":stop.kind==="customer_return_pickup"?"Πελάτης · παραλαβή επιστροφής":"Σημείο")}</strong><div className={styles.muted}>{addressText(stop.address)||(stop.kind.startsWith("customer")?"Διεύθυνση πελάτη":"")}</div>{stop.completedAt&&<small>Ολοκληρώθηκε {stamp(stop.completedAt)}</small>}</div><span className={styles.status}>{stop.status}{stop.sourceStatus?` · ${stop.sourceStatus}`:""}</span></div>)}</div>
        <div className={styles.toolbar}><button className={styles.button} type="button" onClick={()=>setScanner(true)}>Σάρωση επιβεβαίωσης</button><button className={styles.buttonSecondary} type="button" onClick={()=>void toggleTracking(job)} disabled={busy===`tracking:${job.id}`}>{job.liveTracking?"Διακοπή customer live tracking":"Έναρξη customer live tracking"}</button></div>
        {job.latestLocation&&<div className={styles.location}><span>Τελευταίο job sample · {stamp(job.latestLocation.receivedAt)}</span><span>±{Math.round(job.latestLocation.accuracy??0)}m</span></div>}
      </article>)}</div>}
    </section>

    <section>
      <div className={styles.sectionTitle}><div><div className={styles.eyebrow}>Dispatcher</div><h2>Προτάσεις ανάθεσης</h2></div></div>
      {workspace.available.length===0?<div className={styles.empty}>{shiftActive?"Δεν υπάρχει ενεργή πρόταση ανάθεσης. Ο dispatcher αξιολογεί αυτόματα νέες εργασίες και τις τρέχουσες διαδρομές.":"Ξεκίνα τη βάρδια για να μπορεί ο dispatcher να σε συμπεριλάβει στις αναθέσεις."}</div>:<div className={`${styles.grid} ${styles.three}`}>{workspace.available.map((job)=><article className={styles.card} key={job.id}>
        <span className={styles.badge}>{job.type==="outbound"?"Παράδοση":"Επιστροφή"}</span><h3>{job.orderId}</h3>
        <p className={styles.muted}>{job.stops.length} σημεία · η πρόταση δημιουργήθηκε από τον αυτόματο dispatcher. Οι διευθύνσεις πελατών εμφανίζονται μετά την αποδοχή.</p>
        <div className={styles.grid}><button className={styles.button} type="button" disabled={Boolean(busy)} onClick={()=>void action("accept_offer",{jobId:job.id})}>Αποδοχή ανάθεσης</button><select value={declineReasons[job.id]??""} onChange={(event)=>setDeclineReasons((current)=>({...current,[job.id]:event.target.value}))}><option value="">Λόγος απόρριψης…</option>{DECLINE_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className={styles.buttonSecondary} type="button" disabled={Boolean(busy)||!(declineReasons[job.id]??"")} onClick={()=>void action("decline_offer",{jobId:job.id,reason:declineReasons[job.id]})}>Απόρριψη & επανεκτίμηση</button></div>
      </article>)}</div>}
    </section>

    <section className={styles.card}><h3>Χειροκίνητη επιβεβαίωση QR</h3><div className={styles.manual}><input value={manual} onChange={(event)=>setManual(event.target.value)} placeholder="Επικόλλησε τον κωδικό QR"/><button className={styles.button} type="button" onClick={()=>void scan(manual)} disabled={!manual.trim()}>Επιβεβαίωση</button></div></section>
    {scanner&&<QrScannerOverlay onScan={(value)=>void scan(value)} onClose={()=>setScanner(false)}/>} 
  </div>;
}
