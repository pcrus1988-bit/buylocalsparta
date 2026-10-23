/**
 * Product-origin-neutral similarity CANDIDATES. An inferred candidate is not
 * a confirmed substitution, product family, EAN or saving.
 */
const stops=new Set(["και","με","σε","απο","του","της","των","για","χωρις","εως","μεχρι","συσκευασια","συσκευασιες","τεμαχια","τεμ","gr","kg","ml","lt","l","g","pack","pcs","the","and","with","from","size","up","to","store","fresh"]);
const normalized=x=>String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export const compareSearchTokens=value=>[...new Set(normalized(value).split(/\s+/).filter(x=>x.length>2&&!stops.has(x)&&!/^\d+$/.test(x)))];
const scorePair=(left,right)=>{
  const a=compareSearchTokens(left),b=compareSearchTokens(right);
  if(!a.length||!b.length)return 0;
  let shared=0;
  const used=new Set();
  for(const t of a){const at=b.findIndex((s,i)=>!used.has(i)&&(s===t||(s.length>5&&t.length>5&&s.slice(0,-1)===t.slice(0,-1))));
    if(at>=0){used.add(at);shared++}}
  if(!shared)return 0;
  if(a.length>2&&b.length>2&&shared<2)return 0;
  return 2*shared/(a.length+b.length);
};
export function discoverSourceNeutralCandidates({source,candidates,approvedGroups=[],limit=8}){
  if(!source||!Array.isArray(candidates)||!Array.isArray(approvedGroups)||!Number.isInteger(limit)||limit<1||limit>30)
    throw Error("Invalid comparison input");
  const reviewed=new Set(approvedGroups.filter(g=>g?.status==="approved"&&Array.isArray(g.memberIds)&&g.memberIds.includes(source.id))
    .flatMap(g=>g.memberIds));
  const seen=new Set(),result=[];
  for(const p of candidates){
    if(!p||typeof p.id!=="string"||p.id===source.id||seen.has(p.id)||typeof p.name!=="string")continue;
    seen.add(p.id);
    const reviewedMatch=source.origin==="posokanei"&&p.origin==="posokanei"&&reviewed.has(p.id);
    const score=scorePair(source.name,p.name);
    if(!reviewedMatch&&score<0.48)continue;
    const differentBrand=!!normalized(source.brand)&&!!normalized(p.brand)&&normalized(source.brand)!==normalized(p.brand);
    result.push({id:p.id,origin:p.origin,storeKey:p.storeKey??null,name:p.name,brand:p.brand??null,
      priceEur:typeof p.priceEur==="number"&&p.priceEur>0?p.priceEur:null,
      matchingEvidence:reviewedMatch?"approved_group":"name_overlap",
      confidence:reviewedMatch?"reviewed_equivalent":"requires_review",
      score:Math.round(score*100),differentBrand,
      unit:p.unit??null,quantity:p.quantity??null,
      priceComparisonAvailable:reviewedMatch&&!!source.quantity&&!!p.quantity&&source.unit===p.unit});
  }
  result.sort((a,b)=>(a.confidence==="reviewed_equivalent"?0:1)-(b.confidence==="reviewed_equivalent"?0:1)||
    Number(b.differentBrand)-Number(a.differentBrand)||b.score-a.score||
    a.name.localeCompare(b.name,"el"));
  return result.slice(0,limit);
}
