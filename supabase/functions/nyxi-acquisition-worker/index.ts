const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=Deno.env.get("NYXI_COLLECTOR_INTERNAL_TOKEN");const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json"}});const sha=async(s)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");Deno.serve(async(req)=>{if(req.method!=="POST")return json({error:"method_not_allowed"},405);if(!url||!key||!token)return json({error:"missing_managed_secret"},503);const bearer=req.headers.get("x-nyxi-scheduler-token")||"";if(!/^[a-f0-9]{64}$/.test(bearer))return json({error:"unauthorized"},401);const auth=await fetch(url+"/rest/v1/nyxi_worker_scheduler_auth?id=eq.1&select=token_sha256",{headers:{authorization:"Bearer "+key,apikey:key}});if(!auth.ok)return json({error:"auth_lookup_failed"},503);const expected=(await auth.json())?.[0]?.token_sha256||"";const actual=await sha(bearer);let diff=expected.length^actual.length;for(let i=0;i<64;i++)diff|=(expected.charCodeAt(i)||0)^(actual.charCodeAt(i)||0);if(diff!==0)return json({error:"unauthorized"},401);const now=new Date().toISOString();const query="/rest/v1/nyxi_asset_acquisition_approvals?select=id,source_id,asset_url,metadata,expires_at,review_due_at&acquisition_authorized=eq.true&expires_at=gt."+encodeURIComponent(now)+"&review_due_at=gt."+encodeURIComponent(now)+"&order=approved_at.asc&limit=500";const res=await fetch(url+query,{headers:{authorization:"Bearer "+key,apikey:key}});if(!res.ok)return json({error:"approved_queue_lookup_failed",http_status:res.status},503);const allApproved=await res.json();
const since=new Date(Date.now()-24*60*60*1000).toISOString();
const recentResponse=await fetch(url+"/rest/v1/nyxi_source_snapshots?select=source_id,fetched_at&fetched_at=gte."+encodeURIComponent(since)+"&order=fetched_at.desc&limit=1000",{headers:{authorization:"Bearer "+key,apikey:key}});
if(!recentResponse.ok)return json({error:"recent_capture_lookup_failed",http_status:recentResponse.status},503);
const recentCaptured=new Set((await recentResponse.json()).map(x=>x.source_id));
const hostUsed=new Set();
const due=[];
for(const a of allApproved){
  if(recentCaptured.has(a.source_id))continue;
  if(a.metadata?.next_attempt_after&&Date.parse(a.metadata.next_attempt_after)>Date.now())continue;
  if(a.metadata?.needs_manual_access_review===true)continue; // Stop after access restrictions; do not bypass site controls.
  let host;try{const u=new URL(a.asset_url);if(u.protocol!=="https:")continue;host=u.hostname;}catch{continue;}
  if(hostUsed.has(host))continue;
  hostUsed.add(host);
  due.push(a);
  if(due.length>=8)break;
}
const sanitizedDetail=(v)=>typeof v==="string" ? v.replace(/Bearer\s+\S+/gi,"Bearer [redacted]").replace(/[a-f0-9]{64}/gi,"[redacted-hex]").slice(0,200) : null;
const approved=due;const results=[];for(const item of approved){try{const r=await fetch(url+"/functions/v1/nyxi-evidence-collector",{method:"POST",headers:{authorization:"Bearer "+key,apikey:key,"x-nyxi-collector-token":token,"content-type":"application/json"},body:JSON.stringify({approval_id:item.id}),signal:AbortSignal.timeout(25000)});const data=await r.json().catch(()=>({error:"invalid_response"}));const diagnostic=r.status>=400 ? sanitizedDetail(data.detail||data.location||null) : null;const upstreamCode=Number.isInteger(data.status)?data.status:null;
results.push({approval_id:item.id,source_id:item.source_id,http_status:r.status,status:data.status||null,error:data.error||null,error_detail:diagnostic,snapshot_id:data.snapshot_id||null});
if(r.status>=400&&data.error!=="crawl_delay"){
  const attempts=Number.isFinite(Number(item.metadata?.collector_failure_count))?Math.max(0,Math.min(30,Number(item.metadata?.collector_failure_count)))+1:1;
  const failureClass=upstreamCode===401||upstreamCode===403?"upstream_access_denied":
    upstreamCode===404||upstreamCode===410?"upstream_missing_or_moved":
    data.error==="redirect_rejected"||data.error==="final_url_mismatch"?"unapproved_redirect_or_origin":
    data.error==="collector_error"?"upstream_network_or_tls":
    data.error==="upstream_status"&&upstreamCode!==null?"upstream_http_error":"collector_internal_error";
  const requiresReview=["upstream_access_denied","upstream_missing_or_moved","unapproved_redirect_or_origin"].includes(failureClass)||attempts>=3;
  const nextDelayMs=r.status===429?60*60*1000:24*60*60*1000;
  const metadata={...(item.metadata||{}),last_worker_attempt_at:new Date().toISOString(),
    last_worker_error:String(data.error||"http_"+r.status).slice(0,100),
    last_worker_error_detail:diagnostic,
    last_worker_http_status:r.status,
    last_worker_upstream_http_status:upstreamCode,
    last_worker_failure_class:failureClass,
    collector_failure_count:attempts,
    needs_manual_access_review:requiresReview,
    manual_access_review_reason:requiresReview?(upstreamCode===403?"upstream_403_do_not_bypass":failureClass):null,
    next_attempt_after:new Date(Date.now()+nextDelayMs).toISOString()};
  await fetch(url+"/rest/v1/nyxi_asset_acquisition_approvals?id=eq."+item.id,{method:"PATCH",headers:{authorization:"Bearer "+key,apikey:key,"Content-Type":"application/json"},body:JSON.stringify({metadata})});
}}catch(e){
  const attempts=Number.isFinite(Number(item.metadata?.collector_failure_count))
    ?Math.max(0,Math.min(30,Number(item.metadata?.collector_failure_count)))+1:1;
  const metadata={...(item.metadata||{}),last_worker_attempt_at:new Date().toISOString(),
    last_worker_error:"collector_call_error",
    last_worker_error_detail:sanitizedDetail(String(e)),
    last_worker_failure_class:"collector_call_error",
    last_worker_http_status:null,last_worker_upstream_http_status:null,
    collector_failure_count:attempts,
    needs_manual_access_review:attempts>=3,
    manual_access_review_reason:attempts>=3?"collector_repeated_error_review":null,
    next_attempt_after:new Date(Date.now()+24*60*60*1000).toISOString()};
  try{await fetch(url+"/rest/v1/nyxi_asset_acquisition_approvals?id=eq."+item.id,{
    method:"PATCH",headers:{authorization:"Bearer "+key,apikey:key,"Content-Type":"application/json"},
    body:JSON.stringify({metadata})
  });}catch{ /* Log-only failure: never leak secrets or bypass source controls */ }
  results.push({approval_id:item.id,error:"collector_call_error",manual_review:attempts>=3});
}}// Fail-closed HTML extraction recovery. A source's capture authorization never grants publication rights.
const recordHtmlFailure=async(row,reason,httpStatus)=>{
  const failures=Math.min(50,Math.max(0,Number(row.metadata?.html_failure_count)||0)+1);
  const terminal=["empty_extraction","unsupported_format","integrity_mismatch","snapshot_missing"].includes(reason);
  const needsReview=terminal||failures>=5;
  const now=new Date().toISOString();
  const metadata={
    ...(row.metadata||{}),
    html_failure_count:failures,
    html_last_error:String(reason||"unknown_extraction_failure").slice(0,90),
    html_last_http_status:httpStatus,
    html_last_attempt_at:now,
    html_manual_review_required:needsReview,
    html_next_attempt_after:needsReview?null:new Date(Date.now()+6*60*60*1000).toISOString()
  };
  const patch={
    metadata,
    ...(needsReview?{extraction_status:"manual_review_required"}:{})
  };
  // Never overwrite a snapshot whose lifecycle another worker already advanced.
  const saved=await fetch(url+"/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+row.snapshot_id+"&extraction_status=eq.ready",{
    method:"PATCH",headers:{authorization:"Bearer "+key,apikey:key,"content-type":"application/json"},
    body:JSON.stringify(patch)
  });
  return {saved:saved.ok,manual_review_required:needsReview,retry_after:metadata.html_next_attempt_after};
};
const extraction=[];let extractedThisRun=0;
const m=await fetch(url+"/rest/v1/nyxi_corpus_manifest?select=snapshot_id,metadata&extraction_status=eq.ready&order=created_at.desc&limit=300",{headers:{authorization:"Bearer "+key,apikey:key}});
if(m.ok){
  const pending=(await m.json()).filter(row=>!row.metadata?.html_manual_review_required&&
    (!row.metadata?.html_next_attempt_after||Date.parse(row.metadata.html_next_attempt_after)<=Date.now()));
  for(const row of pending){
    if(extractedThisRun>=4)break;
    try{
      const done=await fetch(url+"/rest/v1/nyxi_extraction_runs?snapshot_id=eq."+row.snapshot_id+"&status=eq.complete&select=id&limit=1",{headers:{authorization:"Bearer "+key,apikey:key}});
      if(!done.ok){extraction.push({snapshot_id:row.snapshot_id,error:"completion_lookup_failed",http_status:done.status});continue;}
      if((await done.json()).length){
        const reconciled=await fetch(url+"/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+row.snapshot_id+"&extraction_status=eq.ready",{
          method:"PATCH",headers:{authorization:"Bearer "+key,apikey:key,"content-type":"application/json"},
          body:JSON.stringify({extraction_status:"complete"})
        });
        extraction.push({snapshot_id:row.snapshot_id,status:reconciled.ok?"already_completed":"reconciliation_failed"});
        continue;
      }
      extractedThisRun++;
      const e=await fetch(url+"/functions/v1/nyxi-private-extractor",{
        method:"POST",headers:{authorization:"Bearer "+key,apikey:key,"x-nyxi-scheduler-token":bearer,"content-type":"application/json"},
        body:JSON.stringify({snapshot_id:row.snapshot_id,dry_run:false}),signal:AbortSignal.timeout(25000)
      });
      const result=await e.json().catch(()=>({error:"invalid_response"}));
      const item={snapshot_id:row.snapshot_id,http_status:e.status,status:result.status||null,
        error:result.error||null,run_id:result.run_id||null,fragments:result.fragments||0};
      if(!e.ok){
        const recovery=await recordHtmlFailure(row,String(result.error||"http_"+e.status),e.status);
        item.manual_review_required=recovery.manual_review_required;
        item.state_recorded=recovery.saved;
        item.retry_after=recovery.retry_after;
      }
      extraction.push(item);
    }catch{
      // Transient worker/transport error: do not hot-loop the same snapshot every ten minutes.
      const recovery=await recordHtmlFailure(row,"html_worker_transport_failure",null).catch(()=>({saved:false,manual_review_required:false}));
      extraction.push({snapshot_id:row.snapshot_id,error:"html_worker_transport_failure",
        state_recorded:recovery.saved,manual_review_required:recovery.manual_review_required});
    }
  }
}else extraction.push({error:"manifest_queue_lookup_failed",http_status:m.status});
const pdfExtraction=[];
const pe=await fetch(url+"/rest/v1/nyxi_corpus_manifest?select=snapshot_id,extraction_status,metadata&extraction_status=in.(awaiting_pdf_parser,processing)&order=created_at.desc&limit=80",{headers:{authorization:"Bearer "+key,apikey:key}});
if(pe.ok){
 const queue=await pe.json();
 const ordered=queue.filter(x=>!x.metadata?.pdf_next_attempt_after||Date.parse(x.metadata.pdf_next_attempt_after)<Date.now())
  .sort((a,b)=>(a.extraction_status==="processing"?0:1)-(b.extraction_status==="processing"?0:1)||Number(a.metadata?.byte_length||1e9)-Number(b.metadata?.byte_length||1e9));
 const selected=ordered[0];
 if(selected){
  try{
   const r=await fetch(url+"/functions/v1/nyxi-pdf-extractor",{method:"POST",headers:{authorization:"Bearer "+key,apikey:key,"x-nyxi-scheduler-token":bearer,"content-type":"application/json"},body:JSON.stringify({snapshot_id:selected.snapshot_id,dry_run:false}),signal:AbortSignal.timeout(55000)});
   const result=await r.json().catch(()=>({error:"invalid_response"}));
   pdfExtraction.push({snapshot_id:selected.snapshot_id,http_status:r.status,status:result.status||null,error:result.error||null,pages_processed:result.pages_processed||0,next_page:result.next_page||null,fragments_added:result.fragments_added||0});
   if(!r.ok){
    const metadata={...(selected.metadata||{}),pdf_last_error:String(result.error||"http_"+r.status).slice(0,90),pdf_next_attempt_after:new Date(Date.now()+6*60*60*1000).toISOString()};
    await fetch(url+"/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+selected.snapshot_id,{method:"PATCH",headers:{authorization:"Bearer "+key,apikey:key,"content-type":"application/json"},body:JSON.stringify({metadata})});
   }
  }catch(e){pdfExtraction.push({snapshot_id:selected.snapshot_id,error:String(e).slice(0,100)});}
 }
}else pdfExtraction.push({error:"pdf_queue_lookup_failed",http_status:pe.status});
return json({approved_count:allApproved.length,selected_count:approved.length,skipped_recent_count:allApproved.length-approved.length,results,extraction,pdf_extraction:pdfExtraction},results.every(x=>x.http_status===200||x.http_status===201||x.error==="crawl_delay")&&extraction.every(x=>x.status==="extracted_pending_review"||x.status==="already_completed")&&pdfExtraction.every(x=>["pdf_processing","extracted_pending_review","already_completed"].includes(x.status))?200:207);});