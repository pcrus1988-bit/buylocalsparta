"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { VENDOR_FEED_FIELDS, type VendorFeedField, type VendorFeedMapping } from "../lib/vendor-product-feed-xml";

type Analysis=Readonly<{
  detectedFormat:string;
  fields:readonly string[];
  mapping:VendorFeedMapping;
  productCount:number;
  readyCount:number;
  warningCount:number;
  errorCount:number;
  excludedCount:number;
  items:readonly Readonly<{
    externalProductId:string;title:string;brand?:string;priceMinor?:number;stockQuantity?:number;state:string;issues:readonly Readonly<{message:string}>[];
  }>[];
  truncatedPreview:boolean;
}>;

type Feed=Readonly<{
  id:string;name:string;sourceKind:"upload"|"url";sourceUrl?:string;sourceFilename?:string;status:"active"|"paused"|"error";
  detectedFormat:string;mapping:VendorFeedMapping;observedFields:readonly string[];syncIntervalMinutes:number;missingGraceRuns:number;
  productCount:number;readyCount:number;warningCount:number;errorCount:number;excludedCount:number;
  lastSyncStartedAt?:number;lastSyncCompletedAt?:number;nextSyncAt?:number;lastError?:string;consecutiveFailures:number;
}>;
type Run=Readonly<{id:string;feedId:string;feedName:string;triggerType:string;status:string;productCount:number;readyCount:number;warningCount:number;errorCount:number;excludedCount:number;newCount:number;updatedCount:number;missingCount:number;linkedOfferCount:number;submissionCount:number;error?:string;startedAt:number;completedAt?:number}>;
type Issue=Readonly<{feedId:string;externalProductId:string;title:string;state:string;messages:readonly Readonly<{message?:string;code?:string}>[];vendorSku?:string;gtin?:string;categoryPath?:string;updatedAt:number}>;
type Workspace=Readonly<{csrfToken:string;feeds:readonly Feed[];runs:readonly Run[];issues:readonly Issue[]}>;
type Props=Readonly<{initialWorkspace:Workspace;canImport:boolean}>;

const FIELD_LABELS:Record<VendorFeedField,string>={
  id:"Product ID / SKU",title:"Τίτλος",description:"Περιγραφή",price:"Τιμή πώλησης",currency:"Νόμισμα",
  stock:"Απόθεμα",availability:"Διαθεσιμότητα",brand:"Brand",category:"Κατηγορία",image:"Κύρια εικόνα",
  additional_image:"Επιπλέον εικόνες",gtin:"EAN / GTIN",mpn:"MPN / μοντέλο",link:"Product URL",size:"Μέγεθος",color:"Χρώμα"
};

const when=(value?:number)=>value?new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—";
const money=(minor?:number)=>minor===undefined?"—":new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);

export function VendorProductFeedClient({initialWorkspace,canImport}:Props){
  const router=useRouter();
  const [workspace,setWorkspace]=useState(initialWorkspace);
  const [tab,setTab]=useState<"feeds"|"connect"|"issues"|"history">(initialWorkspace.feeds.length?"feeds":"connect");
  const [sourceKind,setSourceKind]=useState<"upload"|"url">("url");
  const [feedName,setFeedName]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [sourceFilename,setSourceFilename]=useState("");
  const [xml,setXml]=useState("");
  const [interval,setInterval]=useState<60|180|360|1440>(360);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [mapping,setMapping]=useState<VendorFeedMapping>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const issueCounts=useMemo(()=>({
    errors:workspace.issues.filter((item)=>item.state==="error").length,
    missing:workspace.issues.filter((item)=>item.state==="missing").length,
    warnings:workspace.issues.filter((item)=>item.state==="warning").length
  }),[workspace.issues]);

  async function readFile(file:File){
    if(!file.name.toLowerCase().endsWith(".xml"))throw new Error("Επίλεξε αρχείο .xml");
    if(file.size>25*1024*1024)throw new Error("Το XML δεν μπορεί να ξεπερνά τα 25 MB.");
    setSourceFilename(file.name);
    setXml(await file.text());
    setAnalysis(null);
  }

  async function analyse(){
    setBusy("analyse");setError("");setNotice("");
    try{
      const response=await fetch("/api/vendor/catalog/feed/analyze",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},body:JSON.stringify({sourceKind,sourceUrl,xml,mapping})});
      const payload=await response.json() as Analysis&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Η ανάλυση απέτυχε.");
      setAnalysis(payload);setMapping(payload.mapping);
      if(!feedName)setFeedName(sourceKind==="url"?(new URL(sourceUrl).hostname||"Product Feed"):(sourceFilename||"Product Feed"));
    }catch(cause){setError(cause instanceof Error?cause.message:"Η ανάλυση απέτυχε.");}
    finally{setBusy("");}
  }

  async function connect(){
    if(!analysis)return;
    setBusy("connect");setError("");setNotice("");
    try{
      const response=await fetch("/api/vendor/catalog/feed",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},body:JSON.stringify({name:feedName,sourceKind,sourceUrl,sourceFilename,xml,mapping,syncIntervalMinutes:interval})});
      const payload=await response.json() as Workspace&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Η σύνδεση απέτυχε.");
      setWorkspace(payload);setTab("feeds");setAnalysis(null);setXml("");setSourceFilename("");setFeedName("");setNotice("Το feed συνδέθηκε και η πρώτη εισαγωγή ολοκληρώθηκε.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Η σύνδεση απέτυχε.");}
    finally{setBusy("");}
  }

  async function patchFeed(feed:Feed,body:Record<string,unknown>){
    setBusy(feed.id);setError("");setNotice("");
    try{
      const response=await fetch(`/api/vendor/catalog/feed/${encodeURIComponent(feed.id)}`,{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},body:JSON.stringify(body)});
      const payload=await response.json() as Workspace&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Η αλλαγή δεν αποθηκεύτηκε.");
      setWorkspace(payload);setNotice("Οι ρυθμίσεις του feed ενημερώθηκαν.");router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Η αλλαγή δεν αποθηκεύτηκε.");}
    finally{setBusy("");}
  }

  async function sync(feed:Feed,replacementXml?:string){
    setBusy(`sync:${feed.id}`);setError("");setNotice("");
    try{
      const response=await fetch(`/api/vendor/catalog/feed/${encodeURIComponent(feed.id)}/sync`,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":workspace.csrfToken},body:JSON.stringify(replacementXml?{xml:replacementXml}:{})});
      const payload=await response.json() as Workspace&{error?:string};
      if(!response.ok)throw new Error(payload.error??"Ο συγχρονισμός απέτυχε.");
      setWorkspace(payload);setNotice(`Ο συγχρονισμός του ${feed.name} ολοκληρώθηκε.`);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Ο συγχρονισμός απέτυχε.");}
    finally{setBusy("");}
  }

  return <section className="shell vendor-section">
    <div className="workspace-action-bar" style={{alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className={`button ${tab==="feeds"?"button-primary":"button-secondary"}`} type="button" onClick={()=>setTab("feeds")}>Τα feeds μου ({workspace.feeds.length})</button>
        {canImport&&<button className={`button ${tab==="connect"?"button-primary":"button-secondary"}`} type="button" onClick={()=>setTab("connect")}>+ Σύνδεση feed</button>}
        <button className={`button ${tab==="issues"?"button-primary":"button-secondary"}`} type="button" onClick={()=>setTab("issues")}>Έλεγχοι ({workspace.issues.length})</button>
        <button className={`button ${tab==="history"?"button-primary":"button-secondary"}`} type="button" onClick={()=>setTab("history")}>Ιστορικό</button>
      </div>
    </div>

    {error&&<div className="form-error vendor-error" role="alert" style={{marginTop:14}}><strong>Προσοχή.</strong> {error}</div>}
    {notice&&<div className="workspace-inline-note" role="status" style={{marginTop:14}}><strong>{notice}</strong></div>}

    {tab==="connect"&&canImport&&<div style={{display:"grid",gap:18,marginTop:20}}>
      <div>
        <div className="eyebrow">1 · Πηγή</div><h2 style={{marginTop:6}}>Σύνδεσε το catalogue σου</h2>
        <p>Δέχεσαι οποιοδήποτε λογικό XML. Google Merchant/RSS και κοινές ecommerce δομές αναγνωρίζονται αυτόματα· custom feeds ανοίγουν mapping.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        <button type="button" onClick={()=>{setSourceKind("url");setAnalysis(null);}} style={choiceStyle(sourceKind==="url")}><strong>🔗 XML URL</strong><span>Μόνιμη σύνδεση + αυτόματος συγχρονισμός</span></button>
        <label style={choiceStyle(sourceKind==="upload")} onClick={()=>{setSourceKind("upload");setAnalysis(null);}}>
          <strong>⬆️ Upload XML</strong><span>{sourceFilename||"Χειροκίνητο αρχείο .xml έως 25 MB"}</span>
          <input type="file" accept=".xml,text/xml,application/xml" style={{marginTop:10}} onChange={async(e)=>{const file=e.currentTarget.files?.[0];if(!file)return;try{await readFile(file);}catch(cause){setError(cause instanceof Error?cause.message:"Δεν διαβάστηκε το αρχείο.");}}}/>
        </label>
      </div>
      {sourceKind==="url"&&<label style={fieldStyle}><span>XML feed URL</span><input value={sourceUrl} onChange={(e)=>{setSourceUrl(e.currentTarget.value);setAnalysis(null);}} placeholder="https://vendor.gr/products.xml" /></label>}
      <div className="workspace-form-actions"><button className="button button-primary" type="button" disabled={busy==="analyse"||(sourceKind==="url"?!sourceUrl:!xml)} onClick={analyse}>{busy==="analyse"?"Ανάλυση…":"Ανάλυση XML"}</button></div>

      {analysis&&<>
        <div><div className="eyebrow">2 · Ανάλυση</div><h2 style={{marginTop:6}}>Εντοπίστηκαν {analysis.productCount.toLocaleString("el-GR")} προϊόντα</h2><p>Μορφή: <strong>{analysis.detectedFormat}</strong>. Έλεγξε μόνο τα πεδία που δεν αναγνωρίστηκαν σωστά.</p></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
          <Metric label="Ready" value={analysis.readyCount} />
          <Metric label="Warnings" value={analysis.warningCount} />
          <Metric label="Errors" value={analysis.errorCount} />
          <Metric label="Excluded" value={analysis.excludedCount} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
          {VENDOR_FEED_FIELDS.map((target)=><label key={target} style={fieldStyle}><span>{FIELD_LABELS[target]}{(target==="id"||target==="title")&&" *"}</span><select value={mapping[target]??""} onChange={(e)=>setMapping((current)=>({...current,[target]:e.currentTarget.value||undefined}))}><option value="">— Δεν υπάρχει —</option>{analysis.fields.map((field)=><option key={field} value={field}>{field}</option>)}</select></label>)}
        </div>
        <div className="workspace-form-actions"><button className="button button-secondary" type="button" onClick={analyse} disabled={busy==="analyse"}>Επανέλεγχος mapping</button></div>

        <div><div className="eyebrow">3 · Preview</div><h3>Δείγμα προϊόντων</h3></div>
        <div style={{overflowX:"auto",border:"1px solid var(--line,#d8dfda)",borderRadius:14}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
            <thead><tr><th style={cellStyle}>Κατάσταση</th><th style={cellStyle}>ID</th><th style={cellStyle}>Προϊόν</th><th style={cellStyle}>Brand</th><th style={cellStyle}>Τιμή</th><th style={cellStyle}>Stock</th><th style={cellStyle}>Παρατηρήσεις</th></tr></thead>
            <tbody>{analysis.items.slice(0,25).map((item,index)=><tr key={`${item.externalProductId}-${index}`}><td style={cellStyle}><span className="status-pill">{item.state}</span></td><td style={cellStyle}>{item.externalProductId||"—"}</td><td style={cellStyle}><strong>{item.title||"—"}</strong></td><td style={cellStyle}>{item.brand||"—"}</td><td style={cellStyle}>{money(item.priceMinor)}</td><td style={cellStyle}>{item.stockQuantity??"—"}</td><td style={cellStyle}>{item.issues.map((issue)=>issue.message).join(" · ")||"OK"}</td></tr>)}</tbody>
          </table>
        </div>

        <div><div className="eyebrow">4 · Σύνδεση</div><h3>Αποθήκευση & συγχρονισμός</h3></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
          <label style={fieldStyle}><span>Όνομα feed</span><input value={feedName} onChange={(e)=>setFeedName(e.currentTarget.value)} placeholder="Κύριο e-shop feed" /></label>
          {sourceKind==="url"&&<label style={fieldStyle}><span>Συχνότητα</span><select value={interval} onChange={(e)=>setInterval(Number(e.currentTarget.value) as 60|180|360|1440)}><option value={60}>Κάθε ώρα</option><option value={180}>Κάθε 3 ώρες</option><option value={360}>Κάθε 6 ώρες</option><option value={1440}>Καθημερινά</option></select></label>}
        </div>
        <div className="workspace-inline-note"><strong>Ασφάλεια:</strong> κανένα malformed προϊόν δεν δημοσιεύεται τυφλά. Existing canonical matches επαναχρησιμοποιούνται· ασαφή προϊόντα μένουν στο governed review path.</div>
        <div className="workspace-form-actions"><button className="button button-primary" type="button" disabled={busy==="connect"||!feedName||!mapping.id||!mapping.title} onClick={connect}>{busy==="connect"?"Σύνδεση…":"Σύνδεση & εισαγωγή προϊόντων"}</button></div>
      </>}
    </div>}

    {tab==="feeds"&&<div style={{display:"grid",gap:14,marginTop:20}}>
      {workspace.feeds.length===0?<div className="workspace-inline-note">Δεν έχεις ακόμη συνδεδεμένο product feed.</div>:workspace.feeds.map((feed)=><article key={feed.id} className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{feed.name}</strong><small>{feed.sourceKind==="url"?(feed.sourceUrl||"XML URL"):(feed.sourceFilename||"Uploaded XML")} · {feed.detectedFormat}</small></div><span className="status-pill">{feed.status}</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginTop:12}}>
          <Metric label="Products" value={feed.productCount}/><Metric label="Ready" value={feed.readyCount}/><Metric label="Warnings" value={feed.warningCount}/><Metric label="Errors" value={feed.errorCount}/>
        </div>
        <div className="workspace-compact-list" style={{marginTop:12}}>
          <div className="workspace-compact-row"><strong>Τελευταίο sync</strong><span>{when(feed.lastSyncCompletedAt)}</span></div>
          {feed.sourceKind==="url"&&<div className="workspace-compact-row"><strong>Επόμενο sync</strong><span>{feed.status==="paused"?"Paused":when(feed.nextSyncAt)}</span></div>}
          {feed.lastError&&<div className="workspace-compact-row"><strong>Τελευταίο error</strong><span>{feed.lastError}</span></div>}
        </div>
        {canImport&&<div className="workspace-form-actions" style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
          {feed.sourceKind==="url"?<button className="button button-primary" type="button" disabled={busy===`sync:${feed.id}`||feed.status==="paused"} onClick={()=>sync(feed)}>{busy===`sync:${feed.id}`?"Sync…":"Sync now"}</button>:<label className="button button-primary" style={{cursor:"pointer"}}>{busy===`sync:${feed.id}`?"Sync…":"Νέο XML"}<input type="file" accept=".xml,text/xml,application/xml" hidden disabled={busy===`sync:${feed.id}`} onChange={async(e)=>{const file=e.currentTarget.files?.[0];if(!file)return;if(file.size>25*1024*1024){setError("Το XML δεν μπορεί να ξεπερνά τα 25 MB.");return;}await sync(feed,await file.text());}}/></label>}
          <button className="button button-secondary" type="button" disabled={busy===feed.id} onClick={()=>patchFeed(feed,{status:feed.status==="paused"?"active":"paused"})}>{feed.status==="paused"?"Resume":"Pause"}</button>
          {feed.sourceKind==="url"&&<label style={{display:"inline-flex",alignItems:"center",gap:6}}>Sync <select value={feed.syncIntervalMinutes} disabled={busy===feed.id} onChange={(e)=>patchFeed(feed,{syncIntervalMinutes:Number(e.currentTarget.value)})}><option value={60}>1h</option><option value={180}>3h</option><option value={360}>6h</option><option value={1440}>24h</option></select></label>}
        </div>}
      </article>)}
    </div>}

    {tab==="issues"&&<div style={{display:"grid",gap:14,marginTop:20}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(120px,1fr))",gap:10}}><Metric label="Errors" value={issueCounts.errors}/><Metric label="Missing" value={issueCounts.missing}/><Metric label="Warnings" value={issueCounts.warnings}/></div>
      {workspace.issues.length===0?<div className="workspace-inline-note"><strong>Δεν υπάρχουν ενεργά feed issues.</strong></div>:workspace.issues.map((item)=><article className="workspace-queue-card" key={`${item.feedId}:${item.externalProductId}`}><div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{item.externalProductId}{item.gtin?` · GTIN ${item.gtin}`:""}{item.categoryPath?` · ${item.categoryPath}`:""}</small></div><span className="status-pill">{item.state}</span></div><p style={{marginBottom:0}}>{item.messages.map((message)=>message.message).filter(Boolean).join(" · ")||"Το προϊόν χρειάζεται έλεγχο."}</p></article>)}
    </div>}

    {tab==="history"&&<div style={{display:"grid",gap:12,marginTop:20}}>
      {workspace.runs.length===0?<div className="workspace-inline-note">Δεν υπάρχει ακόμη ιστορικό συγχρονισμών.</div>:workspace.runs.map((run)=><article className="workspace-queue-card" key={run.id}><div className="workspace-queue-head"><div><strong>{run.feedName}</strong><small>{when(run.startedAt)} · {run.triggerType}</small></div><span className="status-pill">{run.status}</span></div><div className="workspace-queue-primary"><span>{run.productCount} products</span><span>{run.newCount} new</span><span>{run.updatedCount} updated</span><span>{run.missingCount} missing</span><span>{run.linkedOfferCount} linked offers</span><span>{run.submissionCount} submissions</span></div>{run.error&&<p>{run.error}</p>}</article>)}
    </div>}
  </section>;
}

function Metric({label,value}:{label:string;value:number}){return <div style={{padding:"12px 14px",border:"1px solid var(--line,#d8dfda)",borderRadius:12,background:"var(--surface,#fff)"}}><span style={{display:"block",fontSize:12,opacity:.7}}>{label}</span><strong style={{fontSize:20}}>{value.toLocaleString("el-GR")}</strong></div>;}
const fieldStyle:CSSProperties={display:"grid",gap:6};
const cellStyle:CSSProperties={padding:"10px 12px",borderBottom:"1px solid var(--line,#e2e8f0)",textAlign:"left",verticalAlign:"top",fontSize:13};
function choiceStyle(active:boolean):CSSProperties{return {display:"grid",gap:6,textAlign:"left",padding:18,borderRadius:16,border:active?"2px solid currentColor":"1px solid var(--line,#d8dfda)",background:"var(--surface,#fff)",cursor:"pointer",color:"inherit"};}
