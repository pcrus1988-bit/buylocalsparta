/**
 * TIGER LIVE v1 — read-only, server-side GitHub evidence adapter.
 * GitHub remains the durable source for CI/PR history; AUTOPILOT owns task state.
 * No synthetic worker, message, task, acceptance or achievement state.
 */
import "server-only";

export type TigerSourceState = "LIVE" | "STALE" | "DISCONNECTED" | "NOT CONFIGURED" | "NO ACTIVITY";
export type TigerLiveEvent = {
  id:string; schemaVersion:1; cursor:number; occurredAt:string; receivedAt:string;
  agentId?:string; relatedAgentId?:string; taskId?:string; engineId?:string;
  eventType:string; severity:"info"|"success"|"warning"|"critical"; summary:string;
  evidenceUrl?:string; correlationId?:string;
};
export type TigerWorker = { id:string; name:string; status:"offline"|"idle"|"working"|"blocked"; taskId?:string; engineId?:string; heartbeatAt?:string };
export type TigerEngine = { id:string; name:string; status:string; taskId?:string; issueUrl?:string };
export type TigerIssue = { id:string; title:string; severity:"warning"|"critical"; engineId?:string; taskId?:string; evidenceUrl?:string; owner?:string };
export type TigerSnapshot = {
  schemaVersion:1; source:TigerSourceState; observedAt:string|null; lastVerifiedUpdate:string|null;
  message:string; cursor:number; agents:TigerWorker[]; engines:TigerEngine[];
  events:TigerLiveEvent[]; issues:TigerIssue[];
  achievements:{id:string;title:string;evidenceUrl:string}[];
  activeWorkers:number; runningTasks:number; blockedTasks:number;
  ciHealth:"passing"|"failing"|"running"|"unknown";
  budgetStatus:"unavailable"; verifiedPullRequests:number;
};
const REPO = "pcrus1988-bit/Tiger-2-0";
const API = "https://api.github.com/repos/" + REPO;
const AUTO_BRANCH = "agent/tiger-autopilot-foundation-20261024";
const STATE_BRANCH = "autopilot-runtime-state";
const AGENT_NAMES = ["Chief Orchestrator","Architecture","Engineering","Integration","QA","Security","Database","DevOps","Independent Review","Documentation","Systems Intelligence"];
const ENGINE_NAMES = ["Identity & Accounts","Provider & Business","Universal Catalogue","Search & Intent","Geography & Eligibility","Inventory & Availability","Booking & Scheduling","Pricing & Quotations","Orders & Contracts","Payments & Settlement","FISCAL","Fulfillment & Dispatch","Communications","Aftercare","Workflow Orchestrator","Integration Gateway","Trust & Reputation","Subscriptions & Entitlements","Governance & Compliance","Analytics & Intelligence"];
const role = (value:unknown):value is string => typeof value==="string" && /^A(0[0-9]|10)$/.test(value);
const engine = (value:unknown):value is string => typeof value==="string" && /^E(0[1-9]|1[0-9]|20)$/.test(value);
function githubEvidence(value:unknown):string|undefined {
  if(typeof value!=="string")return undefined;
  try{
    const url=new URL(value);
    return url.protocol==="https:" && url.hostname==="github.com" &&
      new RegExp("^/pcrus1988-bit/Tiger-2-0/(pull/[0-9]+|issues/[0-9]+|actions/runs/[0-9]+)$").test(url.pathname)
      && !url.search && !url.hash ? url.href : undefined;
  }catch{return undefined;}
}
type RawTask = {engine?:string;status?:string;lease?:{owner?:string;expires_at?:number;last_heartbeat_at?:number}|null;issue?:number;updated_at?:string|null};
type RawState = {schema_version?:number;revision?:number;tasks?:Record<string,RawTask>;last_event?:unknown};
type RawEvent = {seq?:number;at?:string;kind?:string;task_id?:string;owner?:string;evidence?:{pr_url?:string;ci_url?:string}};
const transitionKinds:Record<string,[string,TigerLiveEvent["severity"],string]> = {
  claimed:["task.claimed","info","Task claimed"],
  heartbeat:["worker.heartbeat","info","Worker lease heartbeat recorded"],
  "phase:running":["task.running","info","Task entered running phase"],
  "phase:tested":["task.tested","success","Test evidence recorded"],
  "phase:reviewed":["task.reviewed","success","Independent review recorded"],
  "phase:submitted":["task.submitted","success","Draft pull request recorded"],
  failed:["task.failed","warning","Task execution failed"],
  lease_expired:["task.lease_expired","warning","Worker lease expired"]
};
export function mapTigerTransition(raw:RawEvent,observedAt:string):TigerLiveEvent|null {
  if(!Number.isSafeInteger(raw.seq)||!raw.seq||raw.seq<1 ||
    typeof raw.at!=="string"||!Number.isFinite(Date.parse(raw.at)) ||
    typeof raw.task_id!=="string"||!/^AUTO-E(0[1-9]|1[0-9]|20)-[0-9]{2}$/.test(raw.task_id) ||
    typeof raw.kind!=="string"||!transitionKinds[raw.kind])return null;
  const [eventType,severity,summary]=transitionKinds[raw.kind];
  const result:TigerLiveEvent={id:"autopilot:"+raw.seq,schemaVersion:1,cursor:raw.seq,
    occurredAt:raw.at,receivedAt:observedAt,eventType,severity,summary,
    taskId:raw.task_id,engineId:raw.task_id.slice(5,8)};
  if(role(raw.owner))result.agentId=raw.owner;
  const url=githubEvidence(raw.evidence?.pr_url)||githubEvidence(raw.evidence?.ci_url);
  if(url)result.evidenceUrl=url;
  return result;
}
async function github(path:string,token:string):Promise<unknown>{
  const response=await fetch(API+path,{headers:{
    authorization:"Bearer "+token,
    accept:"application/vnd.github+json",
    "x-github-api-version":"2022-11-28"
  },cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error("TIGER_GITHUB_HTTP_"+response.status);
  return response.json();
}
async function jsonFile(path:string,ref:string,token:string):Promise<unknown>{
  const response=await github("/contents/"+path+"?ref="+encodeURIComponent(ref),token) as {content?:string;encoding?:string};
  if(response.encoding!=="base64"||!response.content)throw new Error("TIGER_SOURCE_NOT_READABLE");
  return JSON.parse(Buffer.from(response.content.replace(/\s/g,""),"base64").toString("utf8"));
}
async function eventFile(token:string):Promise<RawEvent[]> {
  const response=await github("/contents/runtime/events.ndjson?ref="+STATE_BRANCH,token) as {content?:string;encoding?:string;size?:number};
  if(response.encoding!=="base64")throw new Error("TIGER_EVENTS_UNAVAILABLE");
  if((response.size??0)>900_000)throw new Error("TIGER_EVENTS_ARCHIVE_REQUIRED");
  const content=Buffer.from((response.content||"").replace(/\s/g,""),"base64").toString("utf8");
  return content.split("\n").filter(Boolean).slice(-150).map(line=>JSON.parse(line) as RawEvent);
}
function blank(source:TigerSourceState,message:string):TigerSnapshot {
  return {schemaVersion:1,source,observedAt:null,lastVerifiedUpdate:null,message,cursor:0,
    agents:AGENT_NAMES.map((name,i)=>({id:"A"+String(i).padStart(2,"0"),name,status:"offline"})),
    engines:ENGINE_NAMES.map((name,i)=>({id:"E"+String(i+1).padStart(2,"0"),name,status:"unknown"})),
    events:[],issues:[],achievements:[],activeWorkers:0,runningTasks:0,blockedTasks:0,
    ciHealth:"unknown",budgetStatus:"unavailable",verifiedPullRequests:0};
}
function dateOf(input:unknown):string|null{
  if(typeof input!=="string"||!Number.isFinite(Date.parse(input)))return null;
  return new Date(input).toISOString();
}
function snapshotFromSources(state:RawState,transitions:RawEvent[],runs:unknown,prs:unknown):TigerSnapshot {
  const now=Date.now(), observedAt=new Date(now).toISOString(), view=blank("NO ACTIVITY","Source reachable; no verified active logical agents.");
  view.observedAt=observedAt;
  if(state.schema_version!==1||!Number.isSafeInteger(state.revision)||!state.tasks)throw new Error("TIGER_STATE_SCHEMA_MISMATCH");
  view.cursor=state.revision||0;
  const allTasks=Object.entries(state.tasks);
  view.engines=view.engines.map(e=>{
    const match=allTasks.find(([,task])=>task.engine===e.id);
    return {...e,status:match?.[1].status||"unknown",taskId:match?.[0],
      issueUrl:match?.[1].issue ? githubEvidence("https://github.com/"+REPO+"/issues/"+match[1].issue) : undefined};
  });
  for(const [taskId,task] of allTasks){
    if(task.status==="blocked"||task.status==="dead_letter"){
      view.issues.push({id:"task:"+taskId,title:task.status==="blocked"?"Engine task blocked":"Task reached dead-letter state",
        severity:task.status==="dead_letter"?"critical":"warning",engineId:task.engine,taskId,
        evidenceUrl:githubEvidence("https://github.com/"+REPO+"/issues/"+task.issue)});
    }
    if(!["claimed","running","tested","reviewed"].includes(task.status||"")||!task.lease)continue;
    const current=Number(task.lease.expires_at)>now && Number(task.lease.last_heartbeat_at)>now-180_000;
    if(!current)continue;
    view.runningTasks++;
    const owner=task.lease.owner;
    // AUTOPILOT lease owners may be role-prefixed worker IDs (for example A02:run-123).
    // Only an explicit, syntactically bounded role prefix can light up a logical desk.
    const roleId=typeof owner==="string" ? owner.match(/^(A(?:0[0-9]|10))(?::[A-Za-z0-9_.-]{1,100})?$/)?.[1] : undefined;
    const worker=view.agents.find(a=>a.id===roleId);
    if(worker){worker.status="working";worker.taskId=taskId;worker.engineId=task.engine;
      worker.heartbeatAt=new Date(task.lease.last_heartbeat_at||0).toISOString();}
  }
  view.activeWorkers=view.agents.filter(a=>a.status==="working").length;
  const recorded=transitions.map(e=>mapTigerTransition(e,observedAt)).filter((e):e is TigerLiveEvent=>e!==null&&e.cursor<=view.cursor);
  const workflowRuns=(runs as {workflow_runs?:unknown[]})?.workflow_runs;
  if(!Array.isArray(workflowRuns))throw new Error("TIGER_ACTIONS_SHAPE_INVALID");
  const recent=workflowRuns.slice(0,35) as {id?:number;status?:string;conclusion?:string;created_at?:string;updated_at?:string;html_url?:string;name?:string}[];
  view.ciHealth=recent[0]?.status==="in_progress"||recent[0]?.status==="queued"?"running":
    recent[0]?.conclusion==="success"?"passing":recent[0]?.conclusion==="failure"?"failing":"unknown";
  const ciEvents:TigerLiveEvent[]=recent.flatMap(r=>{
    const url=githubEvidence(r.html_url), occurredAt=dateOf(r.updated_at||r.created_at);
    if(!url||!occurredAt||!Number.isSafeInteger(r.id))return [];
    const concluded=r.status==="completed";
    const good=concluded&&r.conclusion==="success",bad=concluded&&r.conclusion==="failure";
    return [{id:"gh:run:"+r.id+":"+(r.conclusion||r.status),schemaVersion:1 as const,cursor:0,
      occurredAt,receivedAt:observedAt,eventType:concluded?"workflow.completed":"workflow.running",
      severity:(bad?"critical":good?"success":"info") as TigerLiveEvent["severity"],
      summary:bad?"GitHub workflow failed":good?"GitHub workflow completed successfully":"GitHub workflow "+(r.status==="queued"?"queued":"in progress"),
      evidenceUrl:url}];
  });
  for(const e of ciEvents.filter(e=>e.severity==="critical")){
    view.issues.push({id:e.id,title:"GitHub workflow failure",severity:"critical",evidenceUrl:e.evidenceUrl});
  }
  const pulls=Array.isArray(prs)?prs as {number?:number;created_at?:string;html_url?:string;head?:{ref?:string};merged_at?:string}[]:[];
  const prEvents:TigerLiveEvent[]=pulls.slice(0,60).flatMap(p=>{
    const url=githubEvidence(p.html_url),occurredAt=dateOf(p.created_at);
    if(!url||!occurredAt||!Number.isSafeInteger(p.number))return [];
    const relatedEngine=p.head?.ref?.match(/(?:^|[-/])(e(?:0[1-9]|1[0-9]|20))(?:[-/]|$)/i)?.[1]?.toUpperCase();
    return [{id:"gh:pr:"+p.number,schemaVersion:1 as const,cursor:0,occurredAt,receivedAt:observedAt,
      eventType:"pr.created",severity:"info" as const,
      summary:"Pull request #"+p.number+" created",evidenceUrl:url,
      ...(engine(relatedEngine)?{engineId:relatedEngine}:{})}];
  });
  view.verifiedPullRequests=prEvents.length;
  view.events=[...recorded,...ciEvents,...prEvents]
    .sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.id.localeCompare(b.id)).slice(0,120);
  view.blockedTasks=view.issues.filter(i=>i.id.startsWith("task:")).length;
  view.lastVerifiedUpdate=view.events[0]?.occurredAt||dateOf((state.last_event as {at?:string}|null)?.at);
  if(view.runningTasks>0) {
    view.source=view.activeWorkers>0?"LIVE":"STALE";
    view.message=view.activeWorkers>0?"Verified worker lease heartbeat received.":"Worker lease exists without an attributed active A00–A10 agent.";
  }else if(allTasks.some(([,task])=>["claimed","running","tested","reviewed"].includes(task.status||""))){
    view.source="STALE";view.message="Active task state exists but no fresh verified worker heartbeat.";
  }else{
    view.source="NO ACTIVITY";view.message="GitHub evidence is reachable; no workers are currently verified as active.";
  }
  return view;
}
let memo:{at:number;value?:TigerSnapshot;promise?:Promise<TigerSnapshot>}={at:0};
export async function getTigerLiveSnapshot():Promise<TigerSnapshot>{
  const token=process.env.TIGER_GITHUB_READ_TOKEN?.trim();
  if(!token)return blank("NOT CONFIGURED","Configure a server-only, read-only TIGER_GITHUB_READ_TOKEN for the private repository.");
  if(memo.value&&Date.now()-memo.at<15000)return memo.value;
  if(memo.promise)return memo.promise;
  memo.promise=(async()=>{
    try{
      const [state,events,runs,prs]=await Promise.all([
        jsonFile("runtime/state.json",STATE_BRANCH,token) as Promise<RawState>,
        eventFile(token),
        github("/actions/runs?per_page=35",token),
        github("/pulls?state=all&per_page=60",token)
      ]);
      return snapshotFromSources(state,events,runs,prs);
    }catch{
      return blank("DISCONNECTED","TIGER evidence is unavailable or a source contract is invalid. No operational state is inferred.");
    }
  })();
  try{memo.value=await memo.promise;memo.at=Date.now();return memo.value;}
  finally{memo.promise=undefined;}
}
