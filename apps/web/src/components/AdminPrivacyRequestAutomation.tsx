"use client";

import { useMemo, useState } from "react";

type Props = Readonly<{
  csrfToken:string;
  requestId:string;
  requestType:string;
  status:string;
  customerId:string;
  details:Record<string,unknown>;
  outcome:Record<string,unknown>;
  responsePreview:string;
}>;

function objectValue(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}

export function AdminPrivacyRequestAutomation({csrfToken,requestId,requestType,status,customerId,details,outcome,responsePreview}:Props){
  const automation=objectValue(outcome.automation);
  const response=objectValue(outcome.response);
  const requestedCorrection=objectValue(details.correction);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState(responsePreview);
  const [correction,setCorrection]=useState({
    firstName:typeof requestedCorrection.firstName==="string"?requestedCorrection.firstName:"",
    lastName:typeof requestedCorrection.lastName==="string"?requestedCorrection.lastName:"",
    phone:typeof requestedCorrection.phone==="string"?requestedCorrection.phone:"",
    preferredLocale:typeof requestedCorrection.preferredLocale==="string"?requestedCorrection.preferredLocale:""
  });
  const terminal=["completed","partially_completed","cancelled"].includes(status);
  const completedTerminal=["completed","partially_completed"].includes(status);
  const hasExecution=Object.keys(automation).length>0;
  const responseSent=Object.keys(response).length>0;
  const reportAvailable=["access","export"].includes(requestType)&&(hasExecution||completedTerminal);

  const executeLabel=useMemo(()=>{
    switch(requestType){
      case "access":return "Prepare access report";
      case "export":return "Prepare portable export";
      case "correction":return "Apply account correction";
      case "deletion":return "Erase non-essential data";
      case "restriction":return "Apply processing restriction";
      case "objection":return "Apply objection";
      case "marketing_withdrawal":return "Withdraw marketing";
      case "account_closure":return "Prepare account closure";
      default:return "Process automatically";
    }
  },[requestType]);

  async function post(url:string,body:Record<string,unknown>,key:string){
    if(busy)return;setBusy(key);setError("");
    try{
      const res=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(body)});
      const payload=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(payload.error||"Η ενέργεια απέτυχε.");
      window.location.reload();
    }catch(cause){setError(cause instanceof Error?cause.message:"Η ενέργεια απέτυχε.");setBusy("");}
  }

  function execute(){
    const destructive=["deletion","restriction","account_closure"].includes(requestType);
    if(destructive&&!window.confirm(`Επιβεβαίωση GDPR ενέργειας: ${executeLabel};`))return;
    const correctionPayload=requestType==="correction"?{
      firstName:correction.firstName||undefined,lastName:correction.lastName||undefined,phone:correction.phone||undefined,
      preferredLocale:correction.preferredLocale||undefined
    }:undefined;
    void post("/api/admin/privacy/execute",{requestId,correction:correctionPayload},"execute");
  }

  function respond(){
    if(!window.confirm("Να σταλεί τώρα η τελική απάντηση με email στον πελάτη και να κλείσει το GDPR αίτημα;"))return;
    void post("/api/admin/privacy/respond",{requestId,message},"respond");
  }

  return <div className="admin-privacy-automation">
    {requestType==="correction"&&!terminal&&<div className="admin-privacy-correction">
      <strong>Account correction</strong>
      <div className="admin-privacy-fields">
        <label><span>Όνομα</span><input value={correction.firstName} onChange={(e)=>setCorrection({...correction,firstName:e.target.value})}/></label>
        <label><span>Επώνυμο</span><input value={correction.lastName} onChange={(e)=>setCorrection({...correction,lastName:e.target.value})}/></label>
        <label><span>Τηλέφωνο</span><input value={correction.phone} onChange={(e)=>setCorrection({...correction,phone:e.target.value})}/></label>
        <label><span>Γλώσσα</span><select value={correction.preferredLocale} onChange={(e)=>setCorrection({...correction,preferredLocale:e.target.value})}><option value="">Keep current</option><option value="el">Ελληνικά</option><option value="en">English</option></select></label>
      </div>
      <small>Το email δεν αλλάζει από GDPR correction εδώ· χρησιμοποιείται η ασφαλής verified-email flow του λογαριασμού.</small>
    </div>}

    <div className="admin-privacy-action-row">
      {!terminal&&<button type="button" className="button" disabled={Boolean(busy)||hasExecution} onClick={execute}>{busy==="execute"?"Processing…":hasExecution?"Operation prepared / executed":executeLabel}</button>}
      <a className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customerId)}`}>Customer 360</a>
      {reportAvailable&&<>
        <a className="button button-secondary" href={`/api/admin/privacy/report?requestId=${encodeURIComponent(requestId)}&format=pdf`}>PDF report</a>
        <a className="button button-secondary" href={`/api/admin/privacy/report?requestId=${encodeURIComponent(requestId)}&format=json`}>JSON export</a>
      </>}
    </div>

    {hasExecution&&!terminal&&!responseSent&&<div className="admin-privacy-response">
      <div><strong>Manual customer response</strong><small>Το email δεν αποστέλλεται αυτόματα. Έλεγξε/τροποποίησε το κείμενο και επιβεβαίωσε την αποστολή.</small></div>
      <textarea rows={7} value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={10000}/>
      <button type="button" className="button" disabled={Boolean(busy)||message.trim().length<10} onClick={respond}>{busy==="respond"?"Sending…":"Send response & close request"}</button>
    </div>}

    {responseSent&&<div className="workspace-inline-note"><strong>Response sent.</strong> Η τελική επικοινωνία καταγράφηκε και το linked support case επιλύθηκε.</div>}
    {error&&<p className="account-action-error" role="alert">{error}</p>}
  </div>;
}
