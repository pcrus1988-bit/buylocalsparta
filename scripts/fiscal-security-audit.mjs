// Deterministic, read-only npm audit summary for Fiscal staging.
// Workspace-wide audit is a conservative superset of Fiscal runtime dependencies.
import {spawnSync} from "node:child_process";
const args=["audit","--omit=dev","--json"];
const run=spawnSync("npm",args,{cwd:process.cwd(),encoding:"utf8",maxBuffer:12*1024*1024,timeout:90_000});
if(run.error){console.error("FISCAL AUDIT UNAVAILABLE:",run.error.message);process.exit(2);}
let report;
try{report=JSON.parse(run.stdout||"");}
catch{console.error("FISCAL AUDIT PARSE FAILED",run.stderr?.slice(0,800));process.exit(2);}
const vulns=Object.entries(report.vulnerabilities??{}).map(([name,record])=>({
  package:name,
  severity:record.severity??"unknown",
  direct:Boolean(record.isDirect),
  range:record.range??"",
  fixAvailable:record.fixAvailable??false,
  advisoryPaths:(record.via??[]).filter(v=>typeof v==="object").map(v=>v.url).filter(Boolean).slice(0,3)
}));
const counts={critical:0,high:0,moderate:0,low:0,info:0};
for(const v of vulns){if(Object.hasOwn(counts,v.severity))counts[v.severity]++;}
console.log("FISCAL WORKSPACE PRODUCTION DEPENDENCY AUDIT",JSON.stringify({
  scope:"npm workspace tree excluding dev dependencies; not proof every package reaches the Fiscal runtime",
  counts, findings:vulns
},null,2));
if(vulns.length){
  console.log("FISCAL AUDIT ACTION REQUIRED: review dependency reachability, patched versions, and lockfile changes before public launch.");
}
if(report.error||run.status===null){console.error("FISCAL AUDIT INCOMPLETE",report.error?.summary??"process failed");process.exit(2);}
