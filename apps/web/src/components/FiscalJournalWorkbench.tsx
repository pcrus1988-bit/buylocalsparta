"use client";
import {useState} from "react";
import type {FiscalSandboxAccount,FiscalSandboxJournal} from "../lib/fiscal-sandbox-journal";

type Entry={account:FiscalSandboxAccount;side:"debit"|"credit";amount:string};
const testAccounts:ReadonlyArray<{code:FiscalSandboxAccount;name:string}>=[
 {code:"cash_test",name:"Μετρητά · test"},{code:"bank_test",name:"Τράπεζα · test"},
 {code:"receivable_test",name:"Απαιτήσεις · test"},{code:"payable_test",name:"Υποχρεώσεις · test"},
 {code:"sales_test",name:"Πωλήσεις · test"},{code:"purchases_test",name:"Αγορές · test"},
 {code:"inventory_test",name:"Αποθέματα · test"},{code:"adjustment_test",name:"Διορθώσεις · test"}
];
const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const parseMinor=(value:string)=>{
 const match=/^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(value.trim());
 if(!match)throw new Error("Πληκτρολογήστε ποσό EUR με έως δύο δεκαδικά, π.χ. 100.00.");
 const n=Number(match[1])*100+Number((match[2]??"").padEnd(2,"0"));
 if(!Number.isSafeInteger(n)||n<1||n>1_000_000_000)throw new Error("Μη αποδεκτό δοκιμαστικό ποσό.");
 return n;
};
const sample:Entry[]=[
 {account:"cash_test",side:"debit",amount:"100.00"},
 {account:"sales_test",side:"credit",amount:"100.00"}
];
export function FiscalJournalWorkbench({csrfToken,organizationId}:{csrfToken:string;organizationId?:string}){
 const [entries,setEntries]=useState<Entry[]>(sample);
 const [preview,setPreview]=useState<FiscalSandboxJournal|null>(null);
 const [externalId,setExternalId]=useState("");
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(false);
 const [error,setError]=useState("");
 const invalidate=()=>{setPreview(null);setSaved(false);setExternalId("");setError("");};
 const edit=(index:number,fields:Partial<Entry>)=>{
  setEntries(old=>old.map((row,n)=>index===n?{...row,...fields}:row));invalidate();
 };
 async function calculate(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||saving)return;
  setBusy(true);invalidate();
  try{
   const response=await fetch("/timologio/api/console/journal-preview",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({entries:entries.map(row=>({
     account:row.account,side:row.side,amountMinor:parseMinor(row.amount)
    }))})
   });
   const data=await response.json() as {preview?:FiscalSandboxJournal;error?:string};
   if(!response.ok||!data.preview)
    throw new Error(data.error==="JOURNAL_NOT_BALANCED"
      ?"Οι χρεώσεις και πιστώσεις δεν ισοσκελίζονται.":data.error??"Ο έλεγχος απέτυχε.");
   setPreview(data.preview);
   setExternalId("sandbox-"+crypto.randomUUID());
  }catch(e){setError(e instanceof Error?e.message:"Αποτυχία υπολογισμού.");}
  finally{setBusy(false);}
 }
 async function save(){
  if(!organizationId||!preview||!externalId||busy||saving||saved)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/timologio/api/console/journal",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({organizationId,externalId,
     entries:preview.entries.map(({account,side,amountMinor})=>({account,side,amountMinor}))})
   });
   const data=await response.json() as {id?:string;error?:string};
   if(!response.ok||!data.id)
    throw new Error(data.error==="JOURNAL_IDEMPOTENCY_CONFLICT"
      ?"Η δοκιμαστική αναφορά έχει διαφορετικά δεδομένα.":data.error??"Η αποθήκευση απέτυχε.");
   setSaved(true);
  }catch(e){setError(e instanceof Error?e.message:"Η αποθήκευση απέτυχε.");}
  finally{setSaving(false);}
 }
 return <section className="fiscal-panel fiscal-section">
  <h2>Προσομοίωση διπλογραφικής εγγραφής</h2>
  <p className="fiscal-muted">Μόνο τεχνητοί λογαριασμοί και δοκιμαστικά ποσά. Η αποθήκευση δημιουργεί αμετάβλητο στιγμιότυπο δοκιμής, όχι επίσημο βιβλίο, αναγνωρισμένη λογιστική εγγραφή ή παραστατικό.</p>
  <form onSubmit={calculate} className="fiscal-form" style={{maxWidth:"100%"}}>
   {entries.map((row,index)=><div key={index} className="fiscal-card" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12,alignItems:"end"}}>
    <label>Λογαριασμός · test
     <select value={row.account} disabled={saving} onChange={e=>edit(index,{account:e.target.value as FiscalSandboxAccount})}>
      {testAccounts.map(a=><option key={a.code} value={a.code}>{a.name}</option>)}
     </select>
    </label>
    <label>Κίνηση
     <select value={row.side} disabled={saving} onChange={e=>edit(index,{side:e.target.value as "debit"|"credit"})}>
      <option value="debit">Χρέωση</option><option value="credit">Πίστωση</option>
     </select>
    </label>
    <label>Ποσό EUR
     <input inputMode="decimal" value={row.amount} disabled={saving} onChange={e=>edit(index,{amount:e.target.value})} required/>
    </label>
    <button type="button" className="fiscal-button secondary" disabled={entries.length<=2||saving}
     onClick={()=>{setEntries(old=>old.filter((_,n)=>n!==index));invalidate();}}>Αφαίρεση</button>
   </div>)}
   <div className="fiscal-actions">
    <button type="button" className="fiscal-button secondary" disabled={entries.length>=8||saving}
     onClick={()=>{setEntries(old=>[...old,{account:"adjustment_test",side:"debit",amount:"1.00"}]);invalidate();}}>
     Προσθήκη γραμμής</button>
    <button type="submit" className="fiscal-button" disabled={busy||saving}>
     {busy?"Έλεγχος...":"Έλεγχος ισοσκέλισης"}</button>
   </div>
  </form>
  {error?<p className="fiscal-alert" role="alert">{error}</p>:null}
  {preview?<div role="status" className="fiscal-card fiscal-section">
   <h3>Ισοσκελισμένο δοκιμαστικό στιγμιότυπο</h3>
   <p>Χρεώσεις: <strong>{euro(preview.totalDebitMinor)}</strong> · Πιστώσεις: <strong>{euro(preview.totalCreditMinor)}</strong> · Διαφορά: <strong>{euro(preview.balanceMinor)}</strong></p>
   <p className="fiscal-alert">Δεν πραγματοποιήθηκε νόμιμη λογιστική καταχώριση, έκδοση ή διαβίβαση.</p>
   {organizationId?<div className="fiscal-actions">
    <button type="button" className="fiscal-button" disabled={!externalId||busy||saving||saved} onClick={save}>
     {saved?"Αποθηκεύτηκε ως test":saving?"Αποθήκευση...":"Αποθήκευση στιγμιότυπου"}</button>
    {saved?<span>Το ιστορικό εμφανίζεται μετά από ανανέωση της σελίδας.</span>:null}
   </div>:<p>Η αποθήκευση διατίθεται σε εγκεκριμένες επιχειρήσεις για ιδιοκτήτη ή λογιστή.</p>}
  </div>:null}
 </section>;
}
