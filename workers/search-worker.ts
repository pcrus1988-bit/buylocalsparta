import { hostname } from "node:os";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const runtime=createPostgresRuntimeFromEnv({applicationName:"buy-local-sparta-search-worker"});
const db=await runtime.readiness(EXPECTED_SCHEMA_VERSION);if(!db.ok){await runtime.close();throw new Error(`Search worker refused to start: ${db.message}`);}if(!runtime.search){await runtime.close();throw new Error("BLS_SEARCH_ENABLED=true and Meilisearch credentials are required for search worker");}
await runtime.search.configure();
const pollMs=positive(process.env.BLS_SEARCH_RECONCILE_MS,30_000,"BLS_SEARCH_RECONCILE_MS");const ownerId=process.env.BLS_SEARCH_WORKER_ID?.trim()||`search-worker:${hostname()}:${process.pid}`;let stopping=false;
const stop=async(signal:string)=>{if(stopping)return;stopping=true;console.log(JSON.stringify({level:"info",event:"search.worker_shutdown",signal}));await runtime.close();};process.once("SIGTERM",()=>void stop("SIGTERM"));process.once("SIGINT",()=>void stop("SIGINT"));
console.log(JSON.stringify({level:"info",event:"search.worker_started",ownerId,pollMs,schema:db.appliedSchemaVersion}));
while(!stopping){const started=Date.now();const result=await runtime.search.reconcileAll(started);console.log(JSON.stringify({level:result.failed?"error":"info",event:"search.reconcile",...result,durationMs:Date.now()-started}));await delay(pollMs);}
function positive(raw:string|undefined,fallback:number,name:string){if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${name} must be a positive integer`);return n;}function delay(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms));}
