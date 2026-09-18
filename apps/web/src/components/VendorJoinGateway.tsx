"use client";

import { useState } from "react";
import styles from "../app/join/page.module.css";

type ResolvedCompany = Readonly<{ legalName: string; tradingName?: string; city?: string; postcode?: string }>;
type ResolvedHub = Readonly<{ slug: string; nameEl: string; regionEl: string; isSpartaLegacy: boolean }>;

export function VendorJoinGateway() {
  const [afm,setAfm]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [company,setCompany]=useState<ResolvedCompany>();
  const [hub,setHub]=useState<ResolvedHub>();

  async function resolve() {
    setBusy(true); setError(""); setCompany(undefined); setHub(undefined);
    try {
      const response=await fetch("/api/hubs/resolve-company-by-afm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({afm})});
      const data=await response.json() as {company?:ResolvedCompany;hub?:ResolvedHub;error?:string};
      if(!response.ok||!data.company||!data.hub) throw new Error(data.error??"Δεν μπορέσαμε να αντιστοιχίσουμε την επιχείρηση στη σωστή αγορά.");
      setCompany(data.company); setHub(data.hub);
      sessionStorage.setItem("kontamou:vendor-join-afm",afm);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Δεν μπορέσαμε να αντιστοιχίσουμε την επιχείρηση.");
    } finally { setBusy(false); }
  }

  const destination=hub?.isSpartaLegacy?"/join/sparta":hub?"/hubs/join":"";

  return <div className={styles.gatewayCard}>
    <div className={styles.gatewayHeader}>
      <span>1 · Ταυτοποίηση επιχείρησης</span>
      <h2>Βάλε το ΑΦΜ και θα βρούμε τη σωστή αγορά.</h2>
      <p>Ελέγχουμε τα δημόσια στοιχεία Γ.Ε.ΜΗ. και αντιστοιχίζουμε την επιχείρηση στο σωστό KONTA MOY HUB. Μόνο τότε εμφανίζονται τα προγράμματα και οι τιμές που ισχύουν για τη συγκεκριμένη περιοχή.</p>
    </div>
    <label className={styles.gatewayLabel} htmlFor="join-afm">ΑΦΜ επιχείρησης</label>
    <div className={styles.gatewayRow}>
      <input id="join-afm" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder="9 ψηφία" value={afm} onChange={(e)=>setAfm(e.target.value.replace(/\D/g,"").slice(0,9))}/>
      <button className="button" type="button" disabled={busy||afm.length!==9} onClick={()=>void resolve()}>{busy?"Έλεγχος…":"Βρες το σωστό πρόγραμμα"}</button>
    </div>
    {error&&<div className={styles.gatewayError} role="alert">{error}</div>}
    {company&&hub&&<div className={styles.gatewayResult} role="status">
      <div><span>Γ.Ε.ΜΗ. ✓</span><strong>{company.tradingName??company.legalName}</strong><small>{[company.postcode,company.city].filter(Boolean).join(" · ")}</small></div>
      <div><span>Η σωστή διαδρομή</span><strong>{hub.isSpartaLegacy?"Ενεργό HUB Σπάρτης":hub.nameEl}</strong><small>{hub.isSpartaLegacy?"Θα δεις μόνο τα προγράμματα Σπάρτης.":`${hub.regionEl} · θα δεις μόνο τα προγράμματα επέκτασης.`}</small></div>
      <a className="button" href={destination}>{hub.isSpartaLegacy?"Δες τα προγράμματα Σπάρτης":"Δες τα προγράμματα του HUB"}</a>
    </div>}
  </div>;
}
