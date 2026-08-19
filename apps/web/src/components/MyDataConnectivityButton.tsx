"use client";

import { useState } from "react";

type ConnectivityResponse={ok?:boolean;readOnly?:boolean;environment?:string;specVersion?:string;responseBytes?:number;error?:string};

export function MyDataConnectivityButton({csrfToken}:{csrfToken:string}){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [failed,setFailed]=useState(false);

  async function run(){
    setBusy(true);setMessage("");setFailed(false);
    try{
      const response=await fetch("/api/admin/tax/connectivity",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:"{}"});
      const data=await response.json() as ConnectivityResponse;
      if(!response.ok||!data.ok)throw new Error(data.error??"AADE connectivity check failed");
      setMessage(`AADE connection OK · ${data.environment??"unknown"} · spec ${data.specVersion??"unknown"} · read-only response ${data.responseBytes??0} bytes`);
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"AADE connectivity check failed");}
    finally{setBusy(false);}
  }

  return <span className="admin-action-wrap"><button type="button" className="button button-secondary" onClick={run} disabled={busy}>{busy?"Checking AADE…":"Test AADE connection"}</button>{message&&<small className={failed?"form-error":"workspace-inline-note"} role="status">{message}</small>}</span>;
}
