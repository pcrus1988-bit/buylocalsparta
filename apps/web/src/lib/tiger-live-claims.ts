/**
 * Read-only presentation of persisted AUTOPILOT claim documents.
 * A claim is a reservation made by a Task, not a heartbeat, worker process,
 * accepted engine, or verified author attribution. No synthetic activity.
 */
export type TigerTaskAllocation={
  taskId:string;engineId:string;declaredOwner:string;
  createdAt:string;expiresAt:string;status:"allocated"|"expired";
};
const ID=/^AUTO-E(0[1-9]|1[0-9]|20)-[0-9]{2}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function utc(value:unknown):number {
  if(typeof value!=="string"||!UTC.test(value))throw new Error("TIGER_CLAIM_TIMESTAMP_INVALID");
  const time=Date.parse(value);
  if(!Number.isFinite(time)||!new Date(time).toISOString().startsWith(value.slice(0,19)))
    throw new Error("TIGER_CLAIM_TIMESTAMP_INVALID");
  return time;
}
export function parseTaskAllocation(document:unknown,filename:string,now=Date.now()):TigerTaskAllocation {
  if(!document||typeof document!=="object"||Array.isArray(document))throw new Error("TIGER_CLAIM_SHAPE_INVALID");
  const d=document as Record<string,unknown>;
  const fields=["attempt","created_at","engine","expires_at","owner","repo","status","task_id"];
  if(Object.keys(d).sort().join("|")!==fields.sort().join("|"))throw new Error("TIGER_CLAIM_FIELDS_INVALID");
  if(d.repo!=="pcrus1988-bit/Tiger-2-0"||typeof d.task_id!=="string"||!ID.test(d.task_id)||
      filename!==d.task_id+".json")throw new Error("TIGER_CLAIM_ID_INVALID");
  const engineId=d.task_id.slice(5,8);
  if(d.engine!==engineId||d.status!=="claimed"||typeof d.owner!=="string"||
      !/^A02:[a-z0-9_.:-]{4,120}$/i.test(d.owner))throw new Error("TIGER_CLAIM_ROLE_INVALID");
  if(!Number.isInteger(d.attempt)||Number(d.attempt)<1||Number(d.attempt)>3)
    throw new Error("TIGER_CLAIM_ATTEMPT_INVALID");
  const start=utc(d.created_at),expiry=utc(d.expires_at);
  if(expiry<=start||expiry-start>120*60000||start>now+300000)
    throw new Error("TIGER_CLAIM_WINDOW_INVALID");
  return {taskId:d.task_id,engineId,declaredOwner:d.owner,createdAt:d.created_at as string,
    expiresAt:d.expires_at as string,status:expiry>now?"allocated":"expired"};
}
export function inspectTaskAllocations(documents:ReadonlyArray<{filename:string;content:unknown}>,now=Date.now()):TigerTaskAllocation[] {
  if(documents.length>20)throw new Error("TIGER_CLAIM_COUNT_INVALID");
  const seen=new Set<string>();
  return documents.map(item=>{
    const claim=parseTaskAllocation(item.content,item.filename,now);
    if(seen.has(claim.taskId))throw new Error("TIGER_CLAIM_DUPLICATE");
    seen.add(claim.taskId);return claim;
  }).sort((a,b)=>a.taskId.localeCompare(b.taskId));
}
