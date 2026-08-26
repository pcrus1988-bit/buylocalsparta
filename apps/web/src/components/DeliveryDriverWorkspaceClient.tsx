"use client";

import QRCode from "react-qr-code";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryJobView } from "../lib/delivery-driver-runtime";
import type { DeliveryDriverMobileMeta } from "../lib/delivery-driver-mobile-runtime";
import { QrScannerOverlay } from "./QrScannerOverlay";
import styles from "./DeliveryDriverApp.module.css";

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
  meta: DeliveryDriverMobileMeta;
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
  return value ? new Intl.DateTimeFormat("el-GR", { hour:"2-digit", minute:"2-digit" }).format(value) : "—";
}
function todayText() {
  return new Intl.DateTimeFormat("el-GR", { timeZone:"Europe/Athens", weekday:"long", day:"numeric", month:"long" }).format(new Date());
}
function done(status:string) { return ["completed","skipped","failed"].includes(status); }
function stopTitle(stop: DeliveryJobView["stops"][number]) {
  return stop.vendorName || (stop.kind === "customer_dropoff" ? "Πελάτης · παράδοση" : stop.kind === "customer_return_pickup" ? "Πελάτης · παραλαβή επιστροφής" : stop.kind === "vendor_return_dropoff" ? "Κατάστημα · επιστροφή" : "Σημείο παραλαβής");
}
function customerLegState(job: DeliveryJobView) {
  const vendorPickups = job.stops.filter((stop) => stop.kind === "vendor_pickup");
  const vendorPickupsComplete = vendorPickups.length > 0 && vendorPickups.every((stop) => stop.status === "completed");
  const customerDropoff = job.stops.find((stop) => stop.kind === "customer_dropoff" && !done(stop.status));
  return {
    vendorPickupsComplete,
    customerDropoff,
    canStart: job.type === "outbound" && vendorPickupsComplete && customerDropoff?.status === "pending",
    active: job.type === "outbound" && customerDropoff?.status === "ready",
  };
}
function mapsUrl(address:string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function DeliveryDriverWorkspaceClient({ initial, driverName, partnerName }: { initial: Workspace; driverName: string; partnerName: string }) {
  const [workspace,setWorkspace]=useState(initial);
  const [scanner,setScanner]=useState(false);
  const [manual,setManual]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [menuOpen,setMenuOpen]=useState(false);
  const [guideExpanded,setGuideExpanded]=useState(false);
  const [declineOpen,setDeclineOpen]=useState(false);
  const [declineReasons,setDeclineReasons]=useState<Record<string,string>>({});
  const [selectedJobId,setSelectedJobId]=useState<string|null>(null);
  const watchRef=useRef<number|null>(null);
  const trackingKeyRef=useRef<string|null>(null);
  const lastPresenceSentRef=useRef(0);

  const refresh=useCallback(async()=>{
    const response=await fetch("/api/driver/operations",{cache:"no-store"});
    if(response.ok)setWorkspace(await response.json() as Workspace);
  },[]);

  async function action(name:string,payload:Record<string,unknown>={}){
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
      if(position.timestamp-lastPresenceSentRef.current<5_000)return;
      lastPresenceSentRef.current=position.timestamp;
      const latestLocation={
        latitude:position.coords.latitude,
        longitude:position.coords.longitude,
        accuracy:position.coords.accuracy,
        heading:position.coords.heading??undefined,
        speed:position.coords.speed??undefined,
        receivedAt:Date.now(),
      };
      setWorkspace((current)=>({...current,driver:{...current.driver,latestLocation}}));
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
    },(error)=>setNotice(`GPS: ${error.message}`),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  },[stopWatch,workspace.csrfToken]);

  useEffect(()=>{
    const live=workspace.assigned.find((job)=>job.liveTracking);
    if(workspace.driver.acceptingJobs)startWatch(live?.id);
    else stopWatch();
    return()=>stopWatch();
  },[workspace.assigned,workspace.driver.acceptingJobs,startWatch,stopWatch]);

  useEffect(()=>{
    const timer=window.setInterval(()=>void refresh(),10_000);
    return()=>window.clearInterval(timer);
  },[refresh]);

  const shiftActive=workspace.driver.acceptingJobs;
  const activeJobs=useMemo(()=>workspace.assigned.filter((job)=>["in_progress","assigned"].includes(job.status)),[workspace.assigned]);
  const activeJob=activeJobs[0];
  const nextStop=activeJob?.stops.find((stop)=>!done(stop.status));
  const activeLeg=activeJob?customerLegState(activeJob):undefined;
  const offer=workspace.available[0];
  const selectedJob=selectedJobId?workspace.assigned.find((job)=>job.id===selectedJobId):undefined;
  const selectedLeg=selectedJob?customerLegState(selectedJob):undefined;
  const upcomingStops=activeJob?.stops.filter((stop)=>!done(stop.status)).slice(0,4)??[];
  const orderLabel=(job:DeliveryJobView)=>workspace.meta.orderNumbers[job.id]??job.orderId;
  const progressPercent=activeJob?.progress.total?Math.round(activeJob.progress.completed/activeJob.progress.total*100):0;

  async function startCustomerLeg(job:DeliveryJobView){
    if(await action("start_customer_leg",{jobId:job.id})){
      setSelectedJobId(null);
      setGuideExpanded(false);
      setNotice("Final leg ενεργό · ο πελάτης βλέπει πλέον live tracking και QR επιβεβαίωσης.");
      startWatch(job.id);
    }
  }
  async function scan(value:string){
    const token=value.trim();
    if(!token)return;
    setScanner(false);
    if(await action("scan",{token})){
      setNotice("Το QR επιβεβαιώθηκε.");
      setManual("");
      setGuideExpanded(false);
    }
  }
  async function acceptOffer(job:DeliveryJobView){
    if(await action("accept_offer",{jobId:job.id})){
      setDeclineOpen(false);
      setGuideExpanded(false);
      setNotice("Η εργασία έγινε αποδεκτή. Ακολούθησε το επόμενο σημείο.");
    }
  }
  async function declineOffer(job:DeliveryJobView){
    const reason=declineReasons[job.id]??"";
    if(!reason)return;
    if(await action("decline_offer",{jobId:job.id,reason})){
      setDeclineOpen(false);
      setNotice("Η απόρριψη καταγράφηκε και ο dispatcher επανεκτιμά την εργασία.");
    }
  }
  async function clockIn(){
    if(await action("clock_in"))setNotice("Καλή βάρδια. Είσαι online και διαθέσιμος για αναθέσεις.");
  }
  function closeApp(){
    window.close();
    window.setTimeout(()=>{
      if(!document.hidden)window.location.replace("/");
    },180);
  }

  const desktopBlocker=<div className={styles.desktopBlocker}><div className={styles.desktopMessage}><div><strong>Driver app · μόνο για κινητό</strong><p>Η εφαρμογή οδηγού είναι σχεδιασμένη αποκλειστικά για χρήση εν κινήσει σε κινητό. Άνοιξε το /driver από το τηλέφωνό σου ή από το εγκατεστημένο PWA.</p></div></div></div>;

  if(!workspace.meta.clockedInToday){
    return <>{desktopBlocker}<div className={styles.mobileApp}><section className={styles.welcome}>
      <div className={styles.welcomeBrand}>KONTA MOY · DRIVER</div>
      <div className={styles.welcomeCenter}>
        <div className={styles.welcomeDate}>{todayText()}</div>
        <h1>Καλή βάρδια, {driverName}.</h1>
        <p>{partnerName}. Με το clock in ενεργοποιούνται η παρουσία GPS και οι αυτόματες προτάσεις του dispatcher.</p>
        {notice&&<div className={styles.notice}>{notice}</div>}
        <div className={styles.welcomeActions}>
          <button className={styles.welcomePrimary} type="button" disabled={Boolean(busy)} onClick={()=>void clockIn()}>{busy?"Σύνδεση…":"Clock in · Έναρξη βάρδιας"}</button>
          <button className={styles.welcomeSecondary} type="button" onClick={closeApp}>Κλείσιμο εφαρμογής</button>
        </div>
        <p className={styles.welcomeNote}>Το μήνυμα αυτό εμφανίζεται μόνο μέχρι το πρώτο clock in της ημέρας.</p>
      </div>
    </section></div></>;
  }

  const needsFinalLeg=Boolean(activeJob&&activeLeg?.canStart&&nextStop?.kind==="customer_dropoff");
  const showPickupQr=Boolean(activeJob&&nextStop?.kind==="vendor_pickup"&&activeJob.pickupQr);
  const canScanNext=Boolean(activeJob&&nextStop&&!showPickupQr&&(!needsFinalLeg)&&(activeJob.type!=="outbound"||activeLeg?.active));
  const nextAddress=nextStop?addressText(nextStop.address):"";

  return <>{desktopBlocker}<div className={styles.mobileApp}>
    <header className={styles.topBar}>
      <div className={styles.brand}><div className={styles.brandMark}>ΚΜ</div><span className={`${styles.statusDot} ${shiftActive?styles.statusDotActive:""}`}/><div className={styles.brandText}><strong>{driverName}</strong><span>{shiftActive?"Online · dispatcher ενεργός":workspace.driver.operationalStatus==="paused"?"Βάρδια σε παύση":"Εκτός βάρδιας"}</span></div></div>
      <button className={styles.menuButton} type="button" aria-label="Μενού οδηγού" onClick={()=>setMenuOpen(true)}>☰</button>
    </header>

    {activeJobs.length>0&&<div className={styles.floatingOrders} aria-label="Ενεργές παραγγελίες">{activeJobs.map((job)=>{
      const leg=customerLegState(job);
      return <button className={`${styles.orderChip} ${leg.canStart?styles.orderChipReady:""}`} key={job.id} type="button" onClick={()=>setSelectedJobId(job.id)}>{orderLabel(job)}</button>;
    })}</div>}

    <main className={styles.content}>
      {notice&&<div className={styles.notice}>{notice}</div>}
      {activeJob?<>
        <section className={styles.heroCard}>
          <div className={styles.heroEyebrow}>{activeJob.type==="outbound"?"Ενεργή παράδοση":"Ενεργή επιστροφή"}</div>
          <h1 className={styles.heroTitle}>{orderLabel(activeJob)}</h1>
          <div className={styles.heroMeta}>{nextStop?`Επόμενο · ${stopTitle(nextStop)}`:"Η διαδρομή ολοκληρώνεται"}</div>
          <div className={styles.heroProgress}><span style={{width:`${progressPercent}%`}}/></div>
          <div className={styles.heroFooter}><span>{activeJob.progress.completed}/{activeJob.progress.total} σημεία</span><span>GPS {workspace.driver.latestLocation?`±${Math.round(workspace.driver.latestLocation.accuracy??0)}m`:"αναμονή"}</span></div>
        </section>
        {upcomingStops.length>0&&<section className={styles.routeCard}><div className={styles.sectionLabel}>Η συνέχεια</div><h2>Επόμενα σημεία</h2><div className={styles.timeline}>{upcomingStops.map((stop,index)=><div className={styles.timelineRow} key={stop.id}><span className={styles.timelineIndex}>{index+1}</span><div className={styles.timelineText}><strong>{stopTitle(stop)}</strong><span>{addressText(stop.address)||"Η διεύθυνση εμφανίζεται όταν επιτρέπεται από τη ροή."}</span></div><span className={styles.timelineStatus}>{stop.status}</span></div>)}</div></section>}
      </>:<section className={styles.emptyState}><div><div className={styles.emptyIcon}>✓</div><h2>{shiftActive?"Είσαι διαθέσιμος":"Η βάρδια είναι σε παύση"}</h2><p>{shiftActive?"Δεν υπάρχει ενεργή εργασία. Μείνε online — ο dispatcher θα εμφανίσει την επόμενη πρόταση στο κάτω πεδίο μόλις υπάρξει.":"Άνοιξε το μενού ή χρησιμοποίησε το κάτω πεδίο για να επιστρέψεις online."}</p></div></section>}
    </main>

    <section className={`${styles.guide} ${offer?styles.guideOffer:""}`} aria-live="polite">
      {offer?<>
        <div className={styles.guideSummary}><div><span className={styles.guideKicker}>Νέα πρόταση dispatcher</span><strong className={styles.guideMain}>{orderLabel(offer)}</strong><span className={styles.guideAddress}>{offer.stops.length} σημεία · απαιτείται απάντηση</span></div><span className={styles.guideChevron}>!</span></div>
        <div className={styles.guideExpanded}>
          <div className={styles.scanHint}>Οι διευθύνσεις πελάτη παραμένουν κρυφές μέχρι να αποδεχτείς την εργασία.</div>
          {declineOpen&&<select className={styles.select} value={declineReasons[offer.id]??""} onChange={(event)=>setDeclineReasons((current)=>({...current,[offer.id]:event.target.value}))}><option value="">Επίλεξε υποχρεωτικά λόγο απόρριψης…</option>{DECLINE_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}
          <div className={styles.guideActions}>
            <button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={()=>void acceptOffer(offer)}>Αποδοχή task</button>
            {!declineOpen?<button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={()=>setDeclineOpen(true)}>Απόρριψη</button>:<button className={styles.danger} type="button" disabled={Boolean(busy)||!(declineReasons[offer.id]??"")} onClick={()=>void declineOffer(offer)}>Επιβεβαίωση απόρριψης</button>}
          </div>
        </div>
      </>:!shiftActive?<div className={styles.guideExpanded}><span className={styles.guideKicker}>Κατάσταση βάρδιας</span><strong className={styles.guideMain}>{workspace.driver.operationalStatus==="paused"?"Σε παύση":"Εκτός βάρδιας"}</strong><div className={styles.guideActions}><button className={`${styles.primary} ${styles.full}`} type="button" disabled={Boolean(busy)} onClick={()=>void action("availability",{availability:"available"})}>Επιστροφή online</button></div></div>:activeJob&&nextStop?<>
        <button className={styles.guideSummary} type="button" onClick={()=>setGuideExpanded((value)=>!value)}><div><span className={styles.guideKicker}>{needsFinalLeg?"Απαιτείται Final leg":"Επόμενος προορισμός"}</span><strong className={styles.guideMain}>{stopTitle(nextStop)}</strong><span className={styles.guideAddress}>{nextAddress||orderLabel(activeJob)}</span></div><span className={styles.guideChevron}>{guideExpanded?"⌄":"⌃"}</span></button>
        {guideExpanded&&<div className={styles.guideExpanded}>
          {nextAddress&&<a className={styles.mapsLink} href={mapsUrl(nextAddress)} target="_blank" rel="noreferrer">Άνοιγμα πλοήγησης</a>}
          {needsFinalLeg&&<div className={styles.scanHint}>Οι παραλαβές ολοκληρώθηκαν. Πάτησε το floating <strong>{orderLabel(activeJob)}</strong> και επιβεβαίωσε «Final leg» πριν φύγεις προς τον πελάτη.</div>}
          {showPickupQr&&activeJob.pickupQr&&<div className={styles.qrPanel}><strong>QR παραλαβής · {orderLabel(activeJob)}</strong><QRCode value={activeJob.pickupQr} size={230}/><span>Δείξε αυτό το QR στο κατάστημα. Το κατάστημα σαρώνει και ολοκληρώνει μόνο το δικό του pickup stop.</span></div>}
          {canScanNext&&<><div className={styles.scanHint}>Στο σημείο προορισμού άνοιξε τον scanner και σκάναρε το QR επιβεβαίωσης που σου παρουσιάζεται.</div><div className={styles.guideActions}><button className={`${styles.primary} ${styles.full}`} type="button" onClick={()=>setScanner(true)} disabled={Boolean(busy)}>Σάρωση QR</button></div><div className={styles.manual}><input value={manual} onChange={(event)=>setManual(event.target.value)} placeholder="Χειροκίνητος κωδικός QR"/><button className={styles.secondary} type="button" onClick={()=>void scan(manual)} disabled={!manual.trim()}>OK</button></div></>}
        </div>}
      </>:<div className={styles.guideSummary}><div><span className={styles.guideKicker}>Dispatcher</span><strong className={styles.guideMain}>Αναμονή επόμενης εργασίας</strong><span className={styles.guideAddress}>GPS {workspace.driver.latestLocation?`ενεργό · ${stamp(workspace.driver.latestLocation.receivedAt)}`:"αναμονή πρώτης θέσης"}</span></div><span className={styles.guideChevron}>✓</span></div>}
    </section>

    {menuOpen&&<div className={styles.drawerShade} role="presentation" onClick={()=>setMenuOpen(false)}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Μενού οδηγού" onClick={(event)=>event.stopPropagation()}>
      <div className={styles.drawerHeader}><div><div className={styles.sectionLabel}>KONTA MOY DRIVER</div><h2>{driverName}</h2><p>{partnerName}</p></div><button className={styles.closeButton} type="button" onClick={()=>setMenuOpen(false)}>×</button></div>
      <div className={styles.drawerBlock}><div className={styles.drawerMetric}><span>Κατάσταση</span><strong>{workspace.driver.operationalStatus}</strong></div><div className={styles.drawerMetric}><span>Clock in</span><strong>{stamp(workspace.driver.shiftStartedAt)}</strong></div><div className={styles.drawerMetric}><span>GPS</span><strong>{workspace.driver.latestLocation?`±${Math.round(workspace.driver.latestLocation.accuracy??0)}m`:"—"}</strong></div><div className={styles.drawerMetric}><span>Ενεργές εργασίες</span><strong>{activeJobs.length}</strong></div></div>
      <div className={styles.drawerActions}>
        {!shiftActive&&<button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={()=>void action("availability",{availability:"available"}).then(()=>setMenuOpen(false))}>Επιστροφή online</button>}
        {shiftActive&&<button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={()=>void action("availability",{availability:"paused"}).then(()=>setMenuOpen(false))}>Παύση βάρδιας</button>}
        <button className={styles.secondary} type="button" disabled={Boolean(busy)||workspace.driver.operationalStatus==="off_shift"} onClick={()=>void action("availability",{availability:"off_shift"}).then(()=>setMenuOpen(false))}>Λήξη βάρδιας</button>
        <button className={styles.secondary} type="button" onClick={()=>void refresh().then(()=>setMenuOpen(false))}>Ανανέωση</button>
        <form method="post" action="/api/driver/logout"><button className={styles.danger} style={{width:"100%"}} type="submit">Αποσύνδεση</button></form>
      </div>
    </aside></div>}

    {selectedJob&&selectedLeg&&<div className={styles.modalShade} role="presentation" onClick={()=>setSelectedJobId(null)}><section className={styles.modal} role="dialog" aria-modal="true" aria-label="Final leg confirmation" onClick={(event)=>event.stopPropagation()}>
      <div className={styles.modalKicker}>Final leg · {orderLabel(selectedJob)}</div><h2>{selectedLeg.canStart?"Ξεκινάς προς τον πελάτη;":selectedLeg.active?"Final leg ενεργό":"Final leg δεν είναι ακόμη διαθέσιμο"}</h2>
      {selectedLeg.canStart?<p>Επιβεβαίωσε μόνο όταν έχεις ολοκληρώσει όλες τις παραλαβές και φεύγεις πραγματικά προς τη διεύθυνση πελάτη. Η επιβεβαίωση ενεργοποιεί το customer live tracking και το QR παραλαβής.</p>:selectedLeg.active?<p>Έχεις ήδη επιβεβαιώσει το τελικό σκέλος. Ακολούθησε το κάτω πεδίο μέχρι τον πελάτη και σκάναρε το QR επιβεβαίωσης στην παράδοση.</p>:<p>Απομένουν {selectedJob.stops.filter((stop)=>stop.kind==="vendor_pickup"&&stop.status!=="completed").length} pickup stop(s). Ολοκλήρωσέ τα πρώτα.</p>}
      <div className={styles.modalActions}><button className={styles.secondary} type="button" onClick={()=>setSelectedJobId(null)}>Κλείσιμο</button>{selectedLeg.canStart&&<button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={()=>void startCustomerLeg(selectedJob)}>Επιβεβαίωση Final leg</button>}</div>
    </section></div>}

    {selectedJob&&selectedJob.type!=="outbound"&&<div className={styles.modalShade} role="presentation" onClick={()=>setSelectedJobId(null)}><section className={styles.modal} role="dialog" aria-modal="true" onClick={(event)=>event.stopPropagation()}><div className={styles.modalKicker}>Επιστροφή · {orderLabel(selectedJob)}</div><h2>Ενεργή επιστροφή</h2><p>Η εργασία επιστροφής δεν χρησιμοποιεί customer final leg. Ακολούθησε το κάτω πεδίο για το επόμενο pickup/drop-off και τη σωστή QR επιβεβαίωση.</p><div className={styles.modalActions}><button className={`${styles.primary} ${styles.full}`} type="button" onClick={()=>setSelectedJobId(null)}>Συνέχεια</button></div></section></div>}

    {scanner&&<QrScannerOverlay onScan={(value)=>void scan(value)} onClose={()=>setScanner(false)}/>} 
  </div></>;
}
