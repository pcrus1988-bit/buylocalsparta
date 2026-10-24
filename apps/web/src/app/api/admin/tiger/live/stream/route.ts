import { requireAdminSession } from "../../../../../../lib/admin-session";
import { getTigerLiveSnapshot } from "../../../../../../lib/tiger-live";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request){
  try{await requireAdminSession(undefined,{permission:"admin.audit.read"});}
  catch(error){
    return new Response("Forbidden",{status:error instanceof Error&&error.message==="ADMIN_AUTH_REQUIRED"?401:403,
      headers:{"cache-control":"private, no-store"}});
  }
  const encoder=new TextEncoder();
  let closed=false;
  let timer:ReturnType<typeof setInterval>|undefined;
  let endTimer:ReturnType<typeof setTimeout>|undefined;
  let last="";
  const stream=new ReadableStream<Uint8Array>({
    async start(controller){
      const stop=()=>{
        if(closed)return;
        closed=true;
        if(timer)clearInterval(timer);
        if(endTimer)clearTimeout(endTimer);
        try{controller.close();}catch{/* stream may already be closed */}
      };
      request.signal.addEventListener("abort",stop,{once:true});
      const send=async()=>{
        if(closed)return;
        try{
          const snapshot=await getTigerLiveSnapshot();
          const fingerprint=JSON.stringify([snapshot.source,snapshot.cursor,snapshot.events.map(e=>e.id),snapshot.activeWorkers,snapshot.blockedTasks,snapshot.ciHealth]);
          if(fingerprint!==last){
            controller.enqueue(encoder.encode("event: snapshot\ndata: "+JSON.stringify(snapshot)+"\n\n"));
            last=fingerprint;
          }else controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }catch{if(!closed)controller.enqueue(encoder.encode("event: unavailable\ndata: {}\n\n"));}
      };
      await send();
      if(!closed)timer=setInterval(()=>{void send();},20000);
      endTimer=setTimeout(stop,55000);
    },
    cancel(){closed=true;if(timer)clearInterval(timer);if(endTimer)clearTimeout(endTimer);}
  });
  return new Response(stream,{headers:{
    "content-type":"text/event-stream; charset=utf-8",
    "cache-control":"private, no-store, no-transform","connection":"keep-alive",
    "x-accel-buffering":"no","x-robots-tag":"noindex, nofollow"
  }});
}
