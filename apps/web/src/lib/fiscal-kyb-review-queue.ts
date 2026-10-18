/**
 * FISCAL M28 — operator-only read-only prioritization of existing KYB cases.
 * The SQL payload is strictly limited to organization ID/name/status and the
 * latest status per KYB check; no evidence references, source URLs, reviewer
 * names, beneficial owner records or documents are queried.
 */
import {summarizeFiscalMerchantKybProgress} from "./fiscal-merchant-kyb-progress.ts";
import type {FiscalMerchantKybProgress} from "./fiscal-merchant-kyb-progress.ts";

export const FISCAL_KYB_REVIEW_QUEUE_SQL=`
WITH selected AS (
 SELECT id,legal_name,status,created_at,
        to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_key
   FROM public.fiscal_organizations
  WHERE status IN ('pending_review','under_review')
    AND (($1::timestamptz IS NULL AND $2::uuid IS NULL)
         OR (created_at,id) > ($1::timestamptz,$2::uuid))
  ORDER BY created_at ASC,id ASC LIMIT 41
)
SELECT selected.id::text,selected.legal_name,selected.status,selected.created_at_key,
       latest.check_type,latest.outcome
  FROM selected
  LEFT JOIN LATERAL (
    SELECT DISTINCT ON (event.check_type) event.check_type,event.outcome
      FROM public.fiscal_kyb_evidence_events AS event
     WHERE event.organization_id=selected.id
     ORDER BY event.check_type,event.recorded_at DESC,event.id DESC
  ) AS latest ON TRUE
 ORDER BY selected.created_at ASC,selected.id ASC,latest.check_type
`;

type Raw=Readonly<{
 id:string;legal_name:string;status:string;
 check_type:string|null;outcome:string|null;
}>;
export type FiscalKybQueueCase=Readonly<{
 id:string;legalName:string;
 status:"pending_review"|"under_review";
 priority:"follow_up"|"unstarted"|"evidence_pending"|"recorded_for_review";
 progress:FiscalMerchantKybProgress;
}>;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function priority(progress:FiscalMerchantKybProgress):FiscalKybQueueCase["priority"]{
 if(progress.followUpCount>0)return "follow_up";
 if(progress.recordedCount===0&&progress.rows.every(x=>x.stage==="not_recorded"))
  return "unstarted";
 if(progress.outstandingCount>0)return "evidence_pending";
 return "recorded_for_review";
}
const rank={follow_up:0,evidence_pending:1,unstarted:2,recorded_for_review:3} as const;

export function summarizeFiscalKybReviewQueue(records:readonly Raw[]):readonly FiscalKybQueueCase[]{
 if(!Array.isArray(records)||records.length>320)throw new Error("KYB_QUEUE_INVALID");
 const grouped=new Map<string,{name:string;status:"pending_review"|"under_review";rows:Array<{check_type:string|null;outcome:string|null}>}>();
 for(const raw of records){
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||!uuid.test(raw.id)||
    typeof raw.legal_name!=="string"||raw.legal_name.length>240||!raw.legal_name.trim()||
    !["pending_review","under_review"].includes(raw.status)||
    (raw.check_type!==null&&typeof raw.check_type!=="string")||
    (raw.outcome!==null&&typeof raw.outcome!=="string"))
   throw new Error("KYB_QUEUE_INVALID");
  const state=raw.status as "pending_review"|"under_review";
  const existing=grouped.get(raw.id);
  if(existing&&(existing.name!==raw.legal_name||existing.status!==state))
    throw new Error("KYB_QUEUE_INVALID");
  if(!existing){
   if(grouped.size>=40)throw new Error("KYB_QUEUE_INVALID");
   grouped.set(raw.id,{name:raw.legal_name,status:state,rows:[]});
  }
  grouped.get(raw.id)!.rows.push({check_type:raw.check_type,outcome:raw.outcome});
 }
 const cases=Array.from(grouped,([id,item])=>{
  // SQL emits latest per type. This shared reducer never upgrades recorded
  // metadata to an identity certification or a legal fiscal authorization.
  const progress=summarizeFiscalMerchantKybProgress(item.rows);
  return Object.freeze({
   id,legalName:item.name,status:item.status,priority:priority(progress),progress
  });
 });
 cases.sort((a,b)=>rank[a.priority]-rank[b.priority]||a.id.localeCompare(b.id));
 return Object.freeze(cases);
}

/**
 * M30: deterministic keyset navigation across the entire pending case queue.
 * The cursor contains only the exact UTC creation timestamp and opaque org ID.
 * Cursor values are never interpolated into SQL; the caller binds two params.
 * Sorting by urgent outcome remains restricted to the current 40-case page.
 */
const cursorPattern=/^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z)\\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export type FiscalKybQueueCursor=Readonly<{createdAt:string;id:string}>;
export function parseFiscalKybReviewCursor(raw:unknown):FiscalKybQueueCursor|null{
 if(raw===undefined||raw===null)return null;
 if(typeof raw!=="string"||raw.length>80)throw new Error("KYB_QUEUE_CURSOR_INVALID");
 const match=cursorPattern.exec(raw);
 if(!match)throw new Error("KYB_QUEUE_CURSOR_INVALID");
 const date=new Date(match[1]);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==match[1].slice(0,19))
  throw new Error("KYB_QUEUE_CURSOR_INVALID");
 return Object.freeze({createdAt:match[1],id:match[2].toLowerCase()});
}
type PagedRaw=Raw&Readonly<{created_at_key:string}>;
export type FiscalKybReviewPage=Readonly<{
 cases:readonly FiscalKybQueueCase[];
 hasNext:boolean;
 nextCursor:string|null;
 legalApproval:false;
 issuanceEnabled:false;
}>;
export function summarizeFiscalKybReviewPage(records:readonly PagedRaw[]):FiscalKybReviewPage{
 if(!Array.isArray(records)||records.length>328)throw new Error("KYB_QUEUE_PAGE_INVALID");
 const ids:string[]=[];
 const visited=new Set<string>();
 let last="";
 for(const record of records){
  if(!record||typeof record!=="object"||!uuid.test(record.id)||
     typeof record.created_at_key!=="string"||
     !cursorPattern.test(record.created_at_key+"|"+record.id))
   throw new Error("KYB_QUEUE_PAGE_INVALID");
  parseFiscalKybReviewCursor(record.created_at_key+"|"+record.id);
  if(record.id!==last){
   if(visited.has(record.id))throw new Error("KYB_QUEUE_PAGE_INVALID");
   if(ids.length===41)throw new Error("KYB_QUEUE_PAGE_INVALID");
   ids.push(record.id);
   visited.add(record.id);
   last=record.id;
  }
 }
 const hasNext=ids.length===41;
 const visible=new Set(ids.slice(0,40));
 const rows=records.filter(r=>visible.has(r.id));
 const cases=summarizeFiscalKybReviewQueue(rows);
 const terminal=hasNext?rows.findLast(r=>r.id===ids[39]):undefined;
 return Object.freeze({
  cases,hasNext,
  nextCursor:terminal?terminal.created_at_key+"|"+terminal.id:null,
  legalApproval:false as const,
  issuanceEnabled:false as const
 });
}
