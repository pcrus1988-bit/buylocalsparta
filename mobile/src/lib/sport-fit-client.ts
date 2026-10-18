import {validCanonicalPublicId} from "./canonical-id";
import {sportAnswerPayload,type SportAnswers} from "./sport-fit-questions";
const ENDPOINT="https://kontamou.site/api/sport-fit/candidates";

export type SportFitPreview={
 id:string;title:string;brand:string;slug:string;priceMinor:number;
 previewImageSrc:string|null;score:number;technicalScore:number;technicalCoverage:number;
 matchedSize:string|null;role:string;reasons:string[];matchProofs:{input:string;knowledge:string;proof:string}[];
 consultationSummary:string
};
export type SportFitResult={
 vendorName:string;candidateCount:number;survivingCount:number;secondaryCount:number;
 evidenceMode:"governed"|"heuristic_fallback";
 primary:SportFitPreview|null;survivors:SportFitPreview[];kit:SportFitPreview[];
 sizeGuide:{sizeLabels:string[];publisher:string;exact:boolean}|null
};
function finiteInt(value:unknown,min=0,max=100000):number{
 return typeof value==="number"&&Number.isSafeInteger(value)&&value>=min&&value<=max?value:0;
}
function text(value:unknown,max=200):string{
 return typeof value==="string"?value.replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,max):"";
}
function preview(raw:unknown):SportFitPreview|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const p=raw as Record<string,unknown>;
 if(!validCanonicalPublicId(p.id)||!text(p.title)||!Number.isSafeInteger(p.priceMinor)
   ||(p.priceMinor as number)<=0||typeof p.slug!=="string")return null;
 const src=typeof p.previewImageSrc==="string"&&
  (/^https:\/\/[^\s]+$/.test(p.previewImageSrc)||/^\/api\/[a-zA-Z0-9_/-]+$/.test(p.previewImageSrc))
  ?p.previewImageSrc:null;
 const proofs=Array.isArray(p.matchProofs)?p.matchProofs.slice(0,5).flatMap((x)=>{
  if(!x||typeof x!=="object")return [];
  const q=x as Record<string,unknown>;
  return [{input:text(q.input,160),knowledge:text(q.knowledge,160),proof:text(q.proof,300)}];
 }):[];
 return {
  id:p.id,title:text(p.title),brand:text(p.brand,90),slug:text(p.slug,160),
  priceMinor:p.priceMinor as number,previewImageSrc:src,
  score:finiteInt(p.score,0,100),technicalScore:finiteInt(p.technicalScore,0,100),
  technicalCoverage:finiteInt(p.technicalCoverage,0,100),
  matchedSize:text(p.matchedSize,30)||null,role:text(p.role,40),
  reasons:Array.isArray(p.reasons)?p.reasons.slice(0,4).map(x=>text(x,180)).filter(Boolean):[],
  matchProofs:proofs,consultationSummary:text(p.consultationSummary,500)
 };
}
function previewList(value:unknown,limit:number):SportFitPreview[]{
 if(!Array.isArray(value))return [];
 const seen=new Set<string>();
 return value.slice(0,100).flatMap(x=>{
  const p=preview(x);
  if(!p||seen.has(p.id)||seen.size>=limit)return [];
  seen.add(p.id);return [p];
 });
}
export async function getSportFitResults(answers:SportAnswers):Promise<SportFitResult>{
 const checked=sportAnswerPayload(answers);
 const response=await fetch(ENDPOINT,{
  method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
  body:JSON.stringify({answers:checked}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("FIT_SERVICE_UNAVAILABLE");
 const data=await response.json() as Record<string,unknown>;
 if(!data||typeof data!=="object"||!data.recommendation
  ||typeof data.recommendation!=="object"||!Array.isArray(data.universe))
  throw Error("INVALID_FIT_RESPONSE");
 const rec=data.recommendation as Record<string,unknown>;
 const mode=rec.finalistEvidenceMode==="governed"?"governed":"heuristic_fallback";
 const primary=preview(rec.primary);
 const universe=previewList(data.universe,48);
 const survivors=universe.length?universe:previewList(rec.ranked,48);
 if(primary&&!survivors.some(x=>x.id===primary.id))survivors.unshift(primary);
 const guide=data.sizeGuide&&typeof data.sizeGuide==="object"?data.sizeGuide as Record<string,unknown>:null;
 const sizeGuide=guide&&Array.isArray(guide.sizeLabels)?{
  sizeLabels:guide.sizeLabels.slice(0,6).map(x=>text(x,20)).filter(Boolean),
  publisher:text(guide.publisher,140),exact:guide.exact===true
 }:null;
 return {
  vendorName:text(data.vendorName,100),
  candidateCount:finiteInt(data.candidateCount,0,100000),
  survivingCount:finiteInt(data.survivingCount,0,100000),
  secondaryCount:finiteInt(data.secondaryCount,0,100000),
  evidenceMode:mode,primary:primary??survivors[0]??null,
  survivors:survivors.slice(0,48),kit:previewList(rec.kit,12),sizeGuide
 };
}
