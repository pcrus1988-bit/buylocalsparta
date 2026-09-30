import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "../packages/object-storage/src/index.ts";
import { ClamAvScanner, clamAvConfigFromEnv } from "../packages/media-processing/src/index.ts";

type WorkerMode = "continuous" | "drain";

const runtime=createPostgresRuntimeFromEnv({applicationName:"buy-local-sparta-media-worker"});
const readiness=await runtime.readiness(EXPECTED_SCHEMA_VERSION);if(!readiness.ok){await runtime.close();throw new Error(`Media worker refused to start: ${readiness.message}`)}
const storage=new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
const scanner=new ClamAvScanner(clamAvConfigFromEnv(process.env));
const storageReady=await storage.readiness();if(!storageReady.ok){await runtime.close();throw new Error(`Media worker object storage unavailable: ${storageReady.message}`)}
if(!await scanner.ping()){await runtime.close();throw new Error("Media worker ClamAV PING failed")}
const workerId=process.env.BLS_MEDIA_WORKER_ID?.trim()||`media-worker:${hostname()}:${process.pid}`;
const pollMs=positiveInt(process.env.BLS_MEDIA_WORKER_POLL_MS,5000,"BLS_MEDIA_WORKER_POLL_MS");
const mode=workerMode(process.env.BLS_MEDIA_WORKER_MODE);
const maxItems=positiveInt(process.env.BLS_MEDIA_WORKER_MAX_ITEMS,50,"BLS_MEDIA_WORKER_MAX_ITEMS");
const maxRuntimeMs=positiveInt(process.env.BLS_MEDIA_WORKER_MAX_RUNTIME_MS,210_000,"BLS_MEDIA_WORKER_MAX_RUNTIME_MS");
const startedAt=Date.now();
let processed=0;
let stopping=false;
const requestStop=()=>{stopping=true};
process.once("SIGTERM",requestStop);
process.once("SIGINT",requestStop);
console.log(JSON.stringify({level:"info",event:"media_worker.started",workerId,schema:readiness.appliedSchemaVersion,mode,maxItems:mode==="drain"?maxItems:undefined,maxRuntimeMs:mode==="drain"?maxRuntimeMs:undefined}));
try{
  while(!stopping){
    if(mode==="drain"&&(processed>=maxItems||Date.now()-startedAt>=maxRuntimeMs))break;
    const expired=await runtime.mediaPipeline.expireUploadIntents(Date.now());for(const key of expired.objectKeys)await storage.delete(key).catch(()=>undefined);if(expired.count)console.log(JSON.stringify({level:"info",event:"media_worker.expired_upload_intents",count:expired.count}));
    const lease=await runtime.mediaPipeline.claimNextScan({workerId,now:Date.now()});
    if(!lease){if(mode==="drain")break;await delay(pollMs);continue}
    processed+=1;
    try{
      const source=await storage.read(lease.objectKey);let bytes=0;const hash=createHash("sha256");
      async function* observed(){for await(const raw of source.stream){const chunk=Buffer.from(raw);bytes+=chunk.length;hash.update(chunk);yield chunk}}
      const result=await scanner.scan(observed());const sha256=hash.digest("hex");
      if(bytes!==lease.expectedByteSize)throw new Error(`Stored object size changed after verification (${bytes} != ${lease.expectedByteSize})`);
      if(result.status==="infected"){
        await runtime.mediaPipeline.finishScan({workerId,assetId:lease.assetId,status:"infected",sha256,reason:`Malware detected${result.signature?`: ${result.signature}`:""}`,now:Date.now()});
        await storage.delete(lease.objectKey).catch(()=>undefined);
        console.error(JSON.stringify({level:"error",event:"media_worker.infected",assetId:lease.assetId,signature:result.signature}));
      }else{
        const verifiedKey=`private/verified-media/${lease.assetId}/${sha256}`;
        const verified=await storage.promoteVerified({sourceKey:lease.objectKey,verifiedKey,sourceEtag:source.etag});
        if(verified.byteSize!==bytes)throw new Error("Verified media copy size does not match scanned object");
        await runtime.mediaPipeline.finishScan({workerId,assetId:lease.assetId,status:"clean",sha256,verifiedObjectKey:verifiedKey,now:Date.now()});
        await storage.delete(lease.objectKey).catch(()=>undefined);
        console.log(JSON.stringify({level:"info",event:"media_worker.clean",assetId:lease.assetId,bytes}));
      }
    }catch(error){
      const now=Date.now(),retryAt=lease.attempt>=5?undefined:now+Math.min(60*60*1000,60_000*2**Math.max(0,lease.attempt-1));
      await runtime.mediaPipeline.finishScan({workerId,assetId:lease.assetId,status:"failed",reason:error instanceof Error?error.message:String(error),now,retryAt}).catch((failure)=>console.error(JSON.stringify({level:"error",event:"media_worker.persist_failure",assetId:lease.assetId,message:failure instanceof Error?failure.message:String(failure)})));
      console.error(JSON.stringify({level:"error",event:"media_worker.scan_failed",assetId:lease.assetId,attempt:lease.attempt,retryAt,message:error instanceof Error?error.message:String(error)}));
    }
  }
}finally{
  await runtime.close();
  console.log(JSON.stringify({level:"info",event:"media_worker.stopped",workerId,mode,processed,elapsedMs:Date.now()-startedAt}));
}
function workerMode(raw:string|undefined):WorkerMode{const value=raw?.trim()||"continuous";if(value==="continuous"||value==="drain")return value;throw new Error("BLS_MEDIA_WORKER_MODE must be continuous or drain")}
function positiveInt(raw:string|undefined,fallback:number,name:string){if(!raw?.trim())return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${name} must be a positive integer`);return n}
function delay(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms))}
