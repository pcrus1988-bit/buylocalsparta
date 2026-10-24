"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import type {TigerLiveEvent,TigerSnapshot,TigerIssue,TigerWorker} from "../lib/tiger-live";

const ROOMS:ReadonlyArray<{id:string;x:number;y:number;accent:string}>= [
  {id:"A01",x:19,y:17,accent:"#94a77f"},
  {id:"A02",x:43,y:13,accent:"#d8b36b"},
  {id:"A03",x:67,y:17,accent:"#81a8a1"},
  {id:"A04",x:81,y:36,accent:"#a3bb83"},
  {id:"A05",x:81,y:59,accent:"#cfa184"},
  {id:"A06",x:67,y:80,accent:"#a8a5d1"},
  {id:"A07",x:43,y:84,accent:"#8fb0cc"},
  {id:"A08",x:19,y:80,accent:"#dbb177"},
  {id:"A09",x:8,y:59,accent:"#b7a2c0"},
  {id:"A10",x:8,y:36,accent:"#9eb3a5"}
];
const fmt=(value:string|null|undefined)=>value?new Date(value).toISOString().replace("T"," ").slice(0,19)+" UTC":"No verified update";
const statusColor=(value:string)=>value==="LIVE"?"good":value==="NO ACTIVITY"?"neutral":value==="STALE"?"warn":"bad";
type Inspect =
 | {kind:"agent";data:TigerWorker}
 | {kind:"event";data:TigerLiveEvent}
 | {kind:"issue";data:TigerIssue}
 | {kind:"achievement";data:{id:string;title:string;evidenceUrl:string}};
function Evidence({url}:{url?:string}){
  if(!url)return <span className="tiger-muted">No verifiable evidence link</span>;
  return <a target="_blank" rel="noreferrer noopener" href={url}>View GitHub evidence ↗</a>;
}
function TigerFace({accent,working}:{accent:string;working:boolean}){
  return <span className={"tiger-face "+(working?"tiger-face-active":"")} style={{"--tiger-accent":accent} as CSSProperties} aria-hidden="true">
    <span className="tiger-ear left"/><span className="tiger-ear right"/>
    <span className="tiger-stripe central"/><span className="tiger-stripe left"/><span className="tiger-stripe right"/>
    <span className="tiger-eye left"/><span className="tiger-eye right"/>
    <span className="tiger-muzzle"/><span className="tiger-nose"/>
  </span>;
}
export function TigerLiveControlRoom({initial}:{initial:TigerSnapshot}){
  const [snapshot,setSnapshot]=useState(initial);
  const [transport,setTransport]=useState<"connecting"|"connected"|"disconnected">("connecting");
  const [filterEngine,setFilterEngine]=useState("");
  const [filterAgent,setFilterAgent]=useState("");
  const [filterType,setFilterType]=useState("");
  const [severity,setSeverity]=useState("");
  const [inspect,setInspect]=useState<Inspect|null>(null);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [showBubbles,setShowBubbles]=useState(true);
  const [paused,setPaused]=useState(false);
  const [flat,setFlat]=useState(false);
  const lastObserved=useRef(Date.now());
  const stage=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const s=new EventSource("/api/admin/tiger/live/stream");
    const onSnapshot=(event:MessageEvent)=>{
      try{
        const value=JSON.parse(event.data) as TigerSnapshot;
        if(value.schemaVersion!==1||!Array.isArray(value.events)||!Array.isArray(value.agents))return;
        lastObserved.current=Date.now();
        setSnapshot(value);setTransport("connected");
      }catch{setTransport("disconnected");}
    };
    const onUnavailable=()=>setTransport("disconnected");
    s.addEventListener("snapshot",onSnapshot as EventListener);
    s.addEventListener("ping",()=>{lastObserved.current=Date.now();setTransport("connected");});
    s.addEventListener("unavailable",onUnavailable);
    s.onerror=()=>setTransport("disconnected");
    const guard=setInterval(()=>{
      if(Date.now()-lastObserved.current>75000)setTransport("disconnected");
    },15000);
    return ()=>{clearInterval(guard);s.close();};
  },[]);
  const connection=transport==="disconnected"?"DISCONNECTED":snapshot.source;
  const canAnimate=!paused&&transport==="connected"&&connection==="LIVE";
  const latestBubbles=useMemo(()=>{
    if(!canAnimate||!showBubbles)return new Map<string,TigerLiveEvent>();
    const now=Date.now();
    const result=new Map<string,TigerLiveEvent>();
    for(const event of snapshot.events){
      if(!["agent.message","agent.handoff","task.claimed","task.running","task.tested","task.reviewed","task.submitted","task.failed"].includes(event.eventType)||
        !event.agentId||result.has(event.agentId)||Math.abs(now-Date.parse(event.occurredAt))>18000)continue;
      result.set(event.agentId,event);
    }
    return result;
  },[snapshot,canAnimate,showBubbles]);
  const selectedEvents=useMemo(()=>snapshot.events.filter(e=>
    (!filterEngine||e.engineId===filterEngine)&&
    (!filterAgent||e.agentId===filterAgent)&&
    (!filterType||e.eventType===filterType)
  ),[snapshot,filterEngine,filterAgent,filterType]);
  const types=useMemo(()=>[...new Set(snapshot.events.map(e=>e.eventType))].sort(),[snapshot.events]);
  const issues=snapshot.issues.filter(i=>!severity||i.severity===severity);
  const focus=(id:string)=>{
    const item=ROOMS.find(r=>r.id===id);
    if(item){setZoom(1.4);setPan({x:(50-item.x)*4,y:(50-item.y)*3});}
    else{setZoom(1.2);setPan({x:0,y:0});}
  };
  const inspectAgent=(id:string)=>{const worker=snapshot.agents.find(a=>a.id===id);if(worker){setInspect({kind:"agent",data:worker});focus(id);}};
  return <div className={"tiger-live "+(paused?"tiger-visual-paused":"")}>
    <header className="tiger-topbar">
      <div className="tiger-brand"><span className="tiger-brand-mark" aria-hidden="true">T</span><div><span className="tiger-eyebrow">PROJECT TIGER · ENGINEERING HEADQUARTERS</span><h1>TIGER <em>LIVE</em></h1></div></div>
      <div className="tiger-top-metrics">
        <span className={"tiger-chip "+statusColor(connection)}><span className="tiger-status-dot"/>{connection}</span>
        <span className="tiger-chip">Agents <strong>{snapshot.activeWorkers}/11</strong></span>
        <span className="tiger-chip">Running <strong>{snapshot.runningTasks}</strong></span>
        <span className="tiger-chip">Blocked <strong>{snapshot.blockedTasks}</strong></span>
        <span className="tiger-chip">PR candidates <strong>{snapshot.engines.filter(e=>e.candidatePr).length}</strong></span>
        <span className="tiger-chip">CI <strong>{snapshot.ciHealth}</strong></span>
        <span className="tiger-chip">Budget <strong>{snapshot.budgetStatus}</strong></span>
      </div>
      <div className="tiger-verified">LAST VERIFIED READ <strong>{fmt(snapshot.observedAt)}</strong></div>
    </header>
    <div className="tiger-notice" role="status" aria-live="polite"><span className={"tiger-notice-light "+statusColor(connection)}/>{transport==="disconnected"?"Stream disconnected. Last snapshot is historical; agent animation has stopped.":snapshot.message}</div>

    <div className="tiger-layout">
      <aside className="tiger-panel tiger-engines">
        <div className="tiger-panel-heading"><span>01 / ENGINE OPERATIONS</span><strong>E01—E20</strong></div>
        <div className="tiger-panel-caption">Authoritative AUTOPILOT task states. No invented completion percentages.</div>
        <div className="tiger-engine-list">
          {snapshot.engines.map(engine=><button key={engine.id} className={"tiger-engine "+(filterEngine===engine.id?"selected":"")} onClick={()=>setFilterEngine(filterEngine===engine.id?"":engine.id)}>
            <span className="tiger-engine-number">{engine.id}</span>
            <span className="tiger-engine-body"><strong>{engine.name}</strong><small>{engine.taskId||"No recorded task"}</small>{engine.candidatePr&&<small>Open {engine.candidatePr.draft?"draft ":""}PR #{engine.candidatePr.number} · development candidate</small>}</span>
            <span className={"tiger-engine-state "+(engine.status==="blocked"?"blocked":engine.status==="ready"?"ready":engine.status==="accepted"?"accepted":"")}>{engine.status}</span>
          </button>)}
        </div>
        {filterEngine&&<div className="tiger-engine-inspection"><strong>{filterEngine} · Selected</strong><span>{snapshot.engines.find(e=>e.id===filterEngine)?.status}</span>
          <a target="_blank" rel="noreferrer noopener" href={snapshot.engines.find(e=>e.id===filterEngine)?.issueUrl||"https://github.com/pcrus1988-bit/Tiger-2-0/issues"}>GitHub issue / lineage ↗</a>
          {snapshot.engines.find(e=>e.id===filterEngine)?.candidatePr&&<a target="_blank" rel="noreferrer noopener" href={snapshot.engines.find(e=>e.id===filterEngine)?.candidatePr?.url}>Open PR candidate · NOT accepted ↗</a>}
          <button onClick={()=>setFilterEngine("")}>Clear engine filter ×</button></div>}
      </aside>

      <section className="tiger-center">
        <div className="tiger-scene-header"><div><span className="tiger-eyebrow">02 / HEADQUARTERS</span><h2>Engineering command floor</h2><p>Individual workstations reflect verified roles and activity only.</p></div>
          <div className="tiger-scene-tools">
            <button aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(.75,v-.15))}>−</button><output aria-label="Zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(1.65,v+.15))}>+</button>
            <button title="Pan left" onClick={()=>setPan(p=>({...p,x:p.x+30}))}>←</button><button title="Pan right" onClick={()=>setPan(p=>({...p,x:p.x-30}))}>→</button>
            <button title="Pan up" onClick={()=>setPan(p=>({...p,y:p.y+30}))}>↑</button><button title="Pan down" onClick={()=>setPan(p=>({...p,y:p.y-30}))}>↓</button>
            <button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Reset</button>
          </div>
        </div>
        <div className={"tiger-office-viewport "+(flat?"flat":"")} ref={stage}>
          <div className="tiger-office-floor" style={{transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")"}}>
            <div className="tiger-office-grid" aria-hidden="true"/>
            <div className="tiger-office-walkway" aria-hidden="true"/>
            <button className="tiger-command-hub" onClick={()=>inspectAgent("A00")}>
              <span className="tiger-hub-halo"/><span className="tiger-hub-screens"><i/><i/><i/></span>
              <TigerFace accent="#d8b36b" working={canAnimate&&snapshot.agents[0]?.status==="working"}/>
              <b>A00 · CHIEF ORCHESTRATOR</b><small>{snapshot.agents[0]?.status||"offline"}</small>
            </button>
            <div className="tiger-collaboration-table"><span>COLLABORATION</span><span className="tiger-collaboration-ring"/></div>
            {ROOMS.map((r,index)=>{
              const worker=snapshot.agents.find(a=>a.id===r.id);
              const active=canAnimate&&worker?.status==="working";
              const bubble=latestBubbles.get(r.id);
              return <button key={r.id} className={"tiger-station "+(active?"working":"inactive")} style={{left:r.x+"%",top:r.y+"%","--desk-accent":r.accent} as CSSProperties}
                onClick={()=>inspectAgent(r.id)} aria-label={r.id+" "+worker?.name+" "+(active?"working":"offline")}>
                <span className="tiger-station-monitor"><span className="tiger-monitor-glow"/></span>
                <span className="tiger-station-desk"/>
                <TigerFace accent={r.accent} working={!!active}/>
                <span className="tiger-station-name"><b>{r.id}</b><span>{worker?.name||"Unassigned"}</span></span>
                <span className="tiger-station-status">{active?worker?.status:"offline"}</span>
                {bubble&&<span className="tiger-bubble" title={fmt(bubble.occurredAt)} onClick={e=>{e.stopPropagation();setInspect({kind:"event",data:bubble});}}>{bubble.summary}</span>}
                {index===0&&<span className="tiger-station-spark" aria-hidden="true"/>}
              </button>;
            })}
            {canAnimate&&snapshot.events.filter(e=>["agent.handoff","task.claimed"].includes(e.eventType)&&e.agentId&&Math.abs(Date.now()-Date.parse(e.occurredAt))<18000).slice(0,1).map(e=><button className="tiger-handoff-packet" key={e.id} onClick={()=>setInspect({kind:"event",data:e})}>↗ {e.eventType==="task.claimed"?"Task claimed by "+e.agentId:e.agentId+" → "+e.relatedAgentId}</button>)}
            <button className={"tiger-world-wall tiger-issue-wall "+(snapshot.issues.some(i=>i.severity==="critical")?"alert":"")} onClick={()=>issues[0]&&setInspect({kind:"issue",data:issues[0]})}>
              <span>ISSUE WALL</span><b>{snapshot.issues.length}</b><small>Recorded blockers & failures</small>
            </button>
            <button className="tiger-world-wall tiger-trophy-wall" onClick={()=>snapshot.achievements[0]&&setInspect({kind:"achievement",data:snapshot.achievements[0]})}>
              <span>ACHIEVEMENTS</span><b>✦ {snapshot.achievements.length}</b><small>Evidence required</small>
            </button>
          </div>
          <div className="tiger-office-caption">{snapshot.activeWorkers===0?"All agent workstations are idle/offline. No agent activity is being simulated.":"Active workstations require a valid lease and fresh heartbeat."}</div>
        </div>
        <div className="tiger-scene-footer">
          <div className="tiger-controls">
            <button onClick={()=>setPaused(v=>!v)}>{paused?"▶ Resume visuals":"Ⅱ Pause visuals"}</button>
            <button onClick={()=>setShowBubbles(v=>!v)}>{showBubbles?"Hide speech":"Show speech"}</button>
            <button onClick={()=>setFlat(v=>!v)}>{flat?"2.5D office":"Accessible 2D"}</button>
            <button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Focus all</button>
            <button onClick={()=>{const first=snapshot.agents.find(a=>a.status==="working");if(first)focus(first.id);}}>Focus active</button>
            <button onClick={()=>{void stage.current?.requestFullscreen?.();}}>Fullscreen</button>
          </div>
          <div className="tiger-captionline">CSS 2.5D · Motion from recorded events only · Reduced-motion supported</div>
        </div>
        <div className="tiger-bottom-grid">
          <div className="tiger-issues"><header><span>03 / ISSUE WALL</span><select aria-label="Issue severity" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option></select></header>
            {issues.length===0?<p>No recorded blockers in selected view.</p>:issues.slice(0,5).map(issue=><button key={issue.id} onClick={()=>setInspect({kind:"issue",data:issue})}><span className={"tiger-alert-dot "+issue.severity}/><strong>{issue.title}</strong><small>{issue.engineId||"System"} · {issue.taskId||"CI"} ↗</small></button>)}
          </div>
          <div className="tiger-achievements"><header><span>04 / VERIFIED ACHIEVEMENTS</span><strong>✦ {snapshot.achievements.length}</strong></header>
            {snapshot.achievements.length===0?<div className="tiger-empty-trophy"><span>♜</span><p>No verified achievements recorded. Milestones appear only with evidence.</p></div>:snapshot.achievements.map(a=><button key={a.id} onClick={()=>setInspect({kind:"achievement",data:a})}>{a.title}</button>)}
          </div>
        </div>
      </section>
      <aside className="tiger-panel tiger-feed">
        <div className="tiger-panel-heading"><span>05 / LIVE COMMUNICATIONS</span><strong>{selectedEvents.length} records</strong></div>
        <p className="tiger-panel-caption">Real GitHub operations and recorded AUTOPILOT transitions. No fabricated agent dialogue.</p>
        <div className="tiger-feed-filters"><select aria-label="Filter event agent" value={filterAgent} onChange={e=>setFilterAgent(e.target.value)}><option value="">All agents</option>{snapshot.agents.map(a=><option key={a.id} value={a.id}>{a.id} {a.name}</option>)}</select>
          <select aria-label="Filter event type" value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="">All events</option>{types.map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="tiger-feed-items">
          {selectedEvents.length===0?<div className="tiger-no-events">No recorded events match these filters. No messages will be invented.</div>:
            selectedEvents.map(event=><button className="tiger-event" key={event.id} onClick={()=>setInspect({kind:"event",data:event})}>
              <span className={"tiger-event-symbol "+event.severity}>{event.eventType.startsWith("pr.")?"◇":event.eventType.startsWith("workflow.")?"◈":"◆"}</span>
              <span className="tiger-event-copy"><small>{event.agentId||"GitHub / AUTOPILOT"} <span>· {event.engineId||"System"}</span></small>
                <strong>{event.summary}</strong><time dateTime={event.occurredAt}>{fmt(event.occurredAt)}</time></span>
            </button>)}
        </div>
        <div className="tiger-feed-foot">Source: private GitHub repository · Bounded recent history · Read only</div>
      </aside>
    </div>
    {inspect&&<div className="tiger-inspector-backdrop" onClick={()=>setInspect(null)}>
      <section className="tiger-inspector" role="dialog" aria-modal="true" aria-label="TIGER live evidence detail" onClick={e=>e.stopPropagation()}>
        <header><span>RECORD INSPECTOR · {inspect.kind.toUpperCase()}</span><button onClick={()=>setInspect(null)} aria-label="Close inspector">×</button></header>
        {inspect.kind==="agent"?<><div className="tiger-inspector-avatar"><TigerFace accent="#d8b36b" working={canAnimate&&inspect.data.status==="working"}/></div><h2>{inspect.data.id} · {inspect.data.name}</h2><p>Verified state: <strong>{inspect.data.status}</strong></p><p>Task: {inspect.data.taskId||"None recorded"} · Engine: {inspect.data.engineId||"Unassigned"}</p><p>Heartbeat: {fmt(inspect.data.heartbeatAt)}</p><p>Logical agent roles are not permanent workers.</p></>:
          inspect.kind==="event"?<><h2>{inspect.data.summary}</h2><p>Type: {inspect.data.eventType} · Severity: {inspect.data.severity}</p><p>Agent: {inspect.data.agentId||"Not attributed"} · Engine: {inspect.data.engineId||"Not attributed"}</p><p>Task: {inspect.data.taskId||"Not recorded"}</p><p>Occurred: {fmt(inspect.data.occurredAt)}</p><p>Cursor: {inspect.data.cursor||"GitHub evidence source"}</p><Evidence url={inspect.data.evidenceUrl}/></>:
          inspect.kind==="issue"?<><h2>{inspect.data.title}</h2><p>Severity: {inspect.data.severity}</p><p>Task: {inspect.data.taskId||"GitHub Actions"}</p><p>Engine: {inspect.data.engineId||"System"}</p><Evidence url={inspect.data.evidenceUrl}/></>:
          <><h2>{inspect.data.title}</h2><Evidence url={inspect.data.evidenceUrl}/></>}
      </section>
    </div>}
  </div>;
}
