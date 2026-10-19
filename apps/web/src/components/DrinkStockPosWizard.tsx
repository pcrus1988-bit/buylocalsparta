"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {EMPTY_POS_DRAFT,selfCheckDraft,validatePosDraft,validateDraftProductMembership,type PosDraft,type SavedPosDraft} from "../lib/drinkstock-pos-draft";
import {
 buildMappingCsv,buildVendorRequest,parsePosMenuCsv,posCsvTemplate,
 posSetupPath,proposeExactMatches,PosOnboardingError,
 type PosSetupPath,type PosCsvItem,type PosItemMapping,type DrinkStockMenuItem
} from "../lib/drinkstock-pos-onboarding";
import styles from "./DrinkStockPosWizard.module.css";

type PosProvider={id:string;name:string;vendor:string;product:string;approach:string;note:string;evidence:string[];status:string};
type WizardProps={venueName:string;partnerId:string;venueId:string;csrfToken:string;providers:PosProvider[];drinks:DrinkStockMenuItem[]};
const steps=["Επιλογή POS","Τρόπος σύνδεσης","Αντιστοίχιση ειδών","Έλεγχος"];
const routeLabels:Record<PosSetupPath,string>={
 cloud:"Σύνδεση Cloud / API",local_bridge:"Τοπικό πρόγραμμα POS",vendor_assisted:"Με τον προμηθευτή POS"
};
const routeDetails:Record<PosSetupPath,string>={
 cloud:"Ο προμηθευτής εγκρίνει πρόσβαση μέσω του επίσημου cloud API. Δεν πληκτρολογείτε κωδικούς POS στο DrinkStock.",
 local_bridge:"Ο τεχνικός του POS εγκαθιστά έναν εγκεκριμένο connector στον υπολογιστή του καταστήματος. Χωρίς παρεμβάσεις στην ταμειακή ή την ΑΑΔΕ.",
 vendor_assisted:"Στέλνετε ένα προετοιμασμένο τεχνικό αίτημα στον πάροχό σας. Επιβεβαιώνουμε ποια λειτουργία επιτρέπει επίσημα το συγκεκριμένο POS."
};
const help:Record<string,string>={
 CSV_FILE_TOO_LARGE:"Το αρχείο είναι υπερβολικά μεγάλο. Επιτρέπονται έως 500 είδη και 500 KB.",
 CSV_TOO_MANY_ROWS:"Πολλές εγγραφές. Επιτρέπονται έως 500 είδη.",
 CSV_NEEDS_CODE_AND_NAME:"Το CSV πρέπει να περιέχει στήλες code/name ή Κωδικός/Περιγραφή.",
 CSV_INVALID_QUOTES:"Μη έγκυρα εισαγωγικά στο CSV. Εξαγάγετε ξανά τον κατάλογο από το POS.",
 CSV_INVALID_ITEM:"Κάποιο είδος δεν έχει έγκυρο κωδικό και όνομα.",
 CSV_DUPLICATE_CODE:"Βρέθηκε ίδιος κωδικός POS σε περισσότερα από ένα είδη.",
 CSV_EMPTY:"Το αρχείο δεν έχει είδη."
};
function downloadText(filename:string,text:string){
 const blob=new Blob([text],{type:filename.endsWith(".txt")?"text/plain;charset=utf-8":"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function DrinkStockPosWizard({venueName,partnerId,venueId,csrfToken,providers,drinks}:WizardProps){
 const [stage,setStage]=useState(0),[search,setSearch]=useState("");
 const [selectedId,setSelectedId]=useState(""),[otherName,setOtherName]=useState("");
 const [path,setPath]=useState<PosSetupPath>("vendor_assisted");
 const [menu,setMenu]=useState<PosCsvItem[]>([]),[mappings,setMappings]=useState<PosItemMapping[]>([]);
 const [importError,setImportError]=useState(""),[showAll,setShowAll]=useState(false);
 const [copied,setCopied]=useState(false);
 const upload=useRef<HTMLInputElement>(null);
 const restore=useRef<HTMLInputElement>(null);
 const [loaded,setLoaded]=useState(false),[loadingError,setLoadingError]=useState("");
 const [revision,setRevision]=useState(0),[savedAt,setSavedAt]=useState<string|null>(null);
 const [syncStatus,setSyncStatus]=useState<"saved"|"changed"|"saving"|"error">("changed");
 const [syncError,setSyncError]=useState("");
 const inFlight=useRef(false),lastPersisted=useRef("");
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/pos-setup`;
 const serialized=JSON.stringify({providerId:selectedId,otherName,path,menu,mappings});
 const current:PosDraft={providerId:selectedId,otherName,path,menu,mappings};
 const readiness=selfCheckDraft(current,drinks);
 useEffect(()=>{
  let canceled=false;
  async function load(){
   try{
    const res=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    if(!res.ok)throw new Error("Δεν φορτώθηκε η αποθηκευμένη προετοιμασία ("+res.status+").");
    const data=await res.json() as SavedPosDraft;
    if(canceled)return;
    setSelectedId(data.providerId);setOtherName(data.otherName);setPath(data.path);
    setMenu(data.menu);setMappings(data.mappings);setRevision(data.revision);
    setSavedAt(data.updatedAt);lastPersisted.current=JSON.stringify({
     providerId:data.providerId,otherName:data.otherName,path:data.path,menu:data.menu,mappings:data.mappings
    });
    setSyncStatus("saved");setLoaded(true);setLoadingError("");
   }catch(e){if(!canceled)setLoadingError(e instanceof Error?e.message:"Δεν φορτώθηκαν τα δεδομένα.")}
  }
  void load();return()=>{canceled=true;};
 },[endpoint]);
 async function persist(){
  if(!loaded||inFlight.current||!isChosen)return;
  const snapshot:PosDraft={providerId:selectedId,otherName,path,menu,mappings};
  const exact=JSON.stringify(snapshot);
  if(exact===lastPersisted.current){setSyncStatus("saved");return;}
  inFlight.current=true;setSyncStatus("saving");setSyncError("");
  try{
   const response=await fetch(endpoint,{method:"PUT",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({draft:snapshot,expectedRevision:revision})});
   const result=await response.json() as SavedPosDraft&{error?:string};
   if(!response.ok)throw new Error(result.error==="STALE_DRAFT"?
    "Το POS άλλαξε από άλλη συνεδρία. Ανανεώστε τη σελίδα πριν αποθηκεύσετε ξανά.":result.error??"SAVE_FAILED");
   setRevision(result.revision);setSavedAt(result.updatedAt);
   lastPersisted.current=exact;setSyncStatus("saved");
  }catch(e){setSyncStatus("error");setSyncError(e instanceof Error?e.message:"SAVE_FAILED");}
  finally{inFlight.current=false;}
 }
 useEffect(()=>{
  if(!loaded||!isChosen||serialized===lastPersisted.current)return;
  const timer=setTimeout(()=>{void persist();},1400);
  return ()=>clearTimeout(timer);
  // Revision refresh triggers another pass if the user changed data mid-save.
 },[serialized,loaded,revision]);
 function downloadBackup(){
  if(!isChosen)return;
  downloadText("drinkstock-pos-setup.json",JSON.stringify({
   format:"drinkstock-pos-draft-v1",draft:validatePosDraft(current)
  },null,2));
 }
 async function restoreBackup(file:File|undefined){
  if(!file)return;
  if(file.size>130000){setImportError("Το αρχείο προετοιμασίας είναι υπερβολικά μεγάλο.");return;}
  try{
   const raw=JSON.parse(await file.text()) as {format?:string;draft?:unknown};
   if(raw.format!=="drinkstock-pos-draft-v1")throw new Error("BAD_BACKUP_FORMAT");
   const result=validatePosDraft(raw.draft);
   validateDraftProductMembership(result,drinks);
   setSelectedId(result.providerId);setOtherName(result.otherName);setPath(result.path);
   setMenu(result.menu);setMappings(result.mappings);setImportError("");
  }catch{
   setImportError("Το αρχείο προετοιμασίας δεν είναι έγκυρο ή αφορά προϊόντα άλλου χώρου.");
  }finally{if(restore.current)restore.current.value="";}
 }
 const provider=providers.find(p=>p.id===selectedId);
 const providerName=provider?.name??otherName.trim();
 const choices=useMemo(()=>providers.filter(p=>[p.name,p.vendor,p.product].some(t=>t.toLocaleLowerCase("el-GR").includes(search.trim().toLocaleLowerCase("el-GR")))),[providers,search]);
 const mappedCount=mappings.filter(m=>m.productId&&drinks.some(d=>d.id===m.productId)).length;
 const request=buildVendorRequest(providerName||"το POS μας",venueName,path);
 const isChosen=Boolean(provider||selectedId==="other"&&otherName.trim().length>=2);
 async function importMenu(file:File|undefined){
  if(!file)return;
  setImportError("");setMenu([]);setMappings([]);setShowAll(false);
  if(file.size>512_000){setImportError(help.CSV_FILE_TOO_LARGE);return;}
  try{
   const text=await file.text(),items=parsePosMenuCsv(text);
   setMenu(items);setMappings(proposeExactMatches(items,drinks));
  }catch(e){
   setImportError(e instanceof PosOnboardingError?(help[e.code]??"Ο κατάλογος δεν μπορεί να διαβαστεί."):"Η ανάγνωση του CSV απέτυχε.");
  }finally{if(upload.current)upload.current.value="";}
 }
 async function copyRequest(){
  try{await navigator.clipboard.writeText(request);setCopied(true);}
  catch{setCopied(false);}
 }
 function choose(id:string){
  setSelectedId(id);setCopied(false);setMenu([]);setMappings([]);setImportError("");
  const p=providers.find(x=>x.id===id);
  setPath(p?posSetupPath(p.approach):"vendor_assisted");
 }
 if(!loaded)return <section className={styles.root} aria-label="Οδηγός σύνδεσης POS">
  <h2>POS Easy Connect</h2>
  {loadingError?<><p role="alert">{loadingError}</p><button className={styles.primaryButton} type="button" onClick={()=>window.location.reload()}>Επανάληψη φόρτωσης</button></>:
  <p role="status">Φόρτωση αποθηκευμένης προετοιμασίας…</p>}
 </section>;
 return <section className={styles.root} aria-label="Οδηγός σύνδεσης POS">
  <div className={styles.header}>
   <div><span className={styles.eyebrow}>DRINKSTOCK / POS SETUP</span>
    <h2>Σύνδεση POS, χωρίς τεχνικές γνώσεις.</h2>
    <p>4 απλά βήματα για να προετοιμάσετε τη διασύνδεση του {venueName}.</p>
   </div>
   <span className={styles.status}>Προετοιμασία · Όχι ενεργή σύνδεση</span>
  </div>
  <div role="status" aria-live="polite" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:12,margin:"15px 0"}}>
   <strong style={{fontSize:13,color:syncStatus==="error"?"#ffabab":"#d9ff57"}}>
    {syncStatus==="saving"?"Αποθήκευση…":syncStatus==="saved"?"✓ Αποθηκεύτηκε":
    syncStatus==="error"?"Η αποθήκευση απέτυχε":"Έχετε αλλαγές προς αποθήκευση"}
   </strong>
   {savedAt&&<small style={{color:"#c6d1e8"}}>Τελευταία αποθήκευση: {new Date(savedAt).toLocaleString("el-GR")}</small>}
   <button type="button" className={styles.secondaryButton} disabled={syncStatus==="saving"||!isChosen} onClick={()=>void persist()}>Αποθήκευση τώρα</button>
   <button type="button" className={styles.secondaryButton} disabled={!isChosen} onClick={downloadBackup}>↓ Αντίγραφο ρυθμίσεων</button>
   <label htmlFor="drinkstock-restore-backup" className={styles.secondaryButton}>↑ Επαναφορά αρχείου</label>
   <input className={styles.hiddenFile} id="drinkstock-restore-backup" type="file" ref={restore} accept=".json,application/json"
    onChange={e=>void restoreBackup(e.target.files?.[0])}/>
   {syncError&&<small role="alert" style={{color:"#ffabab"}}>{syncError}</small>}
   {importError&&stage!==2&&<small role="alert" style={{color:"#ffabab"}}>{importError}</small>}
  </div>
  <div style={{display:"flex",flexWrap:"wrap",gap:12,margin:"12px 0 20px",fontSize:12,color:"#dbe7fa"}}>
   <span>☑ POS: {readiness.providerSelected?"Επιλέχθηκε":"Εκκρεμεί"}</span>
   <span>☑ Κατάλογος: {readiness.catalogueImported?readiness.total+" είδη":"Εκκρεμεί"}</span>
   <span>☑ Αντιστοίχιση: {readiness.mapped}/{readiness.total}</span>
   {readiness.duplicateTargets>0&&<span style={{color:"#ffb0b0"}}>⚠ {readiness.duplicateTargets} διπλές αντιστοιχίσεις</span>}
   <strong style={{color:"#d9ff57"}}>{readiness.readyForVendorTest?"Προετοιμασία ολοκληρωμένη":"Απαιτείται προετοιμασία"}</strong>
  </div>
  <nav className={styles.steps} aria-label="Βήματα εγκατάστασης">
   {steps.map((label,i)=><button key={label} type="button"
    className={i===stage?styles.stepActive:styles.step}
    aria-current={i===stage?"step":undefined}
    disabled={i>stage||(i>0&&!isChosen)} onClick={()=>setStage(i)}>
    <span className={styles.stepNumber}>{i+1}</span>{label}
   </button>)}
  </nav>
  {stage===0&&<div className={styles.panel}>
   <h3>Ποιο POS χρησιμοποιείτε;</h3>
   <p>Επιλέξτε τον κατασκευαστή. Δεν απαιτούνται κωδικοί πρόσβασης.</p>
   <label className={styles.fieldLabel} htmlFor="drinkstock-pos-search">Αναζήτηση κατασκευαστή ή προϊόντος</label>
   <input id="drinkstock-pos-search" className={styles.input} type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="π.χ. SoftOne, PYLON, Oracle…" />
   <div className={styles.providers} role="group" aria-label="Επιλογή λογισμικού POS">
    {choices.map(p=><button key={p.id} type="button" className={selectedId===p.id?styles.providerChosen:styles.provider} aria-pressed={selectedId===p.id} onClick={()=>choose(p.id)}>
     <span className={styles.providerIcon}>⌁</span><strong>{p.name}</strong><small>{p.vendor}</small>
    </button>)}
    <button type="button" className={selectedId==="other"?styles.providerChosen:styles.provider} aria-pressed={selectedId==="other"} onClick={()=>choose("other")}>
     <span className={styles.providerIcon}>＋</span><strong>Άλλο / Δεν γνωρίζω</strong><small>Συμπληρώστε την ονομασία</small>
    </button>
   </div>
   {selectedId==="other"&&<><label className={styles.fieldLabel} htmlFor="drinkstock-other-pos">Όνομα POS ή κατασκευαστή</label>
    <input id="drinkstock-other-pos" className={styles.input} value={otherName} maxLength={90} onChange={e=>setOtherName(e.target.value)} placeholder="Εμπορική ονομασία POS" /></>}
  </div>}
  {stage===1&&<div className={styles.panel}>
   <h3>Πώς θα συνδεθεί το {providerName};</h3>
   <p>Προτείναμε την καταλληλότερη διαδρομή. Μπορείτε να την αλλάξετε εφόσον ο προμηθευτής σας την υποστηρίζει.</p>
   <div className={styles.paths} role="radiogroup" aria-label="Τρόπος εγκατάστασης">
    {(["cloud","local_bridge","vendor_assisted"] as const).map(option=><label key={option} className={path===option?styles.pathChosen:styles.path}>
     <input type="radio" name="drinkstock-connection-path" value={option} checked={path===option} onChange={()=>setPath(option)} />
     <strong>{routeLabels[option]}</strong><small>{routeDetails[option]}</small>
    </label>)}
   </div>
   <p className={styles.notice}><strong>Σημαντικό:</strong> Η επιλογή δεν ενεργοποιεί σύνδεση. Η επίσημη πρόσβαση και η συμβατότητα ελέγχονται ξεχωριστά για κάθε έκδοση POS.</p>
  </div>}
  {stage===2&&<div className={styles.panel}>
   <h3>Προετοιμασία καταλόγου ποτών</h3>
   <p>Εξαγάγετε προαιρετικά έναν κατάλογο CSV από το POS και αντιστοιχίστε τον στα είδη DrinkStock. Δεν μεταφορτώνεται τίποτα στον διακομιστή.</p>
   <div className={styles.mappingSummary}><span>Είδη DrinkStock: <strong>{drinks.length}</strong></span><span>Είδη POS: <strong>{menu.length}</strong></span><span>Προτάσεις αντιστοίχισης: <strong>{mappedCount}</strong></span></div>
   <div className={styles.importActions}>
    <button className={styles.secondaryButton} type="button" onClick={()=>downloadText("drinkstock-pos-template.csv",posCsvTemplate())}>↓ Υπόδειγμα CSV</button>
    <label className={styles.primaryButton} htmlFor="drinkstock-pos-file">↑ Επιλογή αρχείου CSV</label>
    <input ref={upload} className={styles.hiddenFile} type="file" id="drinkstock-pos-file" accept=".csv,.txt,text/csv,text/plain" onChange={e=>void importMenu(e.target.files?.[0])}/>
   </div>
   <p className={styles.hint}>Στήλες: <code>code;name</code> ή <code>Κωδικός;Περιγραφή</code> · έως 500 είδη / 500 KB. Δεν απαιτούνται τιμές ή δεδομένα πελατών.</p>
   {importError&&<p className={styles.error} role="alert">{importError}</p>}
   {menu.length>0&&<><div className={styles.tableWrap}><table className={styles.mappingTable}><thead><tr><th scope="col">Κωδικός POS</th><th scope="col">Περιγραφή POS</th><th scope="col">Είδος DrinkStock</th></tr></thead><tbody>
    {(showAll?menu:menu.slice(0,30)).map((item,i)=><tr key={item.externalItemId}><td>{item.externalItemId}</td><td>{item.name}</td><td><label className={styles.visuallyHidden} htmlFor={"map-"+i}>DrinkStock για {item.name}</label>
     <select id={"map-"+i} className={styles.select} value={mappings.find(m=>m.externalItemId===item.externalItemId)?.productId??""} onChange={e=>setMappings(prev=>prev.map(m=>m.externalItemId===item.externalItemId?{...m,productId:e.target.value}:m))}>
      <option value="">Χωρίς αντιστοίχιση</option>{drinks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
     </select></td></tr>)}
   </tbody></table></div>
   {menu.length>30&&<button className={styles.linkButton} type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?"Λιγότερα είδη":"Εμφάνιση και των "+menu.length+" ειδών"}</button>}
   <button className={styles.secondaryButton} type="button" onClick={()=>downloadText("drinkstock-pos-mapping-review.csv",buildMappingCsv(menu,mappings,drinks))}>↓ Λήψη αντιστοίχισης για έλεγχο</button>
   <p className={styles.hint}>Οι προτεινόμενες αντιστοιχίσεις δεν εγκρίνονται αυτόματα. Το αρχείο εξάγεται για τεχνική επιβεβαίωση.</p></>}
   {menu.length===0&&<div className={styles.empty}>Μπορείτε να συνεχίσετε χωρίς CSV. Ο επίσημος connector θα πρέπει να επιβεβαιώσει τον κατάλογο όταν εγκριθεί.</div>}
  </div>}
  {stage===3&&<div className={styles.panel}>
   <h3>Οι ρυθμίσεις σας είναι έτοιμες για τεχνικό έλεγχο</h3>
   <p>Ο κατάλογος και οι αντιστοιχίσεις αποθηκεύονται αυτόματα για αυτόν τον χώρο. Μπορείτε να τις ενημερώνετε ανεξάρτητα. Πραγματικές πωλήσεις ενεργοποιούνται μόνο μετά από εγκεκριμένη τεχνική διασύνδεση.</p>
   <div className={styles.summaryGrid}>
    <div><small>POS</small><strong>{providerName}</strong></div>
    <div><small>Μέθοδος</small><strong>{routeLabels[path]}</strong></div>
    <div><small>Κατάλογος</small><strong>{menu.length?menu.length+" είδη · "+mappedCount+" προτάσεις":"Αναμένεται κατάλογος"}</strong></div>
    <div><small>Σύνδεση</small><strong>Δεν έχει ενεργοποιηθεί</strong></div>
   </div>
   <h4>Απαραίτητοι έλεγχοι πριν τη λειτουργία</h4>
   <ul className={styles.checks}>
    <li>Έγκριση κατασκευαστή και εξουσιοδότηση καταστήματος.</li>
    <li>Δοκιμή πραγματικών, εξοφλημένων παραγγελιών και αποφυγή διπλών καταχωρήσεων.</li>
    <li>Αντιστοίχιση όλων των ποτών και επιβεβαίωση ακυρώσεων / επιστροφών.</li>
    <li>Έλεγχος φορολογικών παραστατικών, ΑΑΔΕ και συγχρονισμού τιμών όπου υποστηρίζεται.</li>
   </ul>
   <div className={styles.requestBlock}><h4>Προαιρετικά: αίτημα προς τον προμηθευτή POS</h4>
    <p>Χρειάζεται μόνο αν δεν έχετε ήδη επίσημα διαθέσιμη πρόσβαση API ή εγκεκριμένο connector. Δεν αποστέλλεται αυτόματα.</p>
    <textarea className={styles.message} readOnly aria-label="Αίτημα προς κατασκευαστή" value={request} rows={12}/>
    <div className={styles.importActions}>
     <button className={styles.primaryButton} type="button" onClick={()=>void copyRequest()}>{copied?"✓ Αντιγράφηκε":"Αντιγραφή αιτήματος"}</button>
     <button className={styles.secondaryButton} type="button" onClick={()=>downloadText("drinkstock-pos-vendor-request.txt",request)}>↓ Λήψη αιτήματος</button>
     {menu.length>0&&<button className={styles.secondaryButton} type="button" onClick={()=>downloadText("drinkstock-pos-mapping-review.csv",buildMappingCsv(menu,mappings,drinks))}>↓ Αρχείο αντιστοίχισης</button>}
    </div>
   </div>
   <p className={styles.notice}>Οι ασφαλείς ρυθμίσεις προετοιμασίας αποθηκεύονται στον χώρο σας· οι κωδικοί και τα δεδομένα πληρωμών δεν αποθηκεύονται εδώ. Δεν ενεργοποιείται ακόμη το Actual Orders TV feed.</p>
  </div>}
  <div className={styles.footer}>
   {stage>0?<button className={styles.secondaryButton} type="button" onClick={()=>setStage(s=>s-1)}>← Πίσω</button>:<span/>}
   {stage<3?<button className={styles.primaryButton} type="button" disabled={stage===0&&!isChosen} onClick={()=>setStage(s=>s+1)}>Συνέχεια →</button>:<button className={styles.secondaryButton} type="button" onClick={()=>{setStage(0);setCopied(false);}}>Αλλαγή POS</button>}
  </div>
 </section>;
}
