"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveResearchVoices } from "../../../../../../lib/research-live-voices-preview";
import { ResearchVoiceOfGreece } from "../../ResearchVoiceOfGreece";

const API="/api/research/greek-retail-2026/results-preview-voices-live";
const REFRESH_MS=60_000;

export function LiveVoicesPreview({initial}:{initial:LiveResearchVoices|null}){
  const [snapshot,setSnapshot]=useState<LiveResearchVoices|null>(initial);
  const [failed,setFailed]=useState(!initial);
  const [refreshing,setRefreshing]=useState(false);

  const refresh=useCallback(async (signal?:AbortSignal)=>{
    setRefreshing(true);
    try {
      const response=await fetch(API,{credentials:"same-origin",cache:"no-store",signal});
      if(!response.ok) throw new Error("LIVE_VOICES_FAILED");
      const value:LiveResearchVoices & {schema:string}=await response.json();
      if(value.schema!=="kontamou.research.q18-internal-live-preview.v1"
          || !Number.isSafeInteger(value.eligibleQ18)
          || !Number.isSafeInteger(value.displayedQ18)
          || !Array.isArray(value.voices?.quotes)
          || !Array.isArray(value.voices?.categories)
          || !Array.isArray(value.voices?.geography)) {
        throw new Error("LIVE_VOICES_INVALID");
      }
      setSnapshot(value);setFailed(false);
    } catch(error) {
      if(!signal?.aborted) { setSnapshot(null);setFailed(true); }
    } finally {
      if(!signal?.aborted) setRefreshing(false);
    }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    const interval=window.setInterval(()=>{void refresh(controller.signal);},REFRESH_MS);
    return ()=>{window.clearInterval(interval);controller.abort();};
  },[refresh]);

  return <>
    <section style={{maxWidth:1200,margin:"16px auto 0",padding:"16px 22px",color:"#17482e"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:15,flexWrap:"wrap"}}>
        <div>
          <strong style={{fontSize:12,letterSpacing:".08em"}}>● LIVE · ΕΣΩΤΕΡΙΚΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗ Q18</strong>
          <p style={{fontSize:13,margin:"9px 0 5px"}}>
            {snapshot ? <>
              <b>{snapshot.eligibleQ18.toLocaleString("el-GR")}</b> επιλέξιμες απαντήσεις Q18 ·{" "}
              <b>{snapshot.displayedQ18.toLocaleString("el-GR")}</b> κατάλληλες για εσωτερική οπτική προβολή
            </>:"Δεν διατίθεται αυτή τη στιγμή επαληθευμένο στιγμιότυπο."}
          </p>
          <small style={{color:"#6b806e"}}>
            {snapshot?"Ενημερώθηκε: "+new Date(snapshot.capturedAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"medium"}):"Σύνδεση με την έρευνα μη διαθέσιμη"}
            {" · Αυτόματη ανανέωση κάθε 60 δευτερόλεπτα"}
          </small>
        </div>
        <button type="button" disabled={refreshing} onClick={()=>{void refresh();}}
          style={{background:"#20553a",color:"#fff",border:0,borderRadius:10,padding:"11px 17px",cursor:"pointer"}}>
          {refreshing?"Ανανέωση…":"Ανανέωση τώρα ↻"}
        </button>
      </div>
      <p style={{fontSize:12,lineHeight:1.6,padding:"12px 0",color:"#667c68"}}>
        Προσωρινά, μη σταθμισμένα δεδομένα. Αποκλείονται απαντήσεις με εκκρεμή έλεγχο, αποσυρμένες
        και μη ολοκληρωμένες. Η αυτόματη απομάκρυνση προφανών αναγνωριστικών
        <strong> δεν αποτελεί ανθρώπινη έγκριση δημοσίευσης</strong>.
      </p>
      {failed&&<p role="alert" style={{padding:14,background:"#fff3de",borderRadius:10}}>
        Η ζωντανή ανάκτηση απέτυχε. Δεν εμφανίζονται ούτε αποθηκευμένες ούτε ενδεικτικές φωνές.
      </p>}
    </section>
    <ResearchVoiceOfGreece isDemo={false} isLivePreview data={snapshot?.voices}/>
  </>;
}
