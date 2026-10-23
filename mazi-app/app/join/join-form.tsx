"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {normalizeGreekAfm} from "../../lib/invite-eligibility";

type Company={afm:string;gemiNumber:string;legalName:string;tradingName:string|null;companyStatus:string|null;city:string|null;checkedAt:number};
type ResponseShape={status?:string;company?:Company;code?:string;error?:string;message?:string};
const API="https://kontamou.site/api/mazi-interest";

let transientVisitor="";
function visitorKey(){
 if(transientVisitor)return transientVisitor;
 const key="mazi_afm_interest_visitor_v1";
 let id="";
 try{id=sessionStorage.getItem(key)||"";}catch{}
 if(!/^[a-zA-Z0-9_-]{16,128}$/.test(id)){
  id=crypto.randomUUID().replaceAll("-","");
  try{sessionStorage.setItem(key,id);}catch{}
 }
 transientVisitor=id;
 return id;
}
async function send(body:Record<string,unknown>):Promise<ResponseShape>{
 const response=await fetch(API,{
  method:"POST",mode:"cors",credentials:"omit",
  headers:{"content-type":"application/json","x-bls-visitor":visitorKey()},
  body:JSON.stringify(body),cache:"no-store"
 });
 const result=await response.json() as ResponseShape;
 if(!response.ok)throw Error(result.error||"Η υπηρεσία δεν είναι προσωρινά διαθέσιμη.");
 return result;
}

export default function JoinForm(){
 const [afm,setAfm]=useState("");
 const [company,setCompany]=useState<Company|null>(null);
 const [lookupStatus,setLookupStatus]=useState("");
 const [busy,setBusy]=useState<"lookup"|"submit"|null>(null);
 const [error,setError]=useState("");
 const [submitted,setSubmitted]=useState(false);
 const [representativeName,setRepresentativeName]=useState("");
 const [contactEmail,setContactEmail]=useState("");
 const [description,setDescription]=useState("");
 const [acceptProcessing,setAcceptProcessing]=useState(false);
 const [confirmAccuracy,setConfirmAccuracy]=useState(false);
 const [trap,setTrap]=useState("");
 function changeAfm(value:string){
  setAfm(value.replace(/[^0-9\s-]/g,"").slice(0,12));
  setCompany(null);setLookupStatus("");setError("");
 }
 async function lookup(){
  if(busy)return;
  const normalized=normalizeGreekAfm(afm);
  if(!normalized){setError("Συμπλήρωσε έγκυρο 9ψήφιο ΑΦΜ.");return;}
  setAfm(normalized);setBusy("lookup");setError("");
  try{
   const res=await send({operation:"lookup",afm:normalized});
   if(res.status==="matched"&&res.company){setCompany(res.company);setLookupStatus("matched");}
   else{setCompany(null);setLookupStatus(res.status||"unavailable");}
  }catch(e){setCompany(null);setLookupStatus("unavailable");setError(e instanceof Error?e.message:"Η αναζήτηση δεν ολοκληρώθηκε.");}
  finally{setBusy(null);}
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy)return;
  const normalized=normalizeGreekAfm(afm);
  if(!normalized){setError("Συμπλήρωσε έγκυρο 9ψήφιο ΑΦΜ.");return;}
  if(!acceptProcessing||!confirmAccuracy){setError("Επιβεβαίωσε την ενημέρωση επεξεργασίας και την ακρίβεια των στοιχείων.");return;}
  setBusy("submit");setError("");
  try{
   const res=await send({
    operation:"submit",afm:normalized,representativeName,
    contactEmail,description,acceptProcessing,confirmAccuracy,
    companyWebsiteCheck:trap
   });
   if(res.status==="received")setSubmitted(true);
   else throw Error("Η καταχώριση δεν ολοκληρώθηκε.");
  }catch(e){setError(e instanceof Error?e.message:"Δεν έγινε υποβολή.");}
  finally{setBusy(null);}
 }
 if(submitted)return <section className="section shell auth-section"><div className="form-panel">
  <span className="eyebrow">ΜΑΖΙ / ΑΙΤΗΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</span>
  <h2>Το ενδιαφέρον σου καταχωρίστηκε για αξιολόγηση.</h2>
  <p role="status" className="form-message">Εφόσον δεν υπάρχει ήδη εκκρεμής αίτηση για την επιχείρηση, η ομάδα μας θα αξιολογήσει το αίτημα.
  Η καταχώριση δεν αποτελεί έγκριση, πρόσκληση ή δημιουργία λογαριασμού. Δεν έγινε χρέωση.</p>
  <Link href="/" className="button dark">Αρχική σελίδα ↗</Link>
 </div></section>;
 return <section className="section shell auth-section"><div className="form-panel" style={{maxWidth:790}}>
 <span className="eyebrow">01 / ΕΠΙΣΗΜΑ ΣΤΟΙΧΕΙΑ ΕΠΙΧΕΙΡΗΣΗΣ</span>
 <h2>Πρώτα η επιχείρηση.<br/>Μετά η πρόσκληση.</h2>
 <p>Συμπλήρωσε το ΑΦΜ σου. Ανακτούμε τα δημόσια στοιχεία της επιχείρησης από το ΓΕΜΗ μέσω της υπηρεσίας ΚΟΝΤΑ ΜΟΥ. Δεν χρειάζεται να δημιουργήσεις λογαριασμό.</p>
 <form className="stack-form" onSubmit={submit}>
  <label htmlFor="mazi-afm">ΑΦΜ επιχείρησης</label>
  <div style={{display:"flex",gap:12,alignItems:"stretch",flexWrap:"wrap"}}>
   <input id="mazi-afm" name="afm" inputMode="numeric" autoComplete="off"
    pattern="[0-9]{9}" minLength={9} maxLength={12} required
    value={afm} onChange={e=>changeAfm(e.target.value)} placeholder="123456789"
    style={{flex:"1 1 190px"}}/>
   <button type="button" className="button dark" disabled={busy!==null}
    onClick={()=>void lookup()}>{busy==="lookup"?"Αναζήτηση…":"Ανάκτηση από ΓΕΜΗ ↗"}</button>
  </div>
  {company?<div role="status" style={{border:"1px solid #c0ceb9",padding:20,background:"rgba(52,103,70,.06)",borderRadius:12}}>
   <span className="eyebrow">ΕΠΙΣΗΜΑ ΣΤΟΙΧΕΙΑ ΓΕΜΗ</span>
   <h3 style={{margin:"8px 0"}}>{company.legalName}</h3>
   <p>Αρ. ΓΕΜΗ: {company.gemiNumber} · Κατάσταση: {company.companyStatus||"Απαιτείται επιβεβαίωση"} · {company.city||"Ελλάδα"}</p>
   <p className="legal-hint">Η ανάκτηση στοιχείων δεν αποδεικνύει νόμιμη εκπροσώπηση ή αποδοχή συμμετοχής. Ακολουθεί πραγματικός έλεγχος.</p>
  </div>:lookupStatus?<p role="status" className="form-message">Δεν ολοκληρώθηκε η ταυτοποίηση ΓΕΜΗ. Μπορείς να καταθέσεις αίτηση για χειροκίνητο έλεγχο, αλλά δεν θα εγκριθεί πριν από έγκυρη επαλήθευση.</p>:null}
  <span className="eyebrow" style={{marginTop:24}}>02 / ΣΤΟΙΧΕΙΑ ΕΚΠΡΟΣΩΠΟΥ</span>
  <label htmlFor="mazi-rep">Ονοματεπώνυμο νόμιμου εκπροσώπου</label>
  <input id="mazi-rep" required minLength={3} maxLength={120} autoComplete="name"
    value={representativeName} onChange={e=>setRepresentativeName(e.target.value)}/>
  <label htmlFor="mazi-email">Επαγγελματικό email επικοινωνίας</label>
  <input id="mazi-email" type="email" required maxLength={254} autoComplete="email"
    value={contactEmail} onChange={e=>setContactEmail(e.target.value)}/>
  <label htmlFor="mazi-desc">Γιατί ενδιαφέρεται η επιχείρηση για το ΜΑΖΙ;</label>
  <textarea id="mazi-desc" required minLength={20} maxLength={1200} rows={5}
    value={description} onChange={e=>setDescription(e.target.value)}
    placeholder="Πες μας λίγα λόγια για την επιχείρηση και τις προτεραιότητές της."/>
  <div aria-hidden="true" style={{position:"absolute",left:"-10000px",height:0,overflow:"hidden"}}>
   <label htmlFor="mazi-website-check">Website confirmation</label>
   <input id="mazi-website-check" tabIndex={-1} autoComplete="off"
    value={trap} onChange={e=>setTrap(e.target.value)}/>
  </div>
  <span className="eyebrow" style={{marginTop:24}}>03 / ΕΠΙΒΕΒΑΙΩΣΗ</span>
  <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
   <input type="checkbox" required checked={confirmAccuracy}
    onChange={e=>setConfirmAccuracy(e.target.checked)}
    style={{width:20,minWidth:20,height:20,marginTop:4}}/>
   <span>Επιβεβαιώνω ότι τα στοιχεία είναι ακριβή και έχω δικαίωμα να υποβάλω αίτημα για αυτή την επιχείρηση. Η ομάδα ΜΑΖΙ θα ελέγξει ανεξάρτητα την εκπροσώπηση.</span>
  </label>
  <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
   <input type="checkbox" required checked={acceptProcessing}
    onChange={e=>setAcceptProcessing(e.target.checked)}
    style={{width:20,minWidth:20,height:20,marginTop:4}}/>
   <span>Έλαβα γνώση της <Link href="/privacy" className="text-link">ενημέρωσης επεξεργασίας δεδομένων</Link> για τον έλεγχο της αίτησης. Η αίτηση δεν αποτελεί συγκατάθεση διαφήμισης.</span>
  </label>
  {error?<p role="alert" className="form-message error">{error}</p>:null}
  <button disabled={busy!==null} className="button dark" type="submit">
   {busy==="submit"?"Καταχώριση…":"Αποστολή αίτησης ενδιαφέροντος ↗"}</button>
 </form>
 <p className="legal-hint">Η εγγραφή στο ΜΑΖΙ γίνεται αποκλειστικά κατόπιν έγκρισης και προσωπικής πρόσκλησης. Καμία συνδρομή ή χρέωση δεν ενεργοποιείται με την αίτηση.</p>
 <p><Link href="/member-login" className="text-link">Έχεις ήδη λογαριασμό μέλους; Σύνδεση →</Link></p>
 </div></section>;
}
