import { getDocumentProxy } from "npm:unpdf@1.8.1";

const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VERSION = "nyxi-pdf-text-v1";
const MAX_BYTES = 26_214_400;
const MAX_PAGES = 600;
const PAGES_PER_RUN = 10;
const MAX_FRAGMENT_CHARS = 1300;
const MAX_PAGE_CHARS = 125_000;

const reply = (data: unknown, status = 200): Response =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
const headers = () => ({ apikey: K, authorization: "Bearer " + K });
const api = (path: string, init: RequestInit = {}) =>
  fetch(U + path, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
const digest = async (data: BufferSource): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((v) => v.toString(16).padStart(2, "0")).join("");
const validUUID = (s: unknown) =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function getJson(path: string): Promise<any[]> {
  const r = await api(path);
  if (!r.ok) throw new Error("db_read_" + r.status);
  return await r.json();
}
async function patch(path: string, value: object): Promise<void> {
  const r = await api(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error("db_patch_" + r.status + "_" + (await r.text()).slice(0,100));
}
async function post(path: string, value: unknown, extra: Record<string,string> = {}): Promise<any[]> {
  const r = await api(path, {
    method: "POST",
    headers: { "content-type": "application/json", "prefer": "return=representation", ...extra },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error("db_insert_" + r.status + "_" + (await r.text()).slice(0,100));
  return await r.json().catch(() => []);
}
function segments(input: string): string[] {
  const normalized = input.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").trim();
  if (normalized.length > MAX_PAGE_CHARS) throw new Error("page_text_over_limit");
  const result: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_FRAGMENT_CHARS) { result.push(remaining); break; }
    let cut = remaining.lastIndexOf(" ", MAX_FRAGMENT_CHARS);
    if (cut < 600) cut = MAX_FRAGMENT_CHARS;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  return result.filter(v => v.trim().length >= 30);
}
async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply({error:"method_not_allowed"},405);
  if (!U || !K) return reply({error:"unconfigured"},503);
  const tok = req.headers.get("x-nyxi-scheduler-token") || "";
  if (!/^[a-f0-9]{64}$/.test(tok)) return reply({error:"unauthorized"},401);
  const ar = await api("/rest/v1/nyxi_worker_scheduler_auth?id=eq.1&select=token_sha256");
  if (!ar.ok) return reply({error:"scheduler_auth_unavailable"},503);
  const expected = (await ar.json())?.[0]?.token_sha256 || "";
  const computed = await digest(new TextEncoder().encode(tok));
  let diff = expected.length ^ computed.length;
  for (let i=0;i<64;i++) diff |= (expected.charCodeAt(i)||0) ^ (computed.charCodeAt(i)||0);
  if (diff !== 0) return reply({error:"unauthorized"},401);
  const input = await req.json().catch(() => ({}));
  if (!validUUID(input.snapshot_id)) return reply({error:"invalid_snapshot_id"},400);
  const dryRun = input.dry_run !== false;
  const snap = (await getJson("/rest/v1/nyxi_source_snapshots?id=eq."+input.snapshot_id+"&select=*"))[0];
  if (!snap || snap.storage_bucket !== "nyxi-evidence" || snap.mime_type !== "application/pdf" ||
      !["awaiting_pdf_parser","processing","complete"].includes(snap.parser_status))
    return reply({error:"snapshot_not_eligible"},409);
  if (!Number.isInteger(Number(snap.byte_length)) || Number(snap.byte_length)>MAX_BYTES)
    return reply({error:"invalid_pdf_length"},413);
  const mf = (await getJson("/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+snap.id+"&select=*"))[0];
  if (!mf || mf.source_id!==snap.source_id ||
      !["awaiting_pdf_parser","processing","complete"].includes(mf.extraction_status) ||
      mf.metadata?.sha256 !== snap.sha256)
    return reply({error:"manifest_not_eligible"},409);
  const approvalId = snap.provenance?.asset_approval_id;
  if (!validUUID(approvalId)) return reply({error:"provenance_approval_missing"},409);
  const approval = (await getJson("/rest/v1/nyxi_asset_acquisition_approvals?id=eq."+approvalId+"&select=id,source_id,acquisition_authorized,asset_kind,approved_at,expires_at,review_due_at,retention_until"))[0];
  const now = Date.now();
  if (!approval || approval.source_id!==snap.source_id || !approval.acquisition_authorized ||
      approval.asset_kind!=="pdf_original" || Date.parse(approval.approved_at)>now ||
      Date.parse(approval.review_due_at)<=now || Date.parse(approval.expires_at)<=now ||
      (approval.retention_until && Date.parse(approval.retention_until)<=now))
    return reply({error:"rights_review_required"},409);
  const runs = await getJson("/rest/v1/nyxi_extraction_runs?snapshot_id=eq."+snap.id+"&parser_version=eq."+VERSION+"&select=*");
  let run = runs[0];
  if (run?.status==="complete") return reply({status:"already_completed",snapshot_id:snap.id,fragments:run.fragment_count});
  if (run?.status==="failed") return reply({error:"failed_run_requires_review"},409);
  if (mf.extraction_status==="complete" && !run) return reply({error:"manifest_run_mismatch"},409);

  const claimResponse=await api("/rest/v1/rpc/nyxi_pdf_claim_v1",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({p_snapshot:snap.id})
  });
  if(!claimResponse.ok) return reply({error:"lease_claim_failed",http_status:claimResponse.status},503);
  const leaseToken=await claimResponse.json().catch(()=>null);
  if(!validUUID(leaseToken)) return reply({status:"lease_busy",snapshot_id:snap.id});
  try {
  const path = encodePath(snap.storage_path);
  const stored = await api("/storage/v1/object/nyxi-evidence/"+path);
  if (!stored.ok) return reply({error:"private_pdf_unavailable",status:stored.status},502);
  const bytes = new Uint8Array(await stored.arrayBuffer());
  if (bytes.byteLength!==Number(snap.byte_length) || await digest(bytes)!==snap.sha256)
    return reply({error:"integrity_mismatch"},409);
  if (bytes.length<8 || String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")
    return reply({error:"invalid_pdf_magic"},415);

  let pdf: any;
  try {
    pdf = await getDocumentProxy(bytes, { disableFontFace:true, isEvalSupported:false, useSystemFonts:false, maxImageSize:16_777_216 });
  } catch (_) { return reply({error:"pdf_parse_failed"},422); }
  try {
    const totalPages = pdf.numPages as number;
    if (!Number.isInteger(totalPages) || totalPages<1 || totalPages>MAX_PAGES)
      return reply({error:"page_count_out_of_range",total_pages:totalPages},422);
    const start = run ? Number(run.metadata?.next_page || 1) : 1;
    if (!Number.isInteger(start) || start<1 || start>totalPages+1)
      return reply({error:"invalid_pdf_resume_cursor"},409);
    const finish = Math.min(totalPages,start+PAGES_PER_RUN-1);
    const fragments: any[] = [];
    const emptyPages: number[] = [];
    const startedAt=Date.now();
    for(let pageNo=start;pageNo<=finish;pageNo++){
      if (Date.now()-startedAt > 35_000 && pageNo>start) break;
      const page=await pdf.getPage(pageNo);
      const textContent=await page.getTextContent({ disableCombineTextItems:false });
      const content = (textContent.items||[]).map((it:any) => {
        if(typeof it.str!=="string") return "";
        return it.str+(it.hasEOL?"\n":" ");
      }).join("").trim();
      if (!content) {emptyPages.push(pageNo); continue;}
      const list=segments(content);
      for(let i=0;i<list.length;i++){
        const body_text=list[i];
        fragments.push({
          source_id:snap.source_id,snapshot_id:snap.id,
          fragment_key:VERSION+"-p"+pageNo+"-f"+i,
          ordinal:(pageNo-1)*1000+i,
          section_heading:"PDF page "+pageNo+" of "+totalPages,
          section_path:["page:"+pageNo],body_text,
          content_sha256:await digest(new TextEncoder().encode(body_text)),
          extraction_method:VERSION,evidence_class:"source_text",
          metadata:{review_status:"pending",review_required:true,source_sha256:snap.sha256,
            parser_version:VERSION,page_number:pageNo,total_pages:totalPages,
            text_layer_only:true,no_ocr:true,no_claims_approved:true}
        });
      }
    }
    const lastProcessed = fragments.length ? Math.max(...fragments.map(f=>Number(f.metadata.page_number)),...emptyPages) :
      (emptyPages.length ? Math.max(...emptyPages) : start-1);
    if (lastProcessed<start) return reply({error:"no_progress"},422);
    if(dryRun) return reply({status:"verified_dry_run",snapshot_id:snap.id,verified_sha256:snap.sha256,
      total_pages:totalPages,pages_processed:lastProcessed-start+1,fragments:fragments.length,empty_pages:emptyPages});
    if(!run){
      await patch("/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+snap.id,
        {extraction_status:"processing",metadata:{...mf.metadata,pdf_parser:VERSION,pdf_total_pages:totalPages}});
      const created=await post("/rest/v1/nyxi_extraction_runs",{
        source_id:snap.source_id,snapshot_id:snap.id,parser_version:VERSION,status:"processing",
        metadata:{source_sha256:snap.sha256,total_pages:totalPages,next_page:1,pages_empty:0,text_layer_only:true,review_required:true}
      });
      run=created[0];
    }
    if(!run?.id) return reply({error:"run_missing"},503);
    for(let i=0;i<fragments.length;i+=35){
      await post("/rest/v1/nyxi_evidence_fragments?on_conflict=snapshot_id,fragment_key",
        fragments.slice(i,i+35),{"prefer":"resolution=ignore-duplicates"});
    }
    const next=lastProcessed+1;
    const complete=next>totalPages;
    const priorCount=Number(run.fragment_count||0);
    const emptyCount=Number(run.metadata?.pages_empty||0)+emptyPages.length;
    if(complete && priorCount+fragments.length===0){
      await patch("/rest/v1/nyxi_extraction_runs?id=eq."+run.id,
        {status:"failed",completed_at:new Date().toISOString(),error_message:"no_text_layer_ocr_review_required",
         metadata:{...run.metadata,total_pages:totalPages,next_page:next,pages_empty:emptyCount,review_required:true}});
      await patch("/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+snap.id,
        {extraction_status:"manual_review_required",metadata:{...mf.metadata,pdf_parser:VERSION,error:"no_text_layer_ocr_review_required"}});
      return reply({error:"no_text_layer_manual_review_required",total_pages:totalPages},422);
    }
    await patch("/rest/v1/nyxi_extraction_runs?id=eq."+run.id,{
      status:complete?"complete":"processing",fragment_count:priorCount+fragments.length,
      ...(complete?{completed_at:new Date().toISOString()}:{}),
      metadata:{...run.metadata,source_sha256:snap.sha256,total_pages:totalPages,next_page:next,
        pages_empty:emptyCount,last_batch_at:new Date().toISOString(),text_layer_only:true,review_required:true}
    });
    if(complete){
      await patch("/rest/v1/nyxi_corpus_manifest?snapshot_id=eq."+snap.id,
        {extraction_status:"complete",metadata:{...mf.metadata,pdf_parser:VERSION,
          extraction_review_status:"pending",pdf_total_pages:totalPages}});
      // The original snapshot is immutable; completion is recorded in the manifest and extraction run.
    }
    return reply({status:complete?"extracted_pending_review":"pdf_processing",snapshot_id:snap.id,
      total_pages:totalPages,pages_processed:lastProcessed-start+1,next_page:next,
      fragments_added:fragments.length,fragment_count:priorCount+fragments.length,
      review_required:true,complete});
  } catch (_) {return reply({error:"pdf_extraction_failed_manual_review_if_repeated"},500);}
  finally {try{await pdf.destroy();}catch{/**/}}
  } finally {
    try {
      await api("/rest/v1/nyxi_pdf_extraction_leases?snapshot_id=eq."+snap.id+"&lease_token=eq."+leaseToken,{method:"DELETE"});
    } catch {/** lease expires automatically if release fails */}
  }
}
Deno.serve((req:Request)=>handler(req).catch(()=>reply({error:"internal_error"},500)));
