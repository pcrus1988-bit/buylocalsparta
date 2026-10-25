"use client";
import {useState} from "react";
import type {NearbyOffer} from "../lib/nearby-offers";
import {rememberNearbyOffersEnabled} from "./NearbyOffersWatcher";

export function NearbyOffersClient({initial,csrfToken}:{initial:{enabled:boolean;phoneNotifications:boolean};csrfToken:string}){
  const [enabled,setEnabled]=useState(initial.enabled);
  const [phone,setPhone]=useState(initial.phoneNotifications);
  const [offers,setOffers]=useState<NearbyOffer[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function persist(nextEnabled:boolean,nextPhone:boolean){
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/account/nearby-offers",{
        method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
        body:JSON.stringify({enabled:nextEnabled,phoneNotifications:nextPhone})
      });
      const data=await response.json() as {enabled?:boolean;phoneNotifications?:boolean;error?:string};
      if(!response.ok||typeof data.enabled!=="boolean")throw new Error(data.error??"Δεν αποθηκεύτηκε η επιλογή.");
      setEnabled(data.enabled);setPhone(data.phoneNotifications===true);
      if(!data.enabled)setOffers([]);
      rememberNearbyOffersEnabled(data.enabled);
      setMessage(data.enabled?"Οι κοντινές προσφορές ενεργοποιήθηκαν.":"Οι κοντινές προσφορές απενεργοποιήθηκαν.");
    }catch(error){setMessage(error instanceof Error?error.message:"Παρουσιάστηκε πρόβλημα.");}
    finally{setBusy(false);}
  }
  async function enablePhone(){
    if(!enabled){setMessage("Ενεργοποίησε πρώτα τις κοντινές προσφορές.");return;}
    if(!("Notification" in window)){setMessage("Η συσκευή σου δεν υποστηρίζει ειδοποιήσεις ιστού.");return;}
    try{
      // Must originate from explicit click, never request notification access on page load.
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){setMessage("Η άδεια ειδοποιήσεων δεν δόθηκε.");return;}
      if("serviceWorker" in navigator){
        try{await navigator.serviceWorker.register("/nearby-offers-sw.js",{scope:"/account/nearby-offers/"});}
        catch{/* desktop fallback uses the Notification constructor */}
      }
      await persist(true,true);
      setMessage("Οι ειδοποιήσεις ενεργοποιήθηκαν όσο η εφαρμογή είναι ανοιχτή.");
    }catch{setMessage("Η συσκευή δεν μπόρεσε να ενεργοποιήσει τις ειδοποιήσεις.");}
  }
  async function locate(){
    if(!enabled)return;
    setBusy(true);setMessage("Ελέγχουμε τις προσφορές κοντά σου...");
    try{
      if(!navigator.geolocation){setMessage("Η συσκευή δεν υποστηρίζει εντοπισμό θέσης.");return;}
      const point=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:30000,enableHighAccuracy:true}));
      if(point.coords.accuracy>200){setMessage("Η θέση δεν είναι αρκετά ακριβής. Δοκίμασε ξανά.");return;}
      const response=await fetch("/api/account/nearby-offers",{
        method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
        body:JSON.stringify({latitude:point.coords.latitude,longitude:point.coords.longitude,accuracy:point.coords.accuracy,canNotify:false})
      });
      const data=await response.json() as {offers?:NearbyOffer[];error?:string};
      if(!response.ok)throw new Error(data.error??"Δεν ολοκληρώθηκε ο έλεγχος.");
      const list=data.offers??[];
      setOffers(list);setMessage(list.length?`Βρέθηκαν ${list.length} προσφορές κοντά σου.`:"Δεν υπάρχουν ενεργές αποκλειστικές προσφορές εδώ αυτή τη στιγμή.");
      // The global watcher also performs the same check while KONTA MOY remains open.
    }catch(error){setMessage(error instanceof Error?error.message:"Δεν έχουμε πρόσβαση στη θέση σου.");}
    finally{setBusy(false);}
  }
  return <div style={{maxWidth:860,margin:"0 auto",padding:"24px 0 60px"}}>
    <div className="eyebrow">KONTA MOY · Κοντά σου</div>
    <h1>Μυστικές προσφορές στη γειτονιά σου</h1>
    <p>Όταν βρίσκεσαι κοντά σε επιβεβαιωμένο συνεργαζόμενο κατάστημα, μπορείς να δεις μια ειδική προσφορά διαθέσιμη μόνο σε όσους είναι στην περιοχή.</p>
    <section className="customer-account-panel" aria-labelledby="nearby-opt-in">
      <h2 id="nearby-opt-in">Δική σου επιλογή, κάθε στιγμή</h2>
      <p>Με τη συγκατάθεσή σου, το KONTA MOY ελέγχει την τοποθεσία σου μόνο όσο η εφαρμογή είναι ανοιχτή. Δεν αποθηκεύουμε συντεταγμένες ή διαδρομές, δεν πωλούμε τη θέση σου σε καταστήματα και μπορείς να σταματήσεις όποτε θέλεις.</p>
      <label className="customer-product-alert-option">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={e=>void persist(e.target.checked,false)} />
        <span><strong>Θέλω να βλέπω αποκλειστικές προσφορές κοντά μου</strong><small>Απαιτείται ξεχωριστή άδεια τοποθεσίας από τη συσκευή.</small></span>
      </label>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:18}}>
        {enabled&&!phone&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>void enablePhone()}>Ενεργοποίηση ειδοποιήσεων κινητού</button>}
        {phone&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void persist(true,false)}>Απενεργοποίηση ειδοποιήσεων</button>}
        {enabled&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void locate()}>Έλεγχος προσφορών κοντά μου</button>}
      </div>
      <p style={{fontSize:14,marginTop:16}}>Οι αυτόματες ειδοποιήσεις λειτουργούν όσο το KONTA MOY είναι ανοιχτό. Οι ειδοποιήσεις όταν το κινητό είναι κλειδωμένο και η εφαρμογή έχει κλείσει απαιτούν μελλοντική υποστήριξη native geofencing. Μέγιστο 2 ειδοποιήσεις ανά 24 ώρες, όχι πάνω από 1 ανά κατάστημα/24ωρο.</p>
      {message&&<p role="status" className="customer-saved-status">{message}</p>}
    </section>
    <section aria-label="Προσφορές στην περιοχή" style={{marginTop:28,display:"grid",gap:14}}>
      {offers.map(offer=><article className="customer-account-panel" key={offer.id}>
        <div className="eyebrow">{offer.vendorName} · {offer.locationName} · περίπου {offer.distanceM} μ.</div>
        <h2>{offer.title}</h2><p>{offer.description}</p>
        {offer.redemptionCode&&<p><strong>Κωδικός στο κατάστημα: {offer.redemptionCode}</strong></p>}
        <small>Ισχύει έως {new Date(offer.expiresAt).toLocaleString("el-GR")}. Η εξαργύρωση υπόκειται στους όρους του καταστήματος.</small>
      </article>)}
    </section>
  </div>;
}
