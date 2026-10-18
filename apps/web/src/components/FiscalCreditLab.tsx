"use client";

import {useMemo,useState} from "react";
import {previewFiscalCreditLab} from "../lib/fiscal-credit-lab";
import type {FiscalCreditLabRow} from "../lib/fiscal-credit-lab";
import type {FiscalTestCreditLane} from "../lib/fiscal-sandbox-credit-allocation";

const sample:readonly FiscalCreditLabRow[]=[
  {original:"50,00",previouslyCredited:"20,00",proposedCredit:"12,00"},
  {original:"25,00",previouslyCredited:"0",proposedCredit:"5,00"},
  {original:"12,50",previouslyCredited:"0",proposedCredit:"0"}
];
const lanes:ReadonlyArray<{id:FiscalTestCreditLane;label:string}>=[
  {id:"b2c",label:"B2C · Λιανική"},
  {id:"pos",label:"POS · Κατάστημα"},
  {id:"b2b",label:"B2B · Τιμολόγηση"},
  {id:"b2g",label:"B2G · Δημόσιο"}
];
const euro=(minor:string)=>new Intl.NumberFormat("el-GR",{
  style:"currency",currency:"EUR"
}).format(Number(minor)/100);
function errorMessage(code:string){
  switch(code){
    case "LAB_INVALID_AMOUNT":return "Συμπλήρωσε ποσά σε ευρώ με έως δύο δεκαδικά (π.χ. 12,50), χωρίς διαχωριστικά χιλιάδων.";
    case "LAB_OVERALLOCATED":case "CREDIT_OVERALLOCATED":
      return "Μια γραμμή ξεπερνά το διαθέσιμο ποσό της. Μείωσε την προηγούμενη ή τη νέα πίστωση.";
    case "LAB_EMPTY_PROPOSAL":return "Συμπλήρωσε ένα θετικό ποσό στη νέα δοκιμαστική πίστωση.";
    case "LAB_TOTAL_TOO_LARGE":return "Το συνολικό ποσό δοκιμής υπερβαίνει το επιτρεπόμενο όριο.";
    default:return "Δεν είναι δυνατή η προεπισκόπηση αυτών των δοκιμαστικών ποσών.";
  }
}

export function FiscalCreditLab(){
  const [lane,setLane]=useState<FiscalTestCreditLane>("b2c");
  const [rows,setRows]=useState<FiscalCreditLabRow[]>(()=>sample.map(r=>({...r})));
  const calculated=useMemo(()=>{
    try{return {preview:previewFiscalCreditLab({lane,rows}),error:""};}
    catch(error){return {preview:null,error:errorMessage(error instanceof Error?error.message:"")};}
  },[lane,rows]);
  function changeLine(index:number,field:keyof FiscalCreditLabRow,value:string){
    setRows(previous=>previous.map((line,i)=>i===index?{...line,[field]:value}:line));
  }
  return <section className="fiscal-panel fiscal-section" aria-labelledby="credit-lab-heading">
    <h2 id="credit-lab-heading">Προσομοίωση μερικής ή πλήρους πίστωσης</h2>
    <p className="fiscal-alert" role="status"><strong>Αποκλειστικά συνθετικά δεδομένα.</strong> Αυτή η προσομοίωση δεν συνδέεται με παραστατικά, πελάτες, πληρωμές, λογιστικά βιβλία ή την ΑΑΔΕ. Δεν αποθηκεύεται τίποτα και δεν εκδίδεται πιστωτικό.</p>
    <p className="fiscal-muted">Τροποποίησε τα παραδείγματα ανά γραμμή για να δεις πόσο μπορεί να πιστωθεί, χωρίς να ξεπεραστεί το αρχικό ποσό. Η «προηγούμενη πίστωση» είναι μόνο δοκιμαστικός αριθμός, όχι ανακτημένο ιστορικό.</p>
    <div className="fiscal-form" style={{maxWidth:420,marginBottom:20}}>
      <label>Κατηγορία δοκιμής
        <select value={lane} onChange={event=>setLane(event.target.value as FiscalTestCreditLane)}>
          {lanes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <div className="fiscal-credit-lab-head" aria-hidden="true">
      <strong>Γραμμή</strong><strong>Αρχική αξία (€)</strong><strong>Προηγούμενη (€)</strong>
      <strong>Νέα πίστωση (€)</strong><span />
    </div>
    <div className="fiscal-credit-lab-rows">
      {rows.map((line,index)=><fieldset key={index} className="fiscal-credit-lab-row">
        <legend>Γραμμή {index+1}</legend>
        <label>Αρχική αξία (€)
          <input inputMode="decimal" autoComplete="off" maxLength={17} value={line.original}
            onChange={event=>changeLine(index,"original",event.target.value)}/>
        </label>
        <label>Προηγούμενη πίστωση (€)
          <input inputMode="decimal" autoComplete="off" maxLength={17} value={line.previouslyCredited}
            onChange={event=>changeLine(index,"previouslyCredited",event.target.value)}/>
        </label>
        <label>Νέα πίστωση (€)
          <input inputMode="decimal" autoComplete="off" maxLength={17} value={line.proposedCredit}
            onChange={event=>changeLine(index,"proposedCredit",event.target.value)}/>
        </label>
        <button type="button" className="fiscal-button secondary" style={{color:"#10323c"}}
          disabled={rows.length===1}
          onClick={()=>setRows(previous=>previous.filter((_,i)=>i!==index))}
          aria-label={"Αφαίρεση γραμμής "+(index+1)}>Αφαίρεση</button>
      </fieldset>)}
    </div>
    <div className="fiscal-actions">
      <button type="button" className="fiscal-button"
        disabled={rows.length>=12}
        onClick={()=>setRows(previous=>[...previous,{original:"10,00",previouslyCredited:"0",proposedCredit:"0"}])}>
        + Προσθήκη γραμμής
      </button>
      <button type="button" className="fiscal-button secondary" style={{color:"#10323c"}}
        onClick={()=>{setLane("b2c");setRows(sample.map(row=>({...row})));}}>
        Επαναφορά παραδείγματος
      </button>
    </div>
    <div aria-live="polite" aria-atomic="true">
      {calculated.error?<p className="fiscal-error" role="alert">{calculated.error}</p>:
      calculated.preview?<div className="fiscal-section">
        <h3>Άμεση προεπισκόπηση · χωρίς αποθήκευση</h3>
        <div className="fiscal-preview-totals">
          <span>Αρχική δοκιμαστική αξία<strong>{euro(calculated.preview.totals.originalGrossMinor)}</strong></span>
          <span>Προηγούμενη δοκιμαστική πίστωση<strong>{euro(calculated.preview.totals.previouslyAllocatedMinor)}</strong></span>
          <span>Προτεινόμενη νέα πίστωση<strong>{euro(calculated.preview.totals.proposedCreditMinor)}</strong></span>
          <span>Υπολειπόμενο δοκιμαστικό ποσό<strong>{euro(calculated.preview.totals.remainingGrossMinor)}</strong></span>
        </div>
        <div style={{overflowX:"auto"}}>
          <table className="fiscal-table">
            <caption className="fiscal-muted" style={{textAlign:"left",padding:12}}>Υπόλοιπο ανά συνθετική γραμμή (EUR)</caption>
            <thead><tr><th scope="col">Γραμμή</th><th scope="col">Αρχικό</th><th scope="col">Προηγούμενο</th><th scope="col">Νέο</th><th scope="col">Υπόλοιπο</th></tr></thead>
            <tbody>{calculated.preview.rows.map(row=><tr key={row.lineNo}>
              <th scope="row">{row.lineNo}</th>
              <td>{euro(row.originalGrossMinor)}</td><td>{euro(row.previouslyAllocatedMinor)}</td>
              <td>{euro(row.proposedCreditMinor)}</td><td>{euro(row.remainingGrossMinor)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>:null}
    </div>
    <p className="fiscal-muted">Η λογική ελέγχει αποκλειστικά ακέραια λεπτά του ευρώ. Δεν υπολογίζει νόμιμες αντιστροφές ΦΠΑ, δεν ελέγχει πραγματικό ιστορικό, δεν καταχωρίζει επιστροφή χρημάτων και δεν παράγει επίσημο πιστωτικό.</p>
  </section>;
}
