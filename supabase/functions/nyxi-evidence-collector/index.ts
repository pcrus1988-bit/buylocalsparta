const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("NYXI_COLLECTOR_INTERNAL_TOKEN");
const COLLECTOR_VERSION = "nyxi-evidence-collector-v2";

const dbHeaders = {
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "apikey": SERVICE_KEY,
  "Content-Type": "application/json"
};

function j(status:number, body:unknown) {
  return new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json"}});
}
async function dbGet(path:string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {headers:dbHeaders});
  if (!r.ok) throw new Error(`db_get_${r.status}:${await r.text()}`);
  return await r.json();
}
async function dbPost(table:string, body:unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:"POST",
    headers:{...dbHeaders, "Prefer":"return=representation"},
    body:JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`db_post_${table}_${r.status}:${await r.text()}`);
  return await r.json();
}
async function dbPatch(table:string, filter:string, body:unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method:"PATCH",
    headers:{...dbHeaders, "Prefer":"return=representation"},
    body:JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`db_patch_${table}_${r.status}:${await r.text()}`);
  return await r.json();
}
function hex(buf:ArrayBuffer) {
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function encodeStoragePath(path:string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
async function deleteObject(path:string) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/nyxi-evidence/${encodeStoragePath(path)}`, {
    method:"DELETE",
    headers:{"Authorization":`Bearer ${SERVICE_KEY}`, "apikey":SERVICE_KEY}
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return j(405,{error:"method_not_allowed"});
    if (!INTERNAL_TOKEN || req.headers.get("x-nyxi-collector-token") !== INTERNAL_TOKEN) return j(403,{error:"forbidden"});
    const input = await req.json().catch(()=>null);
    const approvalId = input?.approval_id;
    if (!approvalId || !/^[0-9a-f-]{36}$/i.test(approvalId)) return j(400,{error:"invalid_approval_id"});

    const approvals = await dbGet(`nyxi_asset_acquisition_approvals?id=eq.${encodeURIComponent(approvalId)}&select=*`);
    const a = approvals?.[0];
    if (!a) return j(404,{error:"approval_not_found"});

    const now = Date.now();
    const expiry = a.expires_at ? Date.parse(a.expires_at) : 0;
    const review = a.review_due_at ? Date.parse(a.review_due_at) : 0;
    const retain = a.retention_until ? Date.parse(a.retention_until) : Infinity;
    if (!a.acquisition_authorized) return j(409,{error:"approval_inactive"});
    if (!a.approved_at || Date.parse(a.approved_at) > now || expiry <= now || review <= now || retain <= now) {
      return j(409,{error:"approval_expired_or_not_current"});
    }
    if (a.acquisition_method !== "http" || !["html_original","pdf_original"].includes(a.asset_kind)) return j(409,{error:"unsupported_asset_contract"});
    const pdfAsset = a.asset_kind === "pdf_original";
    const extractionState = pdfAsset ? "awaiting_pdf_parser" : "ready";
    if (!a.asset_url || (a.approved_final_url && a.approved_final_url !== a.asset_url)) return j(409,{error:"non_exact_url_contract"});
    const meta = a.metadata || {};
    if (meta.governance_approved !== true || meta.no_link_following !== true || meta.no_images !== true) {
      return j(409,{error:"governance_metadata_incomplete"});
    }

    const assetUrl = new URL(a.asset_url);
    const delaySec = Number(meta.robots_delay_seconds || 0);
    if (delaySec > 0) {
      const pattern = `${assetUrl.origin}/*`;
      const recent = await dbGet(`nyxi_source_snapshots?final_url=like.${encodeURIComponent(pattern)}&select=fetched_at&order=fetched_at.desc&limit=1`);
      const last = recent?.[0]?.fetched_at ? Date.parse(recent[0].fetched_at) : 0;
      const elapsed = (now-last)/1000;
      if (last && elapsed < delaySec) return j(429,{error:"crawl_delay",retry_after_seconds:Math.ceil(delaySec-elapsed)});
    }

    const fetchedAt = new Date().toISOString();
    const upstream = await fetch(a.asset_url, {
      method:"GET",
      redirect:"manual",
      headers:{
        "Accept":pdfAsset ? "application/pdf" : "text/html,application/xhtml+xml",
        "Accept-Encoding":"identity",
        "User-Agent":"NYXI-Evidence-Collector/1.0 (research archive; contact info@kontamou.site)"
      }
    });
    if (upstream.status >= 300 && upstream.status < 400) return j(409,{error:"redirect_rejected",status:upstream.status,location:upstream.headers.get("location")});
    if (upstream.status !== 200) return j(502,{error:"upstream_status",status:upstream.status});
    if (upstream.url !== a.asset_url) return j(409,{error:"final_url_mismatch",final_url:upstream.url});

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength <= 0 || bytes.byteLength > 26214400) return j(413,{error:"invalid_size",byte_length:bytes.byteLength});
    const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (pdfAsset) {
      const validPdfHeader = bytes.length >= 5 &&
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
        bytes[3] === 0x46 && bytes[4] === 0x2d;
      if (!validPdfHeader || !["application/pdf","application/octet-stream"].includes(contentType)) {
        return j(415,{error:"unexpected_pdf_content",mime_type:contentType,has_pdf_header:validPdfHeader});
      }
    } else if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
      return j(415,{error:"unexpected_mime",mime_type:contentType});
    }
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));

    const existing = await dbGet(`nyxi_source_snapshots?source_id=eq.${encodeURIComponent(a.source_id)}&sha256=eq.${sha256}&select=id,storage_bucket,storage_path&limit=1`);
    if (existing?.[0]) {
      const manifests = await dbGet(`nyxi_corpus_manifest?snapshot_id=eq.${existing[0].id}&select=id,extraction_status&limit=1`);
      if (!manifests?.[0]) {
        const m = await dbPost("nyxi_corpus_manifest", {
          snapshot_id:existing[0].id,
          source_id:a.source_id,
          corpus_state:"archived",
          mirrored_to_drive:false,
          extraction_status:extractionState,
          metadata:{asset_approval_id:a.id,asset_id:meta.asset_id,collector_version:COLLECTOR_VERSION,recovered_manifest:true}
        });
        return j(200,{status:"unchanged_manifest_recovered",snapshot_id:existing[0].id,manifest_id:m?.[0]?.id,sha256,storage_path:existing[0].storage_path});
      }
      return j(200,{status:"unchanged",snapshot_id:existing[0].id,manifest_id:manifests[0].id,sha256,storage_path:existing[0].storage_path});
    }

    const slugRaw = assetUrl.pathname.split("/").filter(Boolean).pop() || "index";
    const slug = slugRaw.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,120);
    const storagePath = `${a.source_id}/${sha256}/${slug}.${pdfAsset ? "pdf" : "html"}`;
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/nyxi-evidence/${encodeStoragePath(storagePath)}`, {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${SERVICE_KEY}`,
        "apikey":SERVICE_KEY,
        "Content-Type":contentType,
        "x-upsert":"false"
      },
      body:bytes
    });
    if (!upload.ok) return j(502,{error:"storage_upload_failed",status:upload.status,detail:await upload.text()});

    let snapshot:any;
    try {
      const rows = await dbPost("nyxi_source_snapshots", {
        source_id:a.source_id,
        fetched_at:fetchedAt,
        final_url:upstream.url,
        http_status:upstream.status,
        etag:upstream.headers.get("etag"),
        last_modified:upstream.headers.get("last-modified"),
        mime_type:contentType,
        byte_length:bytes.byteLength,
        sha256,
        storage_bucket:"nyxi-evidence",
        storage_path:storagePath,
        parser_status:pdfAsset ? "awaiting_pdf_parser" : "pending",
        fetch_metadata:{
          content_language:upstream.headers.get("content-language"),
          cache_control:upstream.headers.get("cache-control"),
          content_encoding:upstream.headers.get("content-encoding"),
          asset_id:meta.asset_id,
          collector_version:COLLECTOR_VERSION
        },
        provenance:{
          original_bytes_preserved:true,
          asset_approval_id:a.id,
          requested_url:a.asset_url,
          retention_policy:a.retention_policy,
          rights_basis:a.rights_basis,
          attribution:a.attribution,
          no_link_following:true,
          linked_assets_acquired:false,
          collector_version:COLLECTOR_VERSION
        }
      });
      snapshot = rows?.[0];
    } catch (e) {
      await deleteObject(storagePath);
      throw e;
    }

    try {
      const m = await dbPost("nyxi_corpus_manifest", {
        snapshot_id:snapshot.id,
        source_id:a.source_id,
        corpus_state:"archived",
        mirrored_to_drive:false,
        extraction_status:extractionState,
        metadata:{
          asset_approval_id:a.id,
          asset_id:meta.asset_id,
          evidence_classes:meta.evidence_classes || [],
          storage_uri:`supabase://nyxi-evidence/${storagePath}`,
          sha256,
          byte_length:bytes.byteLength,
          collector_version:COLLECTOR_VERSION
        }
      });
      return j(201,{
        status:"archived",
        snapshot_id:snapshot.id,
        manifest_id:m?.[0]?.id,
        source_id:a.source_id,
        asset_approval_id:a.id,
        sha256,
        byte_length:bytes.byteLength,
        storage_bucket:"nyxi-evidence",
        storage_path:storagePath,
        extraction_status:extractionState
      });
    } catch (e) {
      return j(500,{error:"manifest_insert_failed",snapshot_id:snapshot.id,sha256,storage_path:storagePath,detail:String(e)});
    }
  } catch (e) {
    return j(500,{error:"collector_error",detail:String(e)});
  }
});